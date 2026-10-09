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

// Bộ nhớ tạm lưu trạng thái các tiến trình đang tải
const jobs = {};

// API 1: Bắt đầu tiến trình tải ngầm từ YouTube
app.post('/api/start-download', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiếu URL' });

    const batchId = Date.now().toString();
    const batchDir = path.join(DOWNLOAD_DIR, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    jobs[batchId] = { status: 'running', error: null };

    // Tối ưu danh sách tham số yt-dlp
    const ytArgs = [
        '-x', 
        '--audio-format', 'mp3', 
        '--yes-playlist',
        '-i',                               // Bỏ qua bài lỗi, tải tiếp các bài khác
        '--js-runtimes', 'node',            // Tránh lỗi thiếu JS engine
        '--extractor-args', 'youtube:player_client=tv_embedded,mweb,android,ios', 
        '--sleep-requests', '1',            // Nghỉ 1s giữa các bài để tránh bị YouTube chặn
        '--concurrent-fragments', '4',      // Tải 4 luồng song song
        '-o', `${batchDir}/%(title)s.%(ext)s`,
        url.trim()
    ];

    // Tự động sử dụng cookies.txt nếu có
    if (fs.existsSync('cookies.txt')) {
        ytArgs.push('--cookies', 'cookies.txt');
        console.log(`[Batch ${batchId}] Đã phát hiện và áp dụng cookies.txt`);
    }

    const ytDlp = spawn('yt-dlp', ytArgs);

    ytDlp.stdout.on('data', (data) => {
        console.log(`[Batch ${batchId}] ${data.toString().trim()}`);
    });

    ytDlp.stderr.on('data', (data) => {
        console.error(`[Batch ${batchId}] Lỗi/Cảnh báo: ${data.toString().trim()}`);
    });

    ytDlp.on('close', (code) => {
        console.log(`[Batch ${batchId}] Hoàn thành tác vụ với mã ${code}`);
        jobs[batchId].status = code === 0 ? 'completed' : 'error';
        if (code !== 0) {
            jobs[batchId].error = 'Có lỗi trong quá trình tải từ YouTube.';
        }
    });

    // Trả về batchId ngay lập tức để phía trình duyệt/điện thoại không bị timeout
    res.json({ batchId });
});

// API 2: Kiểm tra tiến độ và danh sách file đã tải xong
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

// API 3: Xóa file trên server sau khi thiết bị đã kéo về thành công
app.delete('/api/delete-file', (req, res) => {
    const { batchId, fileName } = req.body;
    const filePath = path.join(DOWNLOAD_DIR, batchId, fileName);
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Dọn rác] Đã xóa: ${fileName}`);
    }
    res.json({ success: true });
});

// Tự động dọn dẹp các thư mục tải thừa bị bỏ quên quá 2 tiếng
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
app.listen(PORT, () => {
    console.log(`Server Music tải tốc độ cao đang chạy ở cổng ${PORT}`);
});