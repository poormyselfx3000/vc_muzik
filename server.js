const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

app.post('/api/download', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiếu URL YouTube' });

    const fileId = Date.now().toString();
    const outputPath = path.join(DOWNLOAD_DIR, `${fileId}.mp3`);

    // Lệnh yt-dlp chuyển đổi nhạc chất lượng cao
    const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}" "${url}"`;

    console.log(`Đang xử lý link: ${url}`);
    exec(command, (error) => {
        if (error) {
            console.error('Lỗi yt-dlp:', error);
            return res.status(500).json({ error: 'Không thể tải nhạc từ link này.' });
        }
        
        console.log('Tải hoàn tất!');
        res.json({ 
            message: 'Thành công', 
            fileUrl: `/music/${fileId}.mp3` 
        });
    });
});

app.use('/music', express.static(DOWNLOAD_DIR));

const PORT = 3000;
app.listen(PORT, () => console.log(`Server đang chạy trên cổng ${PORT}`));