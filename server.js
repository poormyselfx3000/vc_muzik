const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Bộ nhớ tạm lưu trạng thái các tiến trình đang tải
const jobs = {};

// API 1: Bắt đầu tiến trình tải (Không bắt trình duyệt chờ)
app.post('/api/start-download', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiếu URL' });

    const batchId = Date.now().toString();
    const batchDir = path.join(DOWNLOAD_DIR, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    jobs[batchId] = { status: 'running', error: null };

    // Giải quyết Điểm nghẽn 3: Dùng spawn thay cho exec để không bị tràn bộ nhớ đệm
    const ytDlp = spawn('yt-dlp', [
        '-x', 
        '--audio-format', 'mp3', 
        '--yes-playlist',
        '-o', `${batchDir}/%(title)s.%(ext)s`,
        url
    ]);

    // Lắng nghe log ngầm (bạn có thể xem trên Terminal của Codespaces)
    ytDlp.stdout.on('data', (data) => console.log(`[Batch ${batchId}] ${data.toString().trim()}`));
    ytDlp.stderr.on('data', (data) => console.error(`[Batch ${batchId}] Lỗi/Cảnh báo: ${data.toString().trim()}`));

    ytDlp.on('close', (code) => {
        console.log(`[Batch ${batchId}] yt-dlp hoàn thành tác vụ với mã ${code}`);
        jobs[batchId].status = code === 0 ? 'completed' : 'error';
        if (code !== 0) jobs[batchId].error = 'Có lỗi trong quá trình tải từ YouTube.';
    });

    // Trả về mã ID ngay lập tức để điện thoại không bị Timeout
    res.json({ batchId });
});

// API 2: Báo cáo bài nào đã xong để điện thoại kéo về
app.get('/api/status/:batchId', (req, res) => {
    const { batchId } = req.params;
    const job = jobs[batchId];
    if (!job) return res.status(404).json({ error: 'Không tìm thấy ID tải này' });

    const batchDir = path.join(DOWNLOAD_DIR, batchId);
    let files = [];
    
    // Quét thư mục xem yt-dlp đã convert xong file .mp3 nào chưa
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

// API 3: Xóa file sau khi điện thoại báo đã kéo thành công (Giải quyết Điểm nghẽn 2)
app.delete('/api/delete-file', (req, res) => {
    const { batchId, fileName } = req.body;
    const filePath = path.join(DOWNLOAD_DIR, batchId, fileName);
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // Xóa file MP3
        console.log(`[Dọn rác] Đã xóa: ${fileName}`);
    }
    res.json({ success: true });
});

// Chức năng tự động dọn dẹp các thư mục thừa bị bỏ quên sau 2 tiếng
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
}, 60 * 60 * 1000); // Quét mỗi tiếng một lần

app.use('/music', express.static(DOWNLOAD_DIR));

const PORT = 3000;
app.listen(PORT, () => console.log(`Server Music tải tốc độ cao đang chạy ở cổng ${PORT}`));