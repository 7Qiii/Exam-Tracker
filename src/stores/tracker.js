import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  addImageEntries,
  addImages,
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
    unsubscribeAuth = onAuthStateChange(async (session) => {
      user.value = session?.user || null;
      if (user.value) {
        await loadFromCloud();
      } else {
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
    isSyncing.value = true;
    try {
      const data = await loadCloudData();
      if (!data) return;
      user.value = data.user;
      subjects.value = normalizeSubjects(data.subjects.length ? data.subjects : subjects.value);
      records.value = data.records;
      mistakes.value = data.mistakes;
      images.value = data.images;
      syncMode.value = "cloud";
      lastSyncedAt.value = new Date().toISOString();
      await replaceAllData({
        subjects: subjects.value,
        records: records.value,
        mistakes: mistakes.value,
        images: images.value
      });
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
  }

  async function login(email, password) {
    const session = await signInWithPassword(email, password);
    user.value = session?.user || null;
    await loadFromCloud();
  }

  async function register(email, password) {
    const session = await signUpWithPassword(email, password);
    user.value = session?.user || null;
    if (user.value) {
      await seedCloudDefaults();
      await loadFromCloud();
    }
  }

  async function logout() {
    await signOut();
    user.value = null;
    syncMode.value = "signed-out";
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
      createdAt: new Date().toISOString()
    };
    await db.records.put(record);
    await safeCloud(() => upsertRecord(record));
    records.value.push(record);
    return record;
  }

  async function updateRecord(id, patch) {
    const next = { ...patch, score: Number(patch.score), fullScore: Number(patch.fullScore) };
    await db.records.update(id, next);
    records.value = records.value.map((record) => (record.id === id ? { ...record, ...next } : record));
    const record = records.value.find((item) => item.id === id);
    if (record) await safeCloud(() => upsertRecord(record));
  }

  async function removeRecord(id) {
    await db.records.delete(id);
    await safeCloud(() => deleteRecordCloud(id));
    records.value = records.value.filter((record) => record.id !== id);
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
  }

  async function removeMistake(id) {
    await db.transaction("rw", db.mistakes, db.images, async () => {
      await db.mistakes.delete(id);
      await db.images.where({ ownerType: "mistake", ownerId: id }).delete();
    });
    await safeCloud(() => deleteMistakeCloud(id));
    mistakes.value = mistakes.value.filter((mistake) => mistake.id !== id);
    images.value = images.value.filter((image) => !(image.ownerType === "mistake" && image.ownerId === id));
  }

  async function removeImage(id) {
    await safeCloud(() => deleteMistakeImageCloud(id));
    await db.images.delete(id);
    images.value = images.value.filter((image) => image.id !== id);
  }

  async function saveSubjects(nextSubjects) {
    const normalizedSubjects = normalizeSubjects(nextSubjects);
    await db.subjects.bulkPut(normalizedSubjects);
    await Promise.all(normalizedSubjects.map((subject) => safeCloud(() => upsertSubject(subject))));
    subjects.value = normalizedSubjects;
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

  async function saveMistakeImages(mistakeId, files) {
    if (!user.value || !supabase) {
      return addImages("mistake", mistakeId, files);
    }

    const session = await getSession();
    const token = session?.access_token;
    if (!token) return addImages("mistake", mistakeId, files);

    const entries = [];
    for (const original of files) {
      const compressed = await compressImage(original);
      const upload = await uploadMistakeImage(compressed.file, mistakeId, token);
      const entry = {
        id: upload.imageId,
        ownerType: "mistake",
        ownerId: mistakeId,
        name: compressed.file.name,
        type: compressed.file.type,
        size: compressed.file.size,
        storageKey: upload.storageKey,
        url: upload.publicUrl,
        width: compressed.width,
        height: compressed.height,
        createdAt: new Date().toISOString()
      };
      entries.push(entry);
      await safeCloud(() => upsertMistakeImage(entry));
    }
    await addImageEntries(entries);
    return entries;
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
    subjectMap,
    visibleSubjects,
    imageStorageStats,
    load,
    login,
    register,
    logout,
    loadFromCloud,
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
    subjectColor
  };
});
