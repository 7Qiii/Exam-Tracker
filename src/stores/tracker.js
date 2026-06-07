import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  addImages,
  db,
  exportPortableData,
  importPortableData,
  loadAllData,
  replaceAllData
} from "../services/storage";

export const useTrackerStore = defineStore("tracker", () => {
  const subjects = ref([]);
  const records = ref([]);
  const mistakes = ref([]);
  const images = ref([]);
  const isReady = ref(false);

  const subjectMap = computed(() => new Map(subjects.value.map((subject) => [subject.id, subject])));
  const totalScore = computed(() => records.value.reduce((sum, record) => sum + Number(record.score || 0), 0));
  const averageRate = computed(() => {
    const totalFull = records.value.reduce((sum, record) => sum + Number(record.fullScore || 0), 0);
    return totalFull ? Math.round((totalScore.value / totalFull) * 1000) / 10 : 0;
  });
  const pendingMistakes = computed(() => mistakes.value.filter((item) => item.status !== "已掌握").length);

  async function load() {
    const data = await loadAllData();
    subjects.value = data.subjects;
    records.value = data.records;
    mistakes.value = data.mistakes;
    images.value = data.images;
    isReady.value = true;
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
    records.value.push(record);
    return record;
  }

  async function updateRecord(id, patch) {
    const next = { ...patch, score: Number(patch.score), fullScore: Number(patch.fullScore) };
    await db.records.update(id, next);
    records.value = records.value.map((record) => (record.id === id ? { ...record, ...next } : record));
  }

  async function removeRecord(id) {
    await db.records.delete(id);
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
    mistakes.value.unshift(mistake);
    if (files.length) {
      const saved = await addImages("mistake", mistake.id, files);
      images.value.push(...saved);
    }
    return mistake;
  }

  async function updateMistake(id, patch, files = []) {
    const next = { ...patch, updatedAt: new Date().toISOString() };
    await db.mistakes.update(id, next);
    mistakes.value = mistakes.value.map((mistake) => (mistake.id === id ? { ...mistake, ...next } : mistake));
    if (files.length) {
      const saved = await addImages("mistake", id, files);
      images.value.push(...saved);
    }
  }

  async function removeMistake(id) {
    await db.transaction("rw", db.mistakes, db.images, async () => {
      await db.mistakes.delete(id);
      await db.images.where({ ownerType: "mistake", ownerId: id }).delete();
    });
    mistakes.value = mistakes.value.filter((mistake) => mistake.id !== id);
    images.value = images.value.filter((image) => !(image.ownerType === "mistake" && image.ownerId === id));
  }

  async function removeImage(id) {
    await db.images.delete(id);
    images.value = images.value.filter((image) => image.id !== id);
  }

  async function saveSubjects(nextSubjects) {
    await db.subjects.bulkPut(nextSubjects);
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

  return {
    subjects,
    records,
    mistakes,
    images,
    isReady,
    subjectMap,
    averageRate,
    pendingMistakes,
    load,
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
