import { MusicQueue } from "./queue.mjs";
import { readStoredTracks, writeStoredTrack, deleteStoredTrack, requestPersistentStorage } from "./music-storage.js";

const $ = (id) => document.getElementById(id);
const audio = $("audio");
const queue = new MusicQueue();
const tracks = new Map();
let sequence = 0;
let playRequest = 0;
let loaded = null;
let restoring = true;

const status = (text, error = false) => {
  $("music-status").textContent = text;
  $("music-status").classList.toggle("error", error);
};

function fileKey(file) {
  return [file.name || "audio", file.size, file.lastModified || 0, file.type || ""].join("|");
}

function extensionFor(file) {
  const extension = (file.name || "audio.mp3").split(".").pop().toLowerCase();
  return extension === "wav" ? "wav" : "mp3";
}

function titleFor(file) {
  return (file.name || "Bài hát").replace(/\.(mp3|wav)$/i, "");
}

function playableFile(record) {
  const name = `${record.name}.${record.extension}`;
  const options = { type: record.type || (record.extension === "wav" ? "audio/wav" : "audio/mpeg"), lastModified: record.lastModified || Date.now() };
  try {
    return new File([record.blob], name, options);
  } catch {
    return record.blob;
  }
}

function addRow(id, track) {
  const row = document.createElement("li");
  row.dataset.id = id;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "song-select";
  button.title = track.name;
  const number = document.createElement("span");
  number.className = "number";
  const text = document.createElement("span");
  text.className = "song-text";
  const title = document.createElement("span");
  title.className = "song-name";
  title.textContent = track.name;
  const meta = document.createElement("span");
  meta.className = "song-meta";
  meta.textContent = `${track.extension.toUpperCase()} · ${(track.file.size / 1024 / 1024).toFixed(1)} MB`;
  text.append(title, meta);
  button.append(number, text);
  button.onclick = () => {
    queue.select(id);
    playCurrent();
  };
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "delete-button";
  removeButton.setAttribute("aria-label", `Xóa ${track.name}`);
  removeButton.title = "Biên bạn ơi";
  removeButton.innerHTML = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 14h8l1-14\"/></svg>";
  removeButton.onclick = (event) => {
    event.stopPropagation();
    removeTrack(id);
  };
  row.append(button, removeButton);
  $("songs").append(row);
}

function renumberRows() {
  [...$("songs").children].forEach((row, index) => {
    row.querySelector(".number").textContent = String(index + 1).padStart(2, "0");
  });
}

function draw() {
  const exists = queue.current !== null;
  $("toggle").disabled = $("forward").disabled = !exists;
  $("previous").disabled = !exists || queue.position === 0;
  $("total").textContent = `${tracks.size} bài hát`;
  $("drop").classList.toggle("compact", tracks.size > 0);
  $("random").setAttribute("aria-pressed", String(queue.random));
  $("random-state").textContent = queue.random ? "Bật" : "Tắt";
  $("mode").textContent = queue.random ? "⇄ Ngẫu nhiên" : "Theo thứ tự";
  for (const row of $("songs").children) {
    const active = Number(row.dataset.id) === queue.current;
    row.classList.toggle("active", active);
    row.firstChild.setAttribute("aria-current", active ? "true" : "false");
  }
  const track = tracks.get(queue.current);
  if (track) {
    $("song-title").textContent = track.name;
    $("song-title").title = track.name;
    $("song-detail").textContent = `${track.extension.toUpperCase()} · ${(track.file.size / 1024 / 1024).toFixed(1)} MB`;
  }
  renumberRows();
}

async function removeTrack(id) {
  const track = tracks.get(id);
  if (!track) return;
  const wasCurrent = queue.current === id;
  const wasPlaying = wasCurrent && !audio.paused && !audio.ended;
  if (wasCurrent) {
    ++playRequest;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    loaded = null;
  }
  queue.remove(id);
  tracks.delete(id);
  [...$("songs").children].find((row) => Number(row.dataset.id) === id)?.remove();
  URL.revokeObjectURL(track.url);
  try {
    await deleteStoredTrack(track.key);
  } catch {
    status("Bài đã được xóa khỏi danh sách, nhưng không thể cập nhật bộ nhớ.", true);
  }
  draw();
  if (!tracks.size) {
    $("song-title").textContent = "Chưa có bài hát";
    $("song-detail").textContent = "Chạm nút tải lên để thêm MP3 / WAV.";
    status("Danh sách phát đã trống.");
  } else if (wasCurrent) {
    status(`Đã xóa “${track.name}”.`);
    playCurrent(wasPlaying);
  } else {
    status(`Đã xóa “${track.name}” khỏi danh sách.`);
  }
}

