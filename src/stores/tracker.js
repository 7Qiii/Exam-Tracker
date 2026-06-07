import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  addImageEntries,
  addImages,
  db,
  exportPortableData,
  importPortableData,
  loadAllData,
  replaceAllData
} from "../services/storage";
import { compressImage } from "../services/imageTools";
import { uploadMistakeImage } from "../services/r2";
import {
  deleteMistakeCloud,
  deleteMistakeImageCloud,
  deleteRecordCloud,
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

  const subjectMap = computed(() => new Map(subjects.value.map((subject) => [subject.id, subject])));
  const totalScore = computed(() => records.value.reduce((sum, record) => sum + Number(record.score || 0), 0));
  const averageRate = computed(() => {
    const totalFull = records.value.reduce((sum, record) => sum + Number(record.fullScore || 0), 0);
    return totalFull ? Math.round((totalScore.value / totalFull) * 1000) / 10 : 0;
  });
  const pendingMistakes = computed(() => mistakes.value.filter((item) => item.status !== "已掌握").length);

  async function load() {
    syncError.value = "";
    if (isSupabaseConfigured) {
      const session = await getSession();
      user.value = session?.user || null;
      if (user.value) {
        await loadFromCloud();
        subscribeAuth();
        isReady.value = true;
        return;
      }
    }

    const data = await loadAllData();
    subjects.value = data.subjects;
    records.value = data.records;
    mistakes.value = data.mistakes;
    images.value = data.images;
    syncMode.value = isSupabaseConfigured ? "signed-out" : "local";
    isReady.value = true;
    subscribeAuth();
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
        subjects.value = data.subjects;
        records.value = data.records;
        mistakes.value = data.mistakes;
        images.value = data.images;
        syncMode.value = "signed-out";
      }
    });
  }

  async function loadFromCloud() {
    const data = await loadCloudData();
    if (!data) return;
    user.value = data.user;
    subjects.value = data.subjects.length ? data.subjects : subjects.value;
    records.value = data.records;
    mistakes.value = data.mistakes;
    images.value = data.images;
    syncMode.value = "cloud";
    await replaceAllData({
      subjects: subjects.value,
      records: records.value,
      mistakes: mistakes.value,
      images: images.value
    });
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
    await db.subjects.bulkPut(nextSubjects);
    await Promise.all(nextSubjects.map((subject) => safeCloud(() => upsertSubject(subject))));
    subjects.value = nextSubjects;
  }

  async function exportData() {
    return exportPortableData();
  }

  async function importData(payload, merge) {
    await importPortableData(payload, merge);
    await load();
  }

  async function clearAll() {
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
    subjectMap,
    averageRate,
    pendingMistakes,
    load,
    login,
    register,
    logout,
    loadFromCloud,
    addRecord,
    updateRecord,
    removeRecord,
    addMistake,
    updateMistake,
    removeMistake,
    removeImage,
    saveSubjects,
    exportData,
    importData,
    clearAll,
    subjectName,
    subjectColor
  };
});
