
const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const delay = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { prompt, imageBase64 } = req.body;

    if (!prompt || !imageBase64) {
        return res.status(400).json({ status: false, msg: "Prompt dan Gambar wajib diisi" });
    }

    try {
        // Convert base64 string to buffer
        const bufferImage = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');

        const rand = Math.random().toString(36).substring(2, 10);
        const name = `BagusApi_${rand}`;
        
        // 1. Create Temp Email
        const { data: temp } = await axios.post(
            "https://api.internal.temp-mail.io/api/v3/email/new",
            { name, domain: "ozsaip.com" },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Application-Name": "web",
                    "Application-Version": "4.0.0",
                    "X-CORS-Header": "iaWg3pchvFx48fY"
                }
            }
        );

        const email = temp.email;
        const password = `BagusApi_${crypto.randomBytes(5).toString("hex")}A1!`;

        // 2. Bypass Cloudflare
        const { data: bypass } = await axios.post(
            "https://api.nekolabs.web.id/tools/bypass/cf-turnstile",
            { url: "https://supawork.ai/app", siteKey: "0x4AAAAAACBjrLhJyEE6mq1c" }
        );

        if (!bypass?.result) throw new Error("CF bypass failed");

        const cfToken = bypass.result;
        const identity = uuidv4();
        const instHead = axios.create({
            baseURL: "https://supawork.ai/supawork/headshot/api",
            headers: {
                authorization: "null",
                origin: "https://supawork.ai/",
                referer: "https://supawork.ai/app",
                "user-agent": "Mozilla/5.0",
                "x-identity-id": identity
            }
        });

        const { data: chall } = await instHead.get("/sys/challenge/token", {
            headers: { "x-auth-challenge": cfToken }
        });

        const challengeToken = chall?.data?.challenge_token;
        if (!challengeToken) throw new Error("Challenge token failed");

        const instReg = axios.create({
            baseURL: "https://supawork.ai/supawork/api",
            headers: {
                origin: "https://supawork.ai/",
                referer: "https://supawork.ai/app",
                "user-agent": "Mozilla/5.0",
                "x-identity-id": identity,
                "x-auth-challenge": challengeToken
            }
        });

        // 3. Register
        const reg = await instReg.post("/user/register", {
            email, password, register_code: "", credential: null, route_path: "/app", user_type: 1
        });

        const credential = reg?.data?.data?.credential;
        if (!credential) throw new Error("Credential missing");

        // 4. Get OTP (Retry Loop)
        let otp = null;
        for (let i = 0; i < 20; i++) { // Limit 20x to avoid vercel timeout
            const { data: mails } = await axios.get(`https://api.internal.temp-mail.io/api/v3/email/${email}/messages`);
            if (Array.isArray(mails) && mails.length) {
                const match = mails[0].body_text.match(/\b\d{4,6}\b/);
                if (match) { otp = match[0]; break; }
            }
            await delay(2000);
        }

        if (!otp) throw new Error("OTP timeout");

        await instReg.post("/user/register/code/verify", {
            email, password, register_code: otp, credential, route_path: "/app"
        });

        const login = await instReg.post("/user/login/password", { email, password });
        const token = login?.data?.data?.token;

        // 5. Image Generation Logic
        const identity2 = uuidv4();
        const instGen = axios.create({
            baseURL: "https://supawork.ai/supawork/headshot/api",
            headers: {
                authorization: token,
                origin: "https://supawork.ai/",
                referer: "https://supawork.ai/nano-banana",
                "user-agent": "Mozilla/5.0",
                "x-identity-id": identity2
            }
        });

        const { data: up } = await instGen.get("/sys/oss/token", { params: { f_suffix: "png", get_num: 1, unsafe: 1 } });
        const imgObj = up?.data?.[0];
        await axios.put(imgObj.put, bufferImage);

        const { data: cf2 } = await axios.post("https://api.nekolabs.web.id/tools/bypass/cf-turnstile", { 
            url: "https://supawork.ai/nano-banana", siteKey: "0x4AAAAAACBjrLhJyEE6mq1c" 
        });

        const { data: t } = await instGen.get("/sys/challenge/token", { headers: { "x-auth-challenge": cf2.result } });
        
        const { data: task } = await instGen.post("/media/image/generator", {
            identity_id: identity2,
            aigc_app_code: "image_to_image_generator",
            model_code: "google_nano_banana",
            custom_prompt: prompt,
            aspect_ratio: "match_input_image",
            currency_type: "gold",
            image_urls: [imgObj.get]
        }, { headers: { "x-auth-challenge": t.data.challenge_token } });

        // 6. Wait Result
        let resultUrl = null;
        for (let j = 0; j < 15; j++) {
            const { data } = await instGen.get("/media/aigc/result/list/v1", { params: { page_no: 1, page_size: 10, identity_id: identity2 } });
            const item = data?.data?.list?.[0]?.list?.[0];
            if (item?.status === 1) { resultUrl = item.url; break; }
            await delay(2000);
        }

        res.status(200).json({ status: true, result_url: resultUrl });

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, msg: error.message });
    }
}