function playbackState() {
  const playing = !audio.paused && !audio.ended;
  $("toggle").textContent = playing ? "⏸" : "▶";
  $("toggle").setAttribute("aria-label", playing ? "Tạm dừng" : "Phát nhạc");
  document.querySelector(".listening").classList.toggle("playing", playing);
}

async function playCurrent(autoplay = true) {
  const track = tracks.get(queue.current);
  if (!track) return;
  const request = ++playRequest;
  if (loaded !== queue.current) {
    audio.pause();
    audio.src = track.url;
    loaded = queue.current;
    audio.load();
  }
  draw();
  if (!autoplay) return;
  try {
    await audio.play();
    if (request === playRequest) status(queue.random ? "Đang điên điên dại dại. Hết lượt sẽ xáo trộn lại." : "Đang phát theo danh sách.");
  } catch (error) {
    if (request !== playRequest || error.name === "AbortError") return;
    status(error.name === "NotAllowedError" ? "Bấm Phát để trình duyệt bắt đầu phát nhạc." : "Không đọc được bài này. Hãy thử file khác hoặc chuyển sang bài tiếp theo.", true);
  }
}

function addTrack(file, key) {
  const id = sequence++;
  const extension = extensionFor(file);
  const track = {
    file,
    key,
    name: titleFor(file),
    extension,
    type: file.type || (extension === "wav" ? "audio/wav" : "audio/mpeg"),
    lastModified: file.lastModified || Date.now(),
    url: URL.createObjectURL(file),
  };
  tracks.set(id, track);
  addRow(id, track);
  return { id, track };
}

async function persistTrack(track) {
  await writeStoredTrack({
    key: track.key,
    blob: track.file,
    name: track.name,
    extension: track.extension,
    type: track.type,
    size: track.file.size,
    lastModified: track.lastModified,
  });
}

export async function addFiles(fileList) {
  if (restoring) return;
  const ids = [];
  let skipped = 0;
  let duplicates = 0;
  let notSaved = 0;
  for (const file of [...fileList]) {
    const extension = extensionFor(file);
    if (!["mp3", "wav"].includes(extension) || file.size === 0) {
      skipped++;
      continue;
    }
    const key = fileKey(file);
    if ([...tracks.values()].some((track) => track.key === key)) {
      duplicates++;
      continue;
    }
    const { id, track } = addTrack(file, key);
    ids.push(id);
    try {
      await persistTrack(track);
    } catch {
      notSaved++;
    }
  }
  queue.add(ids);
  draw();
  if (ids.length && loaded === null) playCurrent(false);
  const messages = [ids.length ? `Đã thêm ${ids.length} bài và lưu vào ứng dụng.` : "Không có bài mới."];
  if (notSaved) messages.push(`${notSaved} bài chỉ dùng được trong phiên này vì bộ nhớ không đủ.`);
  if (skipped) messages.push(`Bỏ qua ${skipped} file rỗng hoặc không phải MP3/WAV.`);
  if (duplicates) messages.push(`${duplicates} file đã có trong danh sách.`);
  status(messages.join(" "), Boolean(notSaved || skipped));
  return { added: ids.length, skipped, duplicates, notSaved };
}

async function restoreLibrary() {
  try {
    await requestPersistentStorage();
    const records = await readStoredTracks();
    const ids = [];
    for (const record of records) {
      if (!record?.blob || !record.name || !["mp3", "wav"].includes(record.extension)) continue;
      const file = playableFile(record);
      const { id } = addTrack(file, record.key || fileKey(file));
      ids.push(id);
    }
    queue.add(ids);
    draw();
    if (ids.length) {
      status(`Đã khôi phục ${ids.length} bài hát từ bộ nhớ ứng dụng. Chạm Phát để nghe.`);
      playCurrent(false);
    } else {
      status("Chọn nhạc để bắt đầu. Nhạc thêm vào sẽ được lưu trong ứng dụng.");
    }
  } catch {
    status("Chọn nhạc để bắt đầu. Trình duyệt này chưa cấp bộ nhớ lâu dài.", true);
  } finally {
    restoring = false;
    $("add").disabled = false;
  }
}

