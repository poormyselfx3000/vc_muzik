const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Hàm dọn dẹp thư mục sau 30 phút
function autoCleanUp(directoryPath) {
    setTimeout(() => {
        if (fs.existsSync(directoryPath)) {
            fs.rm(directoryPath, { recursive: true, force: true }, (err) => {
                if (err) {
                    console.error(`[Lỗi dọn dẹp] Không thể xóa ${directoryPath}:`, err);
                } else {
                    console.log(`[Dọn dẹp] Đã xóa thành công thư mục rác: ${directoryPath}`);
                }
            });
        }
    }, 30 * 60 * 1000); // 30 phút (tính bằng mili-giây)
}

// Cách dùng: Gọi hàm này khi tiến trình ytDlp hoàn thành (sự kiện 'close')
// autoCleanUp(batchDir);


// 1. Khởi tạo mảng tham số tối ưu triệt để
const ytArgs = [
    '-x', 
    '--audio-format', 'mp3', 
    '--yes-playlist',
    '-i',                               // (Ignore errors) Bỏ qua bài lỗi, tải tiếp các bài khác
    '--js-runtimes', 'node',            // Tránh lỗi thiếu JS engine
    '--cookies', 'cookies.txt',         // Bắt buộc để lách Bot Check trên Codespaces
    
    // TỐI ƯU HÓA CHỐNG CHẶN:
    '--extractor-args', 'youtube:player_client=tv_embedded,mweb,android,ios', 
    '--sleep-requests', '1',            // Nghỉ 1 giây giữa các bài trong playlist để tránh bị YouTube đánh dấu spam request
    
    // TỐI ƯU HÓA TỐC ĐỘ:
    '--concurrent-fragments', '4',      // Tải 4 luồng cùng lúc (Codespaces mạng rất mạnh nên dùng cái này tải cực nhanh)
    
    '-o', `${batchDir}/%(title)s.%(ext)s`,
    url
];

// 2. Tự động kiểm tra: Nếu có file cookies.txt thì sẽ dùng ngay để vượt rào 100%
if (fs.existsSync('cookies.txt')) {
    ytArgs.push('--cookies', 'cookies.txt');
    console.log('-> Đã phát hiện và áp dụng cookies.txt');
}

// 3. Thực thi lệnh
const ytDlp = spawn('yt-dlp', ytArgs);


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
        '-i',
        '--cookies', 'cookies.txt', // <--- TRUYỀN COOKIES ĐỂ XÁC MINH KHÔNG PHẢI BOT
        '--js-runtimes', 'node',
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