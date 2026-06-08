import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  addImageEntries,
  db,
  exportPortableData,
  importPortableData,
  loadAllData,
  normalizeSubjects,
  replaceAllData
} from "../services/storage";
import { compressImage } from "../services/imageTools";
import { uploadMistakeImage } from "../services/r2";
import {
  deleteMistakeCloud,
  deleteMistakeImageCloud,
  deleteRecordCloud,
  deleteSubjectCloud,
  getSession,
  isSupabaseConfigured,
  loadCloudData,
  onAuthStateChange,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  supabase,
  upsertMistake,
  upsertMistakeImage,
  upsertRecord,
  upsertSubject
} from "../services/supabase";

export const useTrackerStore = defineStore("tracker", () => {
  const subjects = ref([]);
  const records = ref([]);
  const mistakes = ref([]);
  const images = ref([]);
  const isReady = ref(false);
  const user = ref(null);
  const syncMode = ref(isSupabaseConfigured ? "cloud-ready" : "local");
  const syncError = ref("");
  const isSyncing = ref(false);
  const lastSyncedAt = ref("");
  const notifications = ref([]);
  let lastCloudSignature = "";
  let cloudLoadPromise = null;
  let autoSyncTimer = null;
  let autoSyncStarted = false;
  let lastAutoSyncAt = 0;

  const subjectMap = computed(() => new Map(subjects.value.map((subject) => [subject.id, subject])));
  const visibleSubjects = computed(() => subjects.value.filter((subject) => !subject.hidden));
  const imageStorageStats = computed(() => {
    const totalBytes = images.value.reduce((sum, image) => sum + Number(image.size || image.blob?.size || 0), 0);
    const cloudCount = images.value.filter((image) => image.url || image.storageKey).length;
    return {
      count: images.value.length,
      cloudCount,
      totalBytes,
      label: formatBytes(totalBytes)
    };
  });

  async function load() {
    syncError.value = "";
    const localData = await loadAllData();
    subjects.value = normalizeSubjects(localData.subjects);
    records.value = localData.records;
    mistakes.value = localData.mistakes;
    images.value = localData.images;
    syncMode.value = isSupabaseConfigured ? "signed-out" : "local";
    isReady.value = true;
    subscribeAuth();

    if (isSupabaseConfigured) {
      const session = await getSession();
      user.value = session?.user || null;
      if (user.value) {
        startAutoSync();
        retryPendingImageUploads();
        loadFromCloud().catch((error) => {
          syncError.value = error.message || "云端同步失败";
          console.error(error);
        });
      }
    }
  }

  let unsubscribeAuth = null;

  function subscribeAuth() {
    if (unsubscribeAuth || !isSupabaseConfigured) return;
    unsubscribeAuth = onAuthStateChange(async (session, event) => {
      if (event === "INITIAL_SESSION") return;
      user.value = session?.user || null;
      if (user.value) {
        startAutoSync();
        retryPendingImageUploads();
        await loadFromCloud();
      } else {
        stopAutoSync();
        const data = await loadAllData();
        subjects.value = normalizeSubjects(data.subjects);
        records.value = data.records;
        mistakes.value = data.mistakes;
        images.value = data.images;
        syncMode.value = "signed-out";
      }
    });
  }

  async function loadFromCloud() {
    if (cloudLoadPromise) return cloudLoadPromise;
    cloudLoadPromise = runCloudLoad();
    try {
      return await cloudLoadPromise;
    } finally {
      cloudLoadPromise = null;
    }
  }

  async function runCloudLoad() {
    isSyncing.value = true;
    try {
      const data = await loadCloudData();
      if (!data) return;
      user.value = data.user;
      subjects.value = normalizeSubjects(data.subjects.length ? data.subjects : subjects.value);
      records.value = data.records;
      mistakes.value = data.mistakes;
      images.value = mergeCloudImages(data.images);
      syncMode.value = "cloud";
      lastSyncedAt.value = new Date().toISOString();
      const signature = dataSignature({ subjects: subjects.value, records: records.value, mistakes: mistakes.value, images: images.value });
      if (signature !== lastCloudSignature) {
        await replaceAllData({
          subjects: subjects.value,
          records: records.value,
          mistakes: mistakes.value,
          images: images.value
        });
        lastCloudSignature = signature;
      }
    } finally {
      isSyncing.value = false;
    }
  }

  async function syncNow() {
    if (!user.value || !supabase) {
      throw new Error("请先登录账号后再同步。");
    }
    syncError.value = "";
    await loadFromCloud();
    notify("已同步云端数据。", "success");
  }

  async function login(email, password) {
    const session = await signInWithPassword(email, password);
    user.value = session?.user || null;
    startAutoSync();
    retryPendingImageUploads();
    await loadFromCloud();
  }

  async function register(email, password) {
    const session = await signUpWithPassword(email, password);
    user.value = session?.user || null;
    if (user.value) {
      startAutoSync();
      await seedCloudDefaults();
      retryPendingImageUploads();
      await loadFromCloud();
    }
  }

  async function logout() {
    await signOut();
    user.value = null;
    syncMode.value = "signed-out";
    stopAutoSync();
  }

  async function seedCloudDefaults() {
    await Promise.all(subjects.value.map((subject) => upsertSubject(subject)));
  }

  async function addRecord(payload) {
    const record = {
      id: crypto.randomUUID(),
      ...payload,
      score: Number(payload.score),
      fullScore: Number(payload.fullScore),
      durationMinutes: normalizeDuration(payload.durationMinutes),
      createdAt: new Date().toISOString()
    };
    await db.records.put(record);
    await safeCloud(() => upsertRecord(record));
    records.value.push(record);
    notify("成绩已保存。", "success");
    return record;
  }

  async function updateRecord(id, patch) {
    const next = {
      ...patch,
      score: Number(patch.score),
      fullScore: Number(patch.fullScore)
    };
    if ("durationMinutes" in patch) {
      next.durationMinutes = normalizeDuration(patch.durationMinutes);
    }
    await db.records.update(id, next);
    records.value = records.value.map((record) => (record.id === id ? { ...record, ...next } : record));
    const record = records.value.find((item) => item.id === id);
    if (record) await safeCloud(() => upsertRecord(record));
    notify("成绩已更新。", "success");
  }

  async function removeRecord(id) {
    await db.records.delete(id);
    await safeCloud(() => deleteRecordCloud(id));
    records.value = records.value.filter((record) => record.id !== id);
    notify("成绩已删除。", "success");
  }

  async function addMistake(payload, files = []) {
    const now = new Date().toISOString();
    const mistake = {
      id: crypto.randomUUID(),
      ...payload,
      sourceRecordId: payload.sourceRecordId || "",
      nextReviewAt: payload.nextReviewAt || "",
      createdAt: now,
      updatedAt: now
    };
    await db.mistakes.put(mistake);
    await safeCloud(() => upsertMistake(mistake));
    mistakes.value.unshift(mistake);
    if (files.length) {
      const saved = await saveMistakeImages(mistake.id, files);
      images.value.push(...saved);
    }
    notify(files.length ? "错题已保存，图片正在后台同步。" : "错题已保存。", "success");
    return mistake;
  }

  async function updateMistake(id, patch, files = []) {
    const next = { ...patch, updatedAt: new Date().toISOString() };
    await db.mistakes.update(id, next);
    mistakes.value = mistakes.value.map((mistake) => (mistake.id === id ? { ...mistake, ...next } : mistake));
    const mistake = mistakes.value.find((item) => item.id === id);
    if (mistake) await safeCloud(() => upsertMistake(mistake));
    if (files.length) {
      const saved = await saveMistakeImages(id, files);
      images.value.push(...saved);
    }
    notify(files.length ? "错题已保存，新增图片正在后台同步。" : "错题已保存。", "success");
  }

  async function removeMistake(id) {
    await db.transaction("rw", db.mistakes, db.images, async () => {
      await db.mistakes.delete(id);
      await db.images.where({ ownerType: "mistake", ownerId: id }).delete();
    });
    await safeCloud(() => deleteMistakeCloud(id));
    mistakes.value = mistakes.value.filter((mistake) => mistake.id !== id);
    images.value = images.value.filter((image) => !(image.ownerType === "mistake" && image.ownerId === id));
    notify("错题已删除。", "success");
  }

  async function removeImage(id) {
    await safeCloud(() => deleteMistakeImageCloud(id));
    await db.images.delete(id);
    images.value = images.value.filter((image) => image.id !== id);
    notify("图片已删除。", "success");
  }

  async function saveSubjects(nextSubjects) {
    const normalizedSubjects = normalizeSubjects(nextSubjects);
    await db.subjects.bulkPut(normalizedSubjects);
    await Promise.all(normalizedSubjects.map((subject) => safeCloud(() => upsertSubject(subject))));
    subjects.value = normalizedSubjects;
    notify("科目已保存。", "success");
  }

  async function addSubject(payload) {
    const subject = {
      id: `subject-${crypto.randomUUID()}`,
      name: payload.name.trim(),
      fullScore: Number(payload.fullScore),
      color: payload.color || "#177ddc",
      hidden: false,
      sortOrder: nextSubjectOrder(),
      createdAt: new Date().toISOString()
    };
    await saveSubjects([...subjects.value, subject]);
    return subject;
  }

  async function updateSubject(id, patch) {
    const nextSubjects = subjects.value.map((subject) =>
      subject.id === id
        ? {
            ...subject,
            ...patch,
            name: String(patch.name || subject.name).trim(),
            fullScore: Number(patch.fullScore ?? subject.fullScore),
            hidden: Boolean(patch.hidden ?? subject.hidden),
            sortOrder: Number.isFinite(Number(patch.sortOrder)) ? Number(patch.sortOrder) : subject.sortOrder
          }
        : subject
    );
    await saveSubjects(nextSubjects);
  }

  async function reorderSubjects(ids) {
    const orderMap = new Map(ids.map((id, index) => [id, index]));
    const nextSubjects = subjects.value.map((subject, index) => ({
      ...subject,
      sortOrder: orderMap.has(subject.id) ? orderMap.get(subject.id) : ids.length + index
    }));
    await saveSubjects(nextSubjects);
  }

  async function removeSubject(id) {
    const isUsed = records.value.some((record) => record.subjectId === id) || mistakes.value.some((mistake) => mistake.subjectId === id);
    if (isUsed) {
      throw new Error("这个科目已有成绩或错题记录，不能删除。");
    }
    await db.subjects.delete(id);
    await safeCloud(() => deleteSubjectCloud(id));
    subjects.value = normalizeSubjects(subjects.value.filter((subject) => subject.id !== id));
  }

  async function exportData() {
    return exportPortableData();
  }

  async function importData(payload, merge) {
    await importPortableData(payload, merge);
    await load();
  }

  async function clearAll() {
    await Promise.all([
      ...images.value.map((image) => safeCloud(() => deleteMistakeImageCloud(image.id))),
      ...mistakes.value.map((mistake) => safeCloud(() => deleteMistakeCloud(mistake.id))),
      ...records.value.map((record) => safeCloud(() => deleteRecordCloud(record.id)))
    ]);
    await replaceAllData({ subjects: subjects.value, records: [], mistakes: [], images: [] });
    records.value = [];
    mistakes.value = [];
    images.value = [];
    notify("数据已清空。", "success");
  }

  function subjectName(id) {
    return subjectMap.value.get(id)?.name || "未分类";
  }

  function subjectColor(id) {
    return subjectMap.value.get(id)?.color || "#177ddc";
  }

  function nextSubjectOrder() {
    return subjects.value.reduce((max, subject) => Math.max(max, Number(subject.sortOrder ?? -1)), -1) + 1;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }

  function normalizeDuration(value) {
    if (value === "" || value === null || value === undefined) return "";
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : "";
  }

  async function saveMistakeImages(mistakeId, files) {
    const entries = await Promise.all(
      [...files].map(async (original) => {
        const compressed = await compressImage(original);
        return {
          id: crypto.randomUUID(),
          ownerType: "mistake",
          ownerId: mistakeId,
          name: compressed.file.name,
          type: compressed.file.type,
          size: compressed.file.size,
          blob: compressed.file,
          width: compressed.width,
          height: compressed.height,
          pendingUpload: Boolean(user.value && supabase),
          uploadError: "",
          createdAt: new Date().toISOString()
        };
      })
    );

    await addImageEntries(entries);

    if (!user.value || !supabase) {
      return entries;
    }

    const session = await getSession();
    const token = session?.access_token;
    if (!token) {
      await markImagesUploadFailed(entries, "登录状态已过期，请重新登录后再同步。");
      return entries.map((entry) => ({ ...entry, pendingUpload: false, uploadError: "登录状态已过期，请重新登录后再同步。" }));
    }

    window.setTimeout(() => {
      entries.forEach((entry) => {
        uploadImageInBackground(entry, mistakeId, token);
      });
    });

    return entries;
  }

  async function uploadImageInBackground(entry, mistakeId, token) {
    let next = null;
    try {
      const upload = await uploadMistakeImage(entry.blob, mistakeId, token, entry.id);
      next = {
        ...entry,
        id: upload.imageId,
        storageKey: upload.storageKey,
        url: upload.publicUrl,
        pendingUpload: false,
        uploadError: ""
      };
      await upsertMistakeImage(next);
      syncError.value = "";
      await db.images.put(next);
      images.value = images.value.map((image) => (image.id === entry.id ? next : image));
      notify("图片已同步到云端。", "success");
      scheduleAutoSync(1500);
    } catch (error) {
      const uploadError = error.message || "图片上传失败";
      if (next) {
        const failed = { ...next, pendingUpload: false, uploadError };
        await db.images.put(failed);
        images.value = images.value.map((image) => (image.id === entry.id ? failed : image));
      } else {
        await markImagesUploadFailed([entry], uploadError);
      }
      notify(`图片已本地保存，但云端上传失败：${uploadError}`, "error", 7000);
    }
  }

  async function markImagesUploadFailed(entries, uploadError) {
    await Promise.all(entries.map((entry) => db.images.update(entry.id, { pendingUpload: false, uploadError })));
    const ids = new Set(entries.map((entry) => entry.id));
    images.value = images.value.map((image) => (ids.has(image.id) ? { ...image, pendingUpload: false, uploadError } : image));
  }

  async function safeCloud(action) {
    if (!user.value || !supabase) return;
    try {
      await action();
      syncError.value = "";
    } catch (error) {
      syncError.value = error.message || "云端同步失败";
      console.error(error);
    }
  }

  function notify(message, type = "info", timeout = 3200) {
    const id = crypto.randomUUID();
    notifications.value.push({ id, message, type });
    window.setTimeout(() => removeNotification(id), timeout);
  }

  function removeNotification(id) {
    notifications.value = notifications.value.filter((item) => item.id !== id);
  }

  function dataSignature(data) {
    return JSON.stringify({
      subjects: data.subjects.map((item) => [item.id, item.name, item.fullScore, item.color, item.hidden, item.sortOrder]),
      records: data.records.map((item) => [item.id, item.subjectId, item.paperName, item.score, item.fullScore, item.durationMinutes, item.date, item.note, item.createdAt]),
      mistakes: data.mistakes.map((item) => [item.id, item.subjectId, item.title, item.knowledgePoint, item.analysis, item.updatedAt]),
      images: data.images.map((item) => [item.id, item.ownerId, item.name, item.size, item.storageKey, item.url, item.pendingUpload, item.uploadError])
    });
  }

  function mergeCloudImages(cloudImages) {
    const cloudIds = new Set(cloudImages.map((image) => image.id));
    const localPending = images.value.filter((image) => isLocalPendingImage(image) && !cloudIds.has(image.id));
    return [...cloudImages, ...localPending];
  }

  function isLocalPendingImage(image) {
    return Boolean(image.blob && (image.pendingUpload || image.uploadError || !image.url));
  }

  async function retryPendingImageUploads() {
    if (!user.value || !supabase) return;
    const pending = images.value.filter((image) => image.blob && (image.pendingUpload || image.uploadError));
    if (!pending.length) return;
    const session = await getSession();
    const token = session?.access_token;
    if (!token) return;
    pending.forEach((image) => {
      uploadImageInBackground({ ...image, pendingUpload: true, uploadError: "" }, image.ownerId, token);
    });
  }

  function startAutoSync() {
    if (!isSupabaseConfigured || autoSyncStarted || typeof window === "undefined") return;
    autoSyncStarted = true;
    autoSyncTimer = window.setInterval(() => scheduleAutoSync(), 15000);
    window.addEventListener("focus", scheduleAutoSync);
    window.addEventListener("online", scheduleAutoSync);
    document.addEventListener("visibilitychange", syncWhenVisible);
  }

  function stopAutoSync() {
    if (!autoSyncStarted || typeof window === "undefined") return;
    autoSyncStarted = false;
    if (autoSyncTimer) window.clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    window.removeEventListener("focus", scheduleAutoSync);
    window.removeEventListener("online", scheduleAutoSync);
    document.removeEventListener("visibilitychange", syncWhenVisible);
  }

  function syncWhenVisible() {
    if (!document.hidden) scheduleAutoSync();
  }

  function scheduleAutoSync(delay = 0) {
    if (!user.value || isSyncing.value) return;
    window.setTimeout(() => {
      if (!user.value || isSyncing.value || document.hidden) return;
      const now = Date.now();
      if (now - lastAutoSyncAt < 6000) return;
      lastAutoSyncAt = now;
      loadFromCloud().catch((error) => {
        syncError.value = error.message || "自动同步失败";
        console.error(error);
      });
    }, delay);
  }

  return {
    subjects,
    records,
    mistakes,
    images,
    isReady,
    user,
    syncMode,
    syncError,
    isSyncing,
    lastSyncedAt,
    notifications,
    subjectMap,
    visibleSubjects,
    imageStorageStats,
    load,
    login,
    register,
    logout,
    loadFromCloud,
    startAutoSync,
    retryPendingImageUploads,
    syncNow,
    addRecord,
    updateRecord,
    removeRecord,
    addMistake,
    updateMistake,
    removeMistake,
    removeImage,
    saveSubjects,
    addSubject,
    updateSubject,
    reorderSubjects,
    removeSubject,
    exportData,
    importData,
    clearAll,
    subjectName,
    subjectColor,
    notify,
    removeNotification
  };
});
