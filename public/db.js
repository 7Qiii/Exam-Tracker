const CLOUD_PIN_KEY = "exam-11408-cloud-pin";
const DB_NAME = "exam-11408-db";
const DB_VERSION = 1;
const STORE_NAME = "state";

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function loadState() {
  const localState = await loadLocalState();
  const cloudPin = getCloudPin();

  if (!cloudPin) {
    return localState;
  }

  try {
    const cloudState = await fetchCloudState(cloudPin);
    if (cloudState) {
      await saveLocalState(cloudState);
      return cloudState;
    }

    if (localState) {
      await saveCloudState(localState, cloudPin);
    }

    return localState;
  } catch (error) {
    console.error("Cloud load failed; using local data", error);
    return localState;
  }
}

export async function saveState(state) {
  await saveLocalState(state);

  const cloudPin = getCloudPin();
  if (!cloudPin) {
    return;
  }

  await saveCloudState(state, cloudPin);
}

export function getStorageMode() {
  return getCloudPin() ? "cloud" : "local";
}

export function getSavedCloudPin() {
  return getCloudPin();
}

export async function configureCloudSync(nextPin) {
  const currentPin = getCloudPin();
  const inputPin = nextPin ?? window.prompt(
    "输入云端同步密码。手机和电脑输入同一个密码，就会使用同一份云端数据。留空可关闭云同步。",
    currentPin || ""
  );

  if (inputPin === null) {
    return { changed: false, mode: getStorageMode() };
  }

  const trimmed = inputPin.trim();
  if (!trimmed) {
    localStorage.removeItem(CLOUD_PIN_KEY);
    return { changed: true, mode: "local" };
  }

  const localState = await loadLocalState();
  const cloudState = await fetchCloudState(trimmed);
  const state = cloudState || localState;

  if (state) {
    await saveLocalState(state);
    if (!cloudState) {
      await saveCloudState(state, trimmed);
    }
  }

  localStorage.setItem(CLOUD_PIN_KEY, trimmed);
  return { changed: true, mode: "cloud", state };
}

export async function exportData() {
  const state = await loadState();
  return JSON.stringify(state, null, 2);
}

export async function importData(jsonString, mergeMode = false) {
  try {
    const imported = JSON.parse(jsonString);

    if (!imported.subjects || !Array.isArray(imported.records)) {
      throw new Error("数据格式不正确");
    }

    if (mergeMode) {
      const current = await loadState();
      const subjectMap = new Map((current?.subjects || []).map((subject) => [subject.id, subject]));
      imported.subjects.forEach((subject) => {
        if (!subjectMap.has(subject.id)) {
          subjectMap.set(subject.id, subject);
        }
      });

      const recordMap = new Map((current?.records || []).map((record) => [record.id, record]));
      imported.records.forEach((record) => {
        if (!recordMap.has(record.id)) {
          recordMap.set(record.id, record);
        }
      });

      const merged = {
        subjects: Array.from(subjectMap.values()),
        records: Array.from(recordMap.values())
      };

      await saveState(merged);
      return { success: true, mode: "merge", recordCount: merged.records.length };
    }

    await saveState(imported);
    return { success: true, mode: "replace", recordCount: imported.records.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function loadLocalState() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("appState");

      request.onsuccess = () => {
        const data = request.result;
        if (data && data.subjects && Array.isArray(data.records)) {
          resolve(data);
        } else {
          resolve(migrateFromLocalStorage());
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("IndexedDB load failed; using localStorage", error);
    return migrateFromLocalStorage();
  }
}

async function saveLocalState(state) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state, "appState");

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("IndexedDB save failed", error);
    throw error;
  }
}

async function fetchCloudState(pin) {
  const response = await fetch("/api/state", {
    headers: { "x-app-pin": pin },
    cache: "no-store"
  });

  if (!response.ok) {
    throw cloudError("Cloud load failed", response.status);
  }

  const payload = await response.json();
  return payload.state || null;
}

async function saveCloudState(state, pin) {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-app-pin": pin
    },
    body: JSON.stringify(state)
  });

  if (!response.ok) {
    throw cloudError("Cloud save failed", response.status);
  }
}

function cloudError(message, status) {
  if (status === 404) {
    return new Error(`${message}: API 未部署。请检查 Vercel Root Directory 是否为仓库根目录，而不是 public。`);
  }

  if (status === 401) {
    return new Error(`${message}: 同步密码不正确。`);
  }

  if (status === 500) {
    return new Error(`${message}: Vercel 环境变量或 Blob 存储未配置。`);
  }

  return new Error(`${message}: ${status}`);
}

function getCloudPin() {
  return localStorage.getItem(CLOUD_PIN_KEY) || "";
}

function migrateFromLocalStorage() {
  const storageKey = "exam-11408-state-v1";
  const raw = localStorage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    saveLocalState(parsed).then(() => {
      localStorage.removeItem(storageKey);
    });
    return parsed;
  } catch {
    return null;
  }
}
