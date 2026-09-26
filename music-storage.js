const DB_NAME = "vc-muzik-library";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Bộ nhớ nhạc không được trình duyệt hỗ trợ."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TRACK_STORE)) {
        database.createObjectStore(TRACK_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Không mở được bộ nhớ nhạc."));
  });
  return databasePromise;
}

export async function readStoredTracks() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRACK_STORE, "readonly");
    const request = transaction.objectStore(TRACK_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Không đọc được danh sách nhạc."));
  });
}

export async function writeStoredTrack(record) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRACK_STORE, "readwrite");
    transaction.objectStore(TRACK_STORE).put(record);
    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error || new Error("Không lưu được bài hát."));
    transaction.onabort = () => reject(transaction.error || new Error("Không lưu được bài hát."));
  });
}

export async function deleteStoredTrack(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRACK_STORE, "readwrite");
    transaction.objectStore(TRACK_STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Không xóa được bài hát."));
    transaction.onabort = () => reject(transaction.error || new Error("Không xóa được bài hát."));
  });
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // The music library still works when the browser does not grant a persistent quota.
  }
  return false;
}
