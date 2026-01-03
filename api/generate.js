
const axios = require("axios");

module.exports = async (req, res) => {
    // Header CORS agar bisa diakses frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ status: false, msg: "Prompt kosong!" });

    try {
        const seed = Math.floor(Math.random() * 1000000);
        // Kita pakai model 'flux' karena paling bagus dan cepat
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&width=1024&height=1024&model=flux&nologo=true`;

        // Backend mendownload gambar (Proses ini biasanya 5-10 detik)
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000 // Batas nunggu 15 detik
        });

        // Ubah hasil download menjadi Base64
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        const finalImage = `data:image/jpeg;base64,${base64}`;

        res.status(200).json({
            status: true,
            result_url: finalImage
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ status: false, msg: "Server AI sedang penuh, coba lagi klik Generate." });
    }
};
