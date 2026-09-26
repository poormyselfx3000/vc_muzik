"use strict";

const installButton = document.getElementById("install-app");
let deferredInstall = null;
const standaloneQuery = window.matchMedia("(display-mode: standalone)");
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function installStatus(text) {
  const node = document.getElementById("music-status");
  node.textContent = text;
  node.classList.remove("error");
}

function isStandalone() {
  return standaloneQuery.matches || navigator.standalone === true;
}

function syncInstallButton() {
  if (isStandalone()) {
    installButton.hidden = true;
    return;
  }
  installButton.hidden = false;
  installButton.textContent = isIOS ? "Cài trên iPhone" : "Cài app";
}

syncInstallButton();
standaloneQuery.addEventListener?.("change", syncInstallButton);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstall = event;
  syncInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredInstall = null;
  installButton.hidden = true;
  installStatus("Đã cài VC muzik. Bạn có thể mở từ màn hình chính.");
});

installButton.addEventListener("click", async () => {
  if (isIOS) {
    installStatus("Trong Safari: chạm nút Chia sẻ → Thêm vào màn hình chính → Thêm.");
    return;
  }
  if (!deferredInstall) {
    installStatus("Mở menu ⋮ của Chrome → Thêm vào màn hình chính → Cài đặt.");
    return;
  }
  const prompt = deferredInstall;
  deferredInstall = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    installStatus(choice.outcome === "accepted" ? "Đã chấp nhận cài VC muzik. Hãy chờ Chrome hoàn tất." : "Bạn có thể cài VC muzik bất cứ lúc nào bằng nút Cài app.");
  } catch {
    installStatus("Mở menu ⋮ của Chrome → Thêm vào màn hình chính → Cài đặt.");
  } finally {
    installButton.disabled = false;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      installStatus("Chưa chuẩn bị được chế độ ngoại tuyến. Hãy mở lại trang khi có mạng.");
    });
  });
}