$("add").disabled = true;
$("add").onclick = () => $("files").click();
$("files").onchange = (event) => {
  addFiles(event.target.files);
  event.target.value = "";
};

const drop = $("drop");
for (const name of ["dragenter", "dragover"]) {
  drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.add("over");
  });
}
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("over");
  addFiles(event.dataTransfer.files);
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

$("toggle").onclick = () => {
  if (audio.paused || audio.ended) playCurrent();
  else {
    ++playRequest;
    audio.pause();
  }
};
$("forward").onclick = () => {
  queue.next();
  playCurrent();
};
$("previous").onclick = () => {
  queue.previous();
  playCurrent();
};
$("random").onclick = () => {
  queue.setRandom(!queue.random);
  draw();
  status(queue.random ? "điên điên dại dại: Bật" : "Đã chuyển về thứ tự trong danh sách.");
};
audio.addEventListener("ended", () => {
  queue.next();
  playCurrent();
});
audio.addEventListener("play", playbackState);
audio.addEventListener("pause", playbackState);
audio.addEventListener("ended", playbackState);
audio.addEventListener("error", () => status("File này bị lỗi hoặc trình duyệt không hỗ trợ cách mã hóa. Hãy chuyển sang bài khác.", true));
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) for (const track of tracks.values()) URL.revokeObjectURL(track.url);
});

if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: "control_local_music",
      description: "Control music files already selected by the user. Select a track by its numeric id, play, pause, move next or previous, or set shuffle. Cannot access unselected local files.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play", "pause", "next", "previous", "select", "shuffle"] },
          trackId: { type: "integer" },
          enabled: { type: "boolean" },
        },
        required: ["action"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        if (!["play", "pause", "next", "previous", "select", "shuffle"].includes(input.action)) throw new Error("Invalid action");
        if (input.action === "shuffle") {
          if (typeof input.enabled !== "boolean") throw new Error("enabled is required");
          queue.setRandom(input.enabled);
          draw();
        } else {
          if (!tracks.size) throw new Error("Chọn file nhạc trước.");
          if (input.action === "pause") {
            ++playRequest;
            audio.pause();
          } else {
            if (input.action === "select") queue.select(input.trackId);
            if (input.action === "next") queue.next();
            if (input.action === "previous") queue.previous();
            await playCurrent();
          }
        }
        return { current: queue.current, paused: audio.paused, shuffle: queue.random };
      },
    })).catch(() => {});
  } catch {}
}

const seek = $("seek");
let seeking = false;
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const n = Math.floor(seconds);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function updateTimeline() {
  const duration = audio.duration;
  const valid = Number.isFinite(duration) && duration > 0;
  seek.disabled = !valid;
  $("duration").textContent = formatTime(duration);
  if (!seeking) {
    const time = audio.currentTime || 0;
    seek.value = valid ? String(Math.round((time / duration) * 1000)) : "0";
    $("elapsed").textContent = formatTime(time);
    seek.style.setProperty("--progress", `${Number(seek.value) / 10}%`);
    seek.setAttribute("aria-valuetext", `${formatTime(time)} / ${formatTime(duration)}`);
  }
}
seek.addEventListener("input", () => {
  seeking = true;
  const time = (Number(seek.value) / 1000) * audio.duration;
  $("elapsed").textContent = formatTime(time);
  seek.style.setProperty("--progress", `${Number(seek.value) / 10}%`);
  seek.setAttribute("aria-valuetext", `${formatTime(time)} / ${formatTime(audio.duration)}`);
});
seek.addEventListener("change", () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
  seeking = false;
  updateTimeline();
});
seek.addEventListener("blur", () => {
  seeking = false;
  updateTimeline();
});
for (const name of ["timeupdate", "loadedmetadata", "durationchange", "emptied", "ended"]) audio.addEventListener(name, updateTimeline);
$("volume").addEventListener("input", (event) => {
  audio.volume = Number(event.target.value);
  audio.muted = false;
});
audio.addEventListener("volumechange", () => {
  $("volume").value = audio.muted ? "0" : String(audio.volume);
});
updateTimeline();
restoreLibrary();
