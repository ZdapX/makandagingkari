
const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { prompt, imageBase64, mode } = req.body;

    try {
        const identity = uuidv4();
        
        // 1. Dapatkan list domain email temp-mail yang tersedia
        const { data: domains } = await axios.get("https://api.internal.temp-mail.io/api/v3/domains");
        const selectedDomain = domains[Math.floor(Math.random() * domains.length)].name;
        
        const randName = `user_${Math.random().toString(36).substring(2, 8)}`;
        const { data: temp } = await axios.post("https://api.internal.temp-mail.io/api/v3/email/new", {
            name: randName,
            domain: selectedDomain
        });

        const email = temp.email;
        const password = `Admin@${crypto.randomBytes(3).toString("hex")}123`;

        // 2. Bypass Cloudflare
        const { data: bypass } = await axios.post("https://api.nekolabs.web.id/tools/bypass/cf-turnstile", {
            url: "https://supawork.ai/app",
            siteKey: "0x4AAAAAACBjrLhJyEE6mq1c"
        });

        if (!bypass?.result) throw new Error("CF Bypass Failed");

        const instHead = axios.create({
            baseURL: "https://supawork.ai/supawork/headshot/api",
            headers: { "x-identity-id": identity, "user-agent": "Mozilla/5.0" }
        });

        const { data: chall } = await instHead.get("/sys/challenge/token", {
            headers: { "x-auth-challenge": bypass.result }
        });
        const challengeToken = chall?.data?.challenge_token;

        // 3. Register
        const instReg = axios.create({
            baseURL: "https://supawork.ai/supawork/api",
            headers: { "x-identity-id": identity, "x-auth-challenge": challengeToken }
        });

        const reg = await instReg.post("/user/register", { 
            email, password, route_path: "/app", user_type: 1 
        });
        const credential = reg?.data?.data?.credential;

        // 4. Cek OTP (Interval dipercepat agar tidak kena timeout Vercel)
        let otp = null;
        for (let i = 0; i < 10; i++) { // Cek selama 20 detik
            await delay(2000);
            const { data: mails } = await axios.get(`https://api.internal.temp-mail.io/api/v3/email/${email}/messages`);
            if (mails && mails.length > 0) {
                // Cari angka 4-6 digit di body email
                const match = mails[0].body_text.match(/\b\d{4,6}\b/);
                if (match) {
                    otp = match[0];
                    break;
                }
            }
        }

        if (!otp) throw new Error(`OTP tidak terkirim ke ${email}. Coba lagi.`);

        // 5. Verify & Login
        await instReg.post("/user/register/code/verify", { email, password, register_code: otp, credential, route_path: "/app" });
        const login = await instReg.post("/user/login/password", { email, password });
        const token = login?.data?.data?.token;

        // 6. Generate Logic (Mode Text atau Image)
        const identity2 = uuidv4();
        const instGen = axios.create({
            baseURL: "https://supawork.ai/supawork/headshot/api",
            headers: { "authorization": token, "x-identity-id": identity2 }
        });

        let payload = {
            identity_id: identity2,
            custom_prompt: prompt,
            currency_type: "gold"
        };

        if (mode === 'image' && imageBase64) {
            const bufferImage = Buffer.from(imageBase64.split(',')[1], 'base64');
            const { data: up } = await instGen.get("/sys/oss/token", { params: { f_suffix: "png", get_num: 1, unsafe: 1 } });
            await axios.put(up.data[0].put, bufferImage);
            
            payload.aigc_app_code = "image_to_image_generator";
            payload.model_code = "google_nano_banana";
            payload.image_urls = [up.data[0].get];
            payload.aspect_ratio = "match_input_image";
        } else {
            payload.aigc_app_code = "text_to_image_generator";
            payload.model_code = "flux_1_dev";
            payload.aspect_ratio = "1:1";
        }

        // Bypass untuk Generate
        const { data: cfGen } = await axios.post("https://api.nekolabs.web.id/tools/bypass/cf-turnstile", {
            url: "https://supawork.ai/app", siteKey: "0x4AAAAAACBjrLhJyEE6mq1c"
        });
        const { data: tGen } = await instGen.get("/sys/challenge/token", { headers: { "x-auth-challenge": cfGen.result } });

        await instGen.post("/media/image/generator", payload, { headers: { "x-auth-challenge": tGen.data.challenge_token } });

        // 7. Polling Hasil
        let resultUrl = null;
        for (let j = 0; j < 10; j++) {
            await delay(2000);
            const { data } = await instGen.get("/media/aigc/result/list/v1", { params: { page_no: 1, page_size: 10, identity_id: identity2 } });
            const item = data?.data?.list?.[0]?.list?.[0];
            if (item?.status === 1) { resultUrl = item.url; break; }
        }

        if (!resultUrl) throw new Error("Gagal mengambil hasil AI. Timeout.");

        res.status(200).json({ status: true, result_url: resultUrl });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ status: false, msg: error.message });
    }
};
