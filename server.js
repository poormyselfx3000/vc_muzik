const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const jobs = {};

app.post('/api/start-download', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiếu URL' });

    const batchId = Date.now().toString();
    const batchDir = path.join(DOWNLOAD_DIR, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    jobs[batchId] = { status: 'running', error: null };

    // Tối ưu yt-dlp hỗ trợ EJS tự động tải giải mã N-challenge từ GitHub
    const ytArgs = [
        '-x', 
        '--audio-format', 'mp3', 
        '--yes-playlist',
        '-i',
        '--js-runtimes', 'node',
        '--remote-components', 'ejs:github',              // Cấu hình tải EJS scripts giải mã N-challenge
        '--extractor-args', 'youtube:player_client=web_embedded,web', // Client tương thích EJS tốt nhất
        '--sleep-requests', '1',
        '--concurrent-fragments', '4',
        '-o', `${batchDir}/%(title)s.%(ext)s`,
        url.trim()
    ];

    if (fs.existsSync('cookies.txt')) {
        ytArgs.push('--cookies', 'cookies.txt');
        console.log(`[Batch ${batchId}] Đã áp dụng cookies.txt`);
    }

    const ytDlp = spawn('yt-dlp', ytArgs);

    ytDlp.stdout.on('data', (data) => console.log(`[Batch ${batchId}] ${data.toString().trim()}`));
    ytDlp.stderr.on('data', (data) => console.error(`[Batch ${batchId}] Lỗi/Cảnh báo: ${data.toString().trim()}`));

    ytDlp.on('close', (code) => {
        console.log(`[Batch ${batchId}] Hoàn thành tác vụ với mã ${code}`);
        jobs[batchId].status = code === 0 ? 'completed' : 'error';
        if (code !== 0) jobs[batchId].error = 'Có lỗi trong quá trình tải từ YouTube.';
    });

    res.json({ batchId });
});

app.get('/api/status/:batchId', (req, res) => {
    const { batchId } = req.params;
    const job = jobs[batchId];
    if (!job) return res.status(404).json({ error: 'Không tìm thấy ID tải này' });

    const batchDir = path.join(DOWNLOAD_DIR, batchId);
    let files = [];
    if (fs.existsSync(batchDir)) {
        files = fs.readdirSync(batchDir).filter(f => f.endsWith('.mp3'));
    }

    res.json({
        status: job.status,
        error: job.error,
        files: files.map(f => ({
            name: f,
            url: `/music/${batchId}/${encodeURIComponent(f)}`
        }))
    });
});

app.delete('/api/delete-file', (req, res) => {
    const { batchId, fileName } = req.body;
    const filePath = path.join(DOWNLOAD_DIR, batchId, fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    res.json({ success: true });
});

setInterval(() => {
    const now = Date.now();
    if (fs.existsSync(DOWNLOAD_DIR)) {
        const dirs = fs.readdirSync(DOWNLOAD_DIR);
        for (const d of dirs) {
            const dirPath = path.join(DOWNLOAD_DIR, d);
            const stats = fs.statSync(dirPath);
            if (now - stats.mtimeMs > 2 * 60 * 60 * 1000) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                delete jobs[d];
            }
        }
    }
}, 60 * 60 * 1000);

app.use('/music', express.static(DOWNLOAD_DIR));

const PORT = 3000;
app.listen(PORT, () => console.log(`Server Music tải tốc độ cao đang chạy ở cổng ${PORT}`));