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
  subscribeCloudChanges,
  supabase,
  upsertMistake,
  upsertMistakeImage,
  upsertRecord,
  upsertSubject
} from "../services/supabase";

const FALLBACK_SYNC_INTERVAL = 5 * 60 * 1000;
const ACTIVE_FALLBACK_THROTTLE = 60 * 1000;

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
  const realtimeStatus = ref("idle");
  const realtimeError = ref("");
  const notifications = ref([]);
  const deviceId = ref(getOrCreateDeviceId());
  const deviceName = ref(getDeviceName());
  const lastBackupAt = ref(readLocalValue("exam-tracker-last-backup", ""));
  let lastCloudSignature = "";
  let cloudLoadPromise = null;
  let autoSyncTimer = null;
  let autoSyncStarted = false;
  let lastAutoSyncAt = 0;
  let pendingFallbackTimer = null;
  let unsubscribeRealtime = null;
  let realtimeReconnectTimer = null;

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
  const pendingImages = computed(() => images.value.filter((image) => image.pendingUpload));
  const failedImages = computed(() => images.value.filter((image) => image.uploadError));
  const autoSyncState = computed(() => {
    if (!user.value) return "未登录";
    if (!isSupabaseConfigured) return "本地模式";
    if (realtimeStatus.value === "connected") return "实时同步已连接";
    if (realtimeStatus.value === "connecting") return "实时同步连接中";
    if (realtimeStatus.value === "error") return "实时同步异常，低频校准中";
    return autoSyncStarted ? "后台同步已开启" : "同步待启动";
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
      const localRecords = records.value;
      const localMistakes = mistakes.value;
      user.value = data.user;
      subjects.value = normalizeSubjects(data.subjects.length ? data.subjects : subjects.value);
      records.value = mergeCloudEntries(data.records, localRecords, "createdAt");
      mistakes.value = mergeCloudEntries(data.mistakes, localMistakes, "updatedAt");
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
      retryUnsyncedData();
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

  function markBackupExported() {
    lastBackupAt.value = new Date().toISOString();
    writeLocalValue("exam-tracker-last-backup", lastBackupAt.value);
    notify("备份时间已记录。", "success");
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
    const normalized = normalizeRecordPayload(payload);
    const record = {
      id: crypto.randomUUID(),
      ...normalized,
      score: Number(normalized.score),
      fullScore: Number(normalized.fullScore),
      durationMinutes: normalizeDuration(normalized.durationMinutes),
      pendingSync: true,
      createdAt: new Date().toISOString()
    };
    await db.records.put(record);
    records.value.push(record);
    const synced = await safeCloud(() => upsertRecord(record));
    if (synced) await markRecordSynced(record.id);
    notify("成绩已保存。", "success");
    return record;
  }

  async function updateRecord(id, patch) {
    const normalized = normalizeRecordPayload(patch);
    const next = {
      ...normalized,
      score: Number(normalized.score),
      fullScore: Number(normalized.fullScore)
    };
    if ("durationMinutes" in normalized) {
      next.durationMinutes = normalizeDuration(normalized.durationMinutes);
    }
    next.pendingSync = true;
    await db.records.update(id, next);
    records.value = records.value.map((record) => (record.id === id ? { ...record, ...next } : record));
    const record = records.value.find((item) => item.id === id);
    if (record) {
      const synced = await safeCloud(() => upsertRecord(record));
      if (synced) await markRecordSynced(id);
    }
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
      pendingSync: true,
      createdAt: now,
      updatedAt: now
    };
    await db.mistakes.put(mistake);
    mistakes.value.unshift(mistake);
    const synced = await safeCloud(() => upsertMistake(mistake));
    if (synced) await markMistakeSynced(mistake.id);
    if (files.length) {
      const saved = await saveMistakeImages(mistake.id, files);
      images.value.push(...saved);
    }
    notify(files.length ? "错题已保存，图片正在后台同步。" : "错题已保存。", "success");
    return mistake;
  }

  async function updateMistake(id, patch, files = []) {
    const next = { ...patch, pendingSync: true, updatedAt: new Date().toISOString() };
    await db.mistakes.update(id, next);
    mistakes.value = mistakes.value.map((mistake) => (mistake.id === id ? { ...mistake, ...next } : mistake));
    const mistake = mistakes.value.find((item) => item.id === id);
    if (mistake) {
      const synced = await safeCloud(() => upsertMistake(mistake));
      if (synced) await markMistakeSynced(id);
    }
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

  function normalizeRecordPayload(payload) {
    const recordType = payload.recordType === "exercise" ? "exercise" : "paper";
    const exerciseBookName = cleanText(payload.exerciseBookName);
    const exercisePage = cleanText(payload.exercisePage);
    const exerciseQuestion = cleanText(payload.exerciseQuestion);
    const paperName =
      recordType === "exercise"
        ? buildExerciseRecordName(exerciseBookName, exercisePage, exerciseQuestion)
        : cleanText(payload.paperName);

    return {
      ...payload,
      recordType,
      paperName,
      exerciseBookName: recordType === "exercise" ? exerciseBookName : "",
      exercisePage: recordType === "exercise" ? exercisePage : "",
      exerciseQuestion: recordType === "exercise" ? exerciseQuestion : ""
    };
  }

  function buildExerciseRecordName(bookName, page, question) {
    return [bookName, page ? `P${page}` : "", question ? `第 ${question} 题` : ""].filter(Boolean).join(" · ") || "数一习题";
  }

  function cleanText(value) {
    return String(value ?? "").trim();
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
      markSyncHeartbeat();
      notify("图片已同步到云端。", "success");
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
    if (!user.value || !supabase) return false;
    try {
      await action();
      syncError.value = "";
      markSyncHeartbeat();
      return true;
    } catch (error) {
      syncError.value = error.message || "云端同步失败";
      console.error(error);
      return false;
    }
  }

  function notify(message, type = "info", timeout = 3200) {
    const id = crypto.randomUUID();
    notifications.value.push({ id, message, type, timeout });
    window.setTimeout(() => removeNotification(id), timeout);
  }

  function removeNotification(id) {
    notifications.value = notifications.value.filter((item) => item.id !== id);
  }

  function dataSignature(data) {
    return JSON.stringify({
      subjects: data.subjects.map((item) => [item.id, item.name, item.fullScore, item.color, item.hidden, item.sortOrder]),
      records: data.records.map((item) => [
        item.id,
        item.subjectId,
        item.recordType,
        item.paperName,
        item.exerciseBookName,
        item.exercisePage,
        item.exerciseQuestion,
        item.score,
        item.fullScore,
        item.durationMinutes,
        item.date,
        item.note,
        item.createdAt
      ]),
      mistakes: data.mistakes.map((item) => [item.id, item.subjectId, item.title, item.knowledgePoint, item.analysis, item.updatedAt]),
      images: data.images.map((item) => [item.id, item.ownerId, item.name, item.size, item.storageKey, item.url, item.pendingUpload, item.uploadError])
    });
  }

  function mergeCloudImages(cloudImages) {
    const cloudIds = new Set(cloudImages.map((image) => image.id));
    const localPending = images.value.filter((image) => isLocalPendingImage(image) && !cloudIds.has(image.id));
    return [...cloudImages, ...localPending];
  }

  function mergeCloudEntries(cloudEntries, localEntries, stampField) {
    const merged = new Map(cloudEntries.map((entry) => [entry.id, { ...entry, pendingSync: false }]));
    localEntries.forEach((entry) => {
      const cloudEntry = merged.get(entry.id);
      if (!cloudEntry) {
        merged.set(entry.id, { ...entry, pendingSync: Boolean(user.value && supabase) });
        return;
      }
      if (entry.pendingSync && isNewerEntry(entry, cloudEntry, stampField)) {
        merged.set(entry.id, entry);
      }
    });
    return [...merged.values()];
  }

  function isNewerEntry(localEntry, cloudEntry, stampField) {
    const localTime = new Date(localEntry[stampField] || localEntry.createdAt || 0).getTime();
    const cloudTime = new Date(cloudEntry[stampField] || cloudEntry.createdAt || 0).getTime();
    return localTime >= cloudTime;
  }

  function retryUnsyncedData() {
    if (!user.value || !supabase) return;
    const recordQueue = records.value.filter((record) => record.pendingSync);
    const mistakeQueue = mistakes.value.filter((mistake) => mistake.pendingSync);
    recordQueue.forEach((record) => {
      safeCloud(() => upsertRecord(record)).then((synced) => {
        if (synced) markRecordSynced(record.id);
      });
    });
    mistakeQueue.forEach((mistake) => {
      safeCloud(() => upsertMistake(mistake)).then((synced) => {
        if (synced) markMistakeSynced(mistake.id);
      });
    });
  }

  async function markRecordSynced(id) {
    await db.records.update(id, { pendingSync: false });
    records.value = records.value.map((record) => (record.id === id ? { ...record, pendingSync: false } : record));
  }

  async function markMistakeSynced(id) {
    await db.mistakes.update(id, { pendingSync: false });
    mistakes.value = mistakes.value.map((mistake) => (mistake.id === id ? { ...mistake, pendingSync: false } : mistake));
  }

  function isLocalPendingImage(image) {
    return Boolean(image?.blob && (image.pendingUpload || image.uploadError || !image.url));
  }

  async function retryPendingImageUploads() {
    if (!user.value || !supabase) return;
    const pending = images.value.filter((image) => image.blob && (image.pendingUpload || image.uploadError));
    if (!pending.length) return;
    const session = await getSession();
    const token = session?.access_token;
    if (!token) return;
    await Promise.all(pending.map((image) => db.images.update(image.id, { pendingUpload: true, uploadError: "" })));
    const pendingIds = new Set(pending.map((image) => image.id));
    images.value = images.value.map((image) => (pendingIds.has(image.id) ? { ...image, pendingUpload: true, uploadError: "" } : image));
    notify(`正在重试 ${pending.length} 张图片同步。`, "info");
    pending.forEach((image) => {
      uploadImageInBackground({ ...image, pendingUpload: true, uploadError: "" }, image.ownerId, token);
    });
  }

  function startAutoSync() {
    if (!isSupabaseConfigured || typeof window === "undefined") return;
    startRealtimeSync();
    if (autoSyncStarted) return;
    autoSyncStarted = true;
    autoSyncTimer = window.setInterval(() => scheduleAutoSync(0, true), FALLBACK_SYNC_INTERVAL);
    window.addEventListener("focus", syncWhenActive);
    window.addEventListener("online", syncWhenOnline);
    document.addEventListener("visibilitychange", syncWhenVisible);
  }

  function stopAutoSync() {
    if (typeof window === "undefined") {
      stopRealtimeSync();
      return;
    }
    if (!autoSyncStarted) {
      stopRealtimeSync();
      return;
    }
    autoSyncStarted = false;
    if (autoSyncTimer) window.clearInterval(autoSyncTimer);
    if (pendingFallbackTimer) window.clearTimeout(pendingFallbackTimer);
    autoSyncTimer = null;
    pendingFallbackTimer = null;
    window.removeEventListener("focus", syncWhenActive);
    window.removeEventListener("online", syncWhenOnline);
    document.removeEventListener("visibilitychange", syncWhenVisible);
    stopRealtimeSync();
  }

  function syncWhenVisible() {
    if (!document.hidden) syncWhenActive();
  }

  function syncWhenActive() {
    retryUnsyncedData();
    scheduleAutoSync();
  }

  function syncWhenOnline() {
    retryUnsyncedData();
    retryPendingImageUploads();
    scheduleAutoSync(1000, true);
  }

  function scheduleAutoSync(delay = 0, force = false) {
    if (!user.value || isSyncing.value) return;
    if (pendingFallbackTimer) window.clearTimeout(pendingFallbackTimer);
    pendingFallbackTimer = window.setTimeout(() => {
      pendingFallbackTimer = null;
      if (!user.value || isSyncing.value || document.hidden) return;
      const now = Date.now();
      if (!force && now - lastAutoSyncAt < ACTIVE_FALLBACK_THROTTLE) return;
      lastAutoSyncAt = now;
      loadFromCloud().catch((error) => {
        syncError.value = error.message || "兜底同步失败";
        console.error(error);
      });
    }, delay);
  }

  function startRealtimeSync() {
    if (!user.value?.id || unsubscribeRealtime || !supabase) return;
    realtimeStatus.value = "connecting";
    realtimeError.value = "";
    unsubscribeRealtime = subscribeCloudChanges(user.value.id, {
      subjects: {
        upsert: (subject) => applyRealtimeSubject(subject),
        delete: (id) => removeRealtimeSubject(id)
      },
      records: {
        upsert: (record) => applyRealtimeRecord(record),
        delete: (id) => removeRealtimeRecord(id)
      },
      mistakes: {
        upsert: (mistake) => applyRealtimeMistake(mistake),
        delete: (id) => removeRealtimeMistake(id)
      },
      images: {
        upsert: (image) => applyRealtimeImage(image),
        delete: (id) => removeRealtimeImage(id)
      },
      onStatus: (status, error) => {
        if (status === "SUBSCRIBED") {
          realtimeStatus.value = "connected";
          realtimeError.value = "";
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          realtimeStatus.value = "error";
          realtimeError.value = error?.message || "Realtime 连接失败";
          scheduleAutoSync(1500, true);
          reconnectRealtimeSoon();
          return;
        }
        if (status === "CLOSED") {
          realtimeStatus.value = "idle";
        }
      }
    });
  }

  function stopRealtimeSync() {
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
      unsubscribeRealtime = null;
    }
    if (realtimeReconnectTimer && typeof window !== "undefined") {
      window.clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = null;
    }
    realtimeStatus.value = "idle";
    realtimeError.value = "";
  }

  function reconnectRealtimeSoon() {
    if (realtimeReconnectTimer || typeof window === "undefined") return;
    realtimeReconnectTimer = window.setTimeout(() => {
      realtimeReconnectTimer = null;
      if (!user.value?.id) return;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
        unsubscribeRealtime = null;
      }
      startRealtimeSync();
    }, 5000);
  }

  async function applyRealtimeSubject(subject) {
    const nextSubjects = normalizeSubjects([...subjects.value.filter((item) => item.id !== subject.id), subject]);
    subjects.value = nextSubjects;
    await db.subjects.bulkPut(nextSubjects);
    markSyncHeartbeat();
  }

  async function removeRealtimeSubject(id) {
    if (!id) return;
    const nextSubjects = normalizeSubjects(subjects.value.filter((subject) => subject.id !== id));
    subjects.value = nextSubjects;
    await db.transaction("rw", db.subjects, async () => {
      await db.subjects.delete(id);
      await db.subjects.bulkPut(nextSubjects);
    });
    markSyncHeartbeat();
  }

  async function applyRealtimeRecord(record) {
    const incoming = { ...record, pendingSync: false };
    const local = records.value.find((item) => item.id === incoming.id);
    if (local?.pendingSync && !isSameRecord(local, incoming)) return;
    const nextRecord = local?.pendingSync ? { ...local, pendingSync: false } : incoming;
    records.value = sortRecords(upsertById(records.value, nextRecord));
    await db.records.put(nextRecord);
    markSyncHeartbeat();
  }

  async function removeRealtimeRecord(id) {
    if (!id) return;
    const local = records.value.find((item) => item.id === id);
    if (local?.pendingSync) return;
    records.value = records.value.filter((record) => record.id !== id);
    await db.records.delete(id);
    markSyncHeartbeat();
  }

  async function applyRealtimeMistake(mistake) {
    const incoming = { ...mistake, pendingSync: false };
    const local = mistakes.value.find((item) => item.id === incoming.id);
    if (local?.pendingSync && !isSameMistake(local, incoming)) return;
    const nextMistake = local?.pendingSync ? { ...local, pendingSync: false } : incoming;
    mistakes.value = sortMistakes(upsertById(mistakes.value, nextMistake));
    await db.mistakes.put(nextMistake);
    markSyncHeartbeat();
  }

  async function removeRealtimeMistake(id) {
    if (!id) return;
    const local = mistakes.value.find((item) => item.id === id);
    if (local?.pendingSync) return;
    mistakes.value = mistakes.value.filter((mistake) => mistake.id !== id);
    images.value = images.value.filter((image) => image.ownerId !== id);
    await db.transaction("rw", db.mistakes, db.images, async () => {
      await db.mistakes.delete(id);
      await db.images.where({ ownerType: "mistake", ownerId: id }).delete();
    });
    markSyncHeartbeat();
  }

  async function applyRealtimeImage(image) {
    const incoming = { ...image, pendingUpload: false, uploadError: "" };
    const local = images.value.find((item) => item.id === incoming.id);
    const nextImage = local?.blob ? { ...local, ...incoming, blob: local.blob } : incoming;
    images.value = sortImages(upsertById(images.value, nextImage));
    await db.images.put(nextImage);
    markSyncHeartbeat();
  }

  async function removeRealtimeImage(id) {
    if (!id) return;
    const local = images.value.find((item) => item.id === id);
    if (isLocalPendingImage(local)) return;
    images.value = images.value.filter((image) => image.id !== id);
    await db.images.delete(id);
    markSyncHeartbeat();
  }

  function markSyncHeartbeat() {
    lastSyncedAt.value = new Date().toISOString();
    if (user.value) syncMode.value = "cloud";
  }

  function upsertById(entries, entry) {
    const exists = entries.some((item) => item.id === entry.id);
    return exists ? entries.map((item) => (item.id === entry.id ? entry : item)) : [entry, ...entries];
  }

  function sortRecords(entries) {
    return [...entries].sort((a, b) => {
      const dateDiff = new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      if (dateDiff) return dateDiff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }

  function sortMistakes(entries) {
    return [...entries].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  }

  function sortImages(entries) {
    return [...entries].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  }

  function isSameRecord(a, b) {
    return (
      a.subjectId === b.subjectId &&
      (a.recordType || "paper") === (b.recordType || "paper") &&
      a.paperName === b.paperName &&
      (a.exerciseBookName || "") === (b.exerciseBookName || "") &&
      (a.exercisePage || "") === (b.exercisePage || "") &&
      (a.exerciseQuestion || "") === (b.exerciseQuestion || "") &&
      Number(a.score) === Number(b.score) &&
      Number(a.fullScore) === Number(b.fullScore) &&
      String(a.durationMinutes ?? "") === String(b.durationMinutes ?? "") &&
      a.date === b.date &&
      (a.note || "") === (b.note || "")
    );
  }

  function isSameMistake(a, b) {
    return (
      a.subjectId === b.subjectId &&
      a.title === b.title &&
      (a.knowledgePoint || "") === (b.knowledgePoint || "") &&
      (a.analysis || "") === (b.analysis || "") &&
      (a.sourceRecordId || "") === (b.sourceRecordId || "") &&
      (a.questionText || "") === (b.questionText || "")
    );
  }

  function getOrCreateDeviceId() {
    const key = "exam-tracker-device-id";
    const existing = readLocalValue(key, "");
    if (existing) return existing;
    const id = crypto.randomUUID();
    writeLocalValue(key, id);
    return id;
  }

  function getDeviceName() {
    const saved = readLocalValue("exam-tracker-device-name", "");
    if (saved) return saved;
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    const touch = navigator.maxTouchPoints > 1;
    if (/iPad|MacIntel/i.test(platform) && touch) return "iPad";
    if (/iPhone/i.test(platform)) return "iPhone";
    if (/Win/i.test(platform)) return "Windows";
    if (/Mac/i.test(platform)) return "Mac";
    if (/Android/i.test(navigator.userAgent)) return "Android";
    return "当前设备";
  }

  function readLocalValue(key, fallback) {
    if (typeof localStorage === "undefined") return fallback;
    return localStorage.getItem(key) || fallback;
  }

  function writeLocalValue(key, value) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
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
    realtimeStatus,
    realtimeError,
    notifications,
    deviceId,
    deviceName,
    lastBackupAt,
    subjectMap,
    visibleSubjects,
    imageStorageStats,
    pendingImages,
    failedImages,
    autoSyncState,
    load,
    login,
    register,
    logout,
    loadFromCloud,
    startAutoSync,
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
    markBackupExported,
    subjectName,
    subjectColor,
    notify,
    removeNotification,
    retryPendingImageUploads
  };
});
