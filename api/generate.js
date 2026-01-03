
const axios = require("axios");

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { prompt, keys } = req.body; // 'keys' adalah array dari frontend

    if (!prompt) return res.status(400).json({ status: false, msg: "Prompt kosong!" });

    try {
        let headers = {};
        
        // Logika Key Rotation: Jika ada keys, pilih satu secara acak
        if (keys && Array.isArray(keys) && keys.length > 0) {
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            headers["Authorization"] = `Bearer ${randomKey.trim()}`;
        }

        const seed = Math.floor(Math.random() * 1000000);
        // Endpoint Pollinations
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&width=1024&height=1024&model=flux&nologo=true`;

        const response = await axios.get(imageUrl, {
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 25000 
        });

        const base64 = Buffer.from(response.data, 'binary').toString('base64');

        res.status(200).json({
            status: true,
            result_url: `data:image/jpeg;base64,${base64}`,
            using_key: !!headers["Authorization"]
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ 
            status: false, 
            msg: error.response?.status === 401 ? "Salah satu API Key tidak valid!" : "Server AI penuh/Error." 
        });
    }
};
