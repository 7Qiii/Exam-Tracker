// IndexedDB 数据库管理模块
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
          // 尝试从 localStorage 迁移数据
          resolve(migrateFromLocalStorage());
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("IndexedDB 加载失败，使用 localStorage", error);
    return migrateFromLocalStorage();
  }
}

export async function saveState(state) {
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
    console.error("IndexedDB 保存失败", error);
    throw error;
  }
}

function migrateFromLocalStorage() {
  const STORAGE_KEY = "exam-11408-state-v1";
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    // 迁移后保存到 IndexedDB
    saveState(parsed).then(() => {
      console.log("数据已从 localStorage 迁移到 IndexedDB");
      localStorage.removeItem(STORAGE_KEY);
    });
    return parsed;
  } catch {
    return null;
  }
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

      // 合并科目（以 id 为准，相同 id 的科目保留现有配置）
      const subjectMap = new Map(current.subjects.map(s => [s.id, s]));
      imported.subjects.forEach(s => {
        if (!subjectMap.has(s.id)) {
          subjectMap.set(s.id, s);
        }
      });

      // 合并记录（去重，以 id 为准）
      const recordMap = new Map(current.records.map(r => [r.id, r]));
      imported.records.forEach(r => {
        if (!recordMap.has(r.id)) {
          recordMap.set(r.id, r);
        }
      });

      const merged = {
        subjects: Array.from(subjectMap.values()),
        records: Array.from(recordMap.values())
      };

      await saveState(merged);
      return { success: true, mode: "merge", recordCount: merged.records.length };
    } else {
      // 覆盖模式
      await saveState(imported);
      return { success: true, mode: "replace", recordCount: imported.records.length };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}
