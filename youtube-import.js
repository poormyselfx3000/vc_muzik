import { addFiles } from "./music.js";

const SERVER_STORAGE_KEY = "codespace_server_url";
const buttonAdd = document.getElementById("youtube-add");
const buttonKey = document.getElementById("youtube-key");

let importing = false;

function status(text, error = false) {
    const node = document.getElementById("music-status");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("error", error);
}

function getServerUrl() {
    return localStorage.getItem(SERVER_STORAGE_KEY);
}

function setupServerUrl() {
    const currentUrl = getServerUrl() || "";
    const newUrl = prompt("Nhập đường link Public Port 3000 từ Codespaces:", currentUrl);
    if (newUrl === null) return currentUrl;

    const trimmed = newUrl.trim().replace(/\/+$/, "");
    if (trimmed) {
        localStorage.setItem(SERVER_STORAGE_KEY, trimmed);
        status("Đã lưu Server Codespaces URL!");
        return trimmed;
    } else {
        localStorage.removeItem(SERVER_STORAGE_KEY);
        status("Đã xóa Server URL.", true);
        return null;
    }
}

async function importYouTube() {
    if (importing) return;

    let serverUrl = getServerUrl();
    if (!serverUrl) {
        serverUrl = setupServerUrl();
        if (!serverUrl) {
            status("Bạn cần nhập Server URL để tải nhạc.", true);
            return;
        }
    }

    const url = prompt("Dán link Video lẻ hoặc Playlist YouTube (hỗ trợ hàng trăm bài):");
    if (!url) return;

    importing = true;
    buttonAdd.disabled = true;

    try {
        status("Đang gửi lệnh tải cho Codespaces...");

        // Bước 1: Gửi lệnh bắt đầu tải ngầm
        const startRes = await fetch(`${serverUrl}/api/start-download`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url.trim() }),
        });

        if (!startRes.ok) throw new Error("Không thể kết nối Server Codespaces");
        const { batchId } = await startRes.json();

        // Bước 2: Vòng lặp Polling (kiểm tra tiến độ liên tục)
        let isDone = false;
        let downloadedFiles = new Set();
        let successCount = 0;

        while (!isDone) {
            const statusRes = await fetch(`${serverUrl}/api/status/${batchId}`);
            if (!statusRes.ok) continue; // Nếu lỗi mạng tạm thời thì lướt qua chờ lượt sau
            
            const data = await statusRes.json();

            // Quét các file mới mà server báo là đã xong
            for (const file of data.files) {
                if (!downloadedFiles.has(file.name)) {
                    downloadedFiles.add(file.name); // Đánh dấu là đang tải
                    status(`Đang kéo về điện thoại: ${file.name}`);

                    try {
                        // Tải file về điện thoại
                        const fileRes = await fetch(`${serverUrl}${file.url}`);
                        if (fileRes.ok) {
                            const blob = await fileRes.blob();
                            const newFile = new File([blob], file.name, { type: "audio/mpeg" });
                            
                            await addFiles([newFile]); // Lưu vào kho web
                            successCount++;

                            // Kéo xong thì gọi API ra lệnh cho Server xóa file gốc (Dọn rác ổ cứng)
                            fetch(`${serverUrl}/api/delete-file`, {
                                method: 'DELETE',
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ batchId, fileName: file.name })
                            }).catch(e => console.log("Lỗi khi xóa file trên server", e));
                        }
                    } catch (err) {
                        console.error(`Lỗi kéo bài ${file.name}:`, err);
                    }
                }
            }

            // Kiểm tra xem tiến trình ngầm trên Server đã dứt điểm chưa
            if (data.status === 'completed' || data.status === 'error') {
                isDone = true;
                if (data.status === 'error' && successCount === 0) {
                    throw new Error(data.error || "Playlist bị chặn hoặc lỗi tải.");
                }
                break; // Thoát vòng lặp
            }

            status(`Codespaces đang cào playlist... (Đã tải ${successCount} bài)`);
            // Nghỉ 3 giây trước khi hỏi lại Server
            await new Promise(r => setTimeout(r, 3000));
        }

        status(`Hoàn tất tuyệt đối! Đã kéo thành công ${successCount} bài.`);
    } catch (error) {
        console.error(error);
        status(`Lỗi: ${error.message}. Kiểm tra lại Codespaces!`, true);
    } finally {
        importing = false;
        buttonAdd.disabled = false;
    }
}

if (buttonAdd) buttonAdd.addEventListener("click", importYouTube);
if (buttonKey) buttonKey.addEventListener("click", setupServerUrl);