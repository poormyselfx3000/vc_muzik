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
    const newUrl = prompt(
        "Nhập đường link Public Port 3000 từ Codespaces của bạn:",
        currentUrl
    );

    if (newUrl === null) return currentUrl;

    const trimmed = newUrl.trim().replace(/\/+$/, ""); // Xóa dấu / ở cuối nếu có
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

    // 1. Kiểm tra URL Server Codespaces
    let serverUrl = getServerUrl();
    if (!serverUrl) {
        serverUrl = setupServerUrl();
        if (!serverUrl) {
            status("Bạn cần nhập Server Codespaces URL để tải nhạc.", true);
            return;
        }
    }

    // 2. Nhập link YouTube
    const url = prompt("Dán link YouTube (Playlist hoặc Video lẻ):");
    if (!url) return;

    importing = true;
    buttonAdd.disabled = true;

    try {
        status("Đang gửi yêu cầu tải tới Codespaces...");

        // Gửi link sang Codespaces server
        const res = await fetch(`${serverUrl}/api/download`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url.trim() }),
        });

        if (!res.ok) {
            throw new Error(`Server báo lỗi HTTP ${res.status}`);
        }

        const data = await res.json();
        status("Codespaces xử lý xong! Đang kéo file MP3 về thiết bị...");

        // Lấy file MP3 từ Server về trình duyệt
        const fileRes = await fetch(`${serverUrl}${data.fileUrl}`);
        if (!fileRes.ok) throw new Error("Không thể tải file MP3 từ server");

        const blob = await fileRes.blob();
        const safeName = `Music_${Date.now()}`;
        const file = new File([blob], `${safeName}.mp3`, { type: "audio/mpeg" });

        // Lưu vào IndexedDB / Web Player
        await addFiles([file]);

        status("Đã thêm nhạc thành công!");
    } catch (error) {
        console.error(error);
        status(`Lỗi: ${error.message}. Kiểm tra xem Server Codespaces đã bật chưa!`, true);
    } finally {
        importing = false;
        buttonAdd.disabled = false;
    }
}

if (buttonAdd) buttonAdd.addEventListener("click", importYouTube);
if (buttonKey) buttonKey.addEventListener("click", setupServerUrl);