
const axios = require("axios");

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ msg: 'Method Not Allowed' });

    const { prompt, width, height, seed, model } = req.body;

    if (!prompt) return res.status(400).json({ status: false, msg: "Prompt harus diisi" });

    try {
        // Membersihkan prompt dari karakter aneh
        const cleanPrompt = encodeURIComponent(prompt);
        const randomSeed = seed || Math.floor(Math.random() * 999999);
        const w = width || 1024;
        const h = height || 1024;
        
        // Kita gunakan Pollinations AI (Tanpa Auth, Tanpa Cloudflare)
        // Mendukung berbagai model: flux, realism, anime, dll
        const imageUrl = `https://pollinations.ai/p/${cleanPrompt}?width=${w}&height=${h}&seed=${randomSeed}&model=${model || 'flux'}&nologo=true`;

        // Kita kirimkan URL gambarnya ke frontend
        res.status(200).json({ 
            status: true, 
            result_url: imageUrl,
            info: { prompt, seed: randomSeed, model: model || 'flux' }
        });

    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
};
