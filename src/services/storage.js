import Dexie from "dexie";

export const db = new Dexie("exam-tracker-v3");

db.version(1).stores({
  subjects: "id, name",
  records: "id, subjectId, date, createdAt",
  mistakes: "id, subjectId, status, sourceRecordId, createdAt, updatedAt",
  images: "id, ownerType, ownerId, createdAt"
});

export const defaultSubjects = [
  { id: "math1", name: "数一", fullScore: 150, color: "#177ddc", sortOrder: 0, hidden: false },
  { id: "cs408", name: "408", fullScore: 150, color: "#7a5af8", sortOrder: 1, hidden: false },
  { id: "english1", name: "英一", fullScore: 100, color: "#12b76a", sortOrder: 2, hidden: false },
  { id: "politics", name: "政治", fullScore: 100, color: "#f79009", sortOrder: 3, hidden: false }
];

const subjectBlueprints = new Map(defaultSubjects.map((subject) => [subject.id, { ...subject }]));

export function isDefaultSubject(id) {
  return subjectBlueprints.has(id);
}

export function normalizeSubjects(subjects = []) {
  const merged = new Map(defaultSubjects.map((subject) => [subject.id, { ...subject }]));

  subjects.forEach((subject) => {
    const blueprint = subjectBlueprints.get(subject.id);
    merged.set(subject.id, {
      ...subject,
      sortOrder: Number.isFinite(Number(subject.sortOrder)) ? Number(subject.sortOrder) : blueprint?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      hidden: Boolean(subject.hidden),
      ...(blueprint ? { name: blueprint.name, fullScore: blueprint.fullScore, color: subject.color || blueprint.color } : {})
    });
  });

  return [...merged.values()].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export function createDemoRecords() {
  return [
    sampleRecord("cs408", "408 综合模拟 01", -8, 86, 150, 180, "操作系统和计网选择题丢分明显。"),
    sampleRecord("math1", "数一 模拟 01", -6, 92, 150, 170, "后两道大题节奏偏慢。"),
    sampleRecord("english1", "英一 阅读专项", -4, 68, 100, 70, "阅读细节题需要标定位句。"),
    sampleRecord("politics", "政治 选择题套卷", -2, 63, 100, 60, "马原概念要回炉。")
  ];
}

export function createDemoMistakes() {
  return [
    sampleMistake("cs408", "进程调度周转时间计算", "操作系统", "concept", "待复盘"),
    sampleMistake("math1", "二重积分换元边界", "高等数学", "method", "已整理")
  ];
}

export async function seedIfEmpty() {
  const subjectCount = await db.subjects.count();
  if (!subjectCount) {
    await db.subjects.bulkPut(defaultSubjects);
  } else {
    await db.subjects.bulkPut(normalizeSubjects(await db.subjects.toArray()));
  }

  const recordCount = await db.records.count();
  if (!recordCount) {
    await db.records.bulkPut(createDemoRecords());
  }

  const mistakeCount = await db.mistakes.count();
  if (!mistakeCount) {
    await db.mistakes.bulkPut(createDemoMistakes());
  }
}

export async function loadAllData() {
  await seedIfEmpty();
  const [subjects, records, mistakes, images] = await Promise.all([
    db.subjects.toArray(),
    db.records.toArray(),
    db.mistakes.toArray(),
    db.images.toArray()
  ]);
  return { subjects: normalizeSubjects(subjects), records, mistakes, images };
}

export async function replaceAllData(payload) {
  await db.transaction("rw", db.subjects, db.records, db.mistakes, db.images, async () => {
    await Promise.all([db.subjects.clear(), db.records.clear(), db.mistakes.clear(), db.images.clear()]);
    await db.subjects.bulkPut(normalizeSubjects(toPlainEntries(payload.subjects || defaultSubjects)));
    await db.records.bulkPut(toPlainEntries(payload.records || []));
    await db.mistakes.bulkPut(toPlainEntries(payload.mistakes || []));
    await db.images.bulkPut(toPlainEntries(payload.images || []));
  });
}

export async function addImages(ownerType, ownerId, files) {
  const entries = await Promise.all(
    [...files].map(async (file) => ({
      id: crypto.randomUUID(),
      ownerType,
      ownerId,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      blob: file,
      createdAt: new Date().toISOString()
    }))
  );

  if (entries.length) {
    await db.images.bulkPut(entries);
  }

  return entries;
}

export async function addImageEntries(entries) {
  if (entries.length) {
    await db.images.bulkPut(toPlainEntries(entries));
  }
  return entries;
}

export async function exportPortableData() {
  const data = await loadAllData();
  const images = await Promise.all(
    data.images.map(async (image) => ({
      ...image,
      blob: image.blob ? await blobToDataUrl(image.blob) : null
    }))
  );
  return { ...data, images, exportedAt: new Date().toISOString(), version: 3 };
}

export async function importPortableData(payload, merge = true) {
  const images = await Promise.all(
    (payload.images || []).map(async (image) => ({
      ...image,
      blob: typeof image.blob === "string" ? await dataUrlToBlob(image.blob) : image.blob || null
    }))
  );

  const normalized = {
    subjects: normalizeSubjects(payload.subjects || []),
    records: toPlainEntries(payload.records || []),
    mistakes: toPlainEntries(payload.mistakes || []),
    images: toPlainEntries(images)
  };

  if (!merge) {
    await replaceAllData(normalized);
    return;
  }

  await db.transaction("rw", db.subjects, db.records, db.mistakes, db.images, async () => {
    await db.subjects.bulkPut(normalized.subjects);
    await db.records.bulkPut(normalized.records);
    await db.mistakes.bulkPut(normalized.mistakes);
    await db.images.bulkPut(normalized.images);
  });
}

function sampleRecord(subjectId, paperName, daysAgo, score, fullScore, durationMinutes, note) {
  const date = new Date();
  date.setDate(date.getDate() + daysAgo);
  return {
    id: crypto.randomUUID(),
    subjectId,
    paperName,
    score,
    fullScore,
    durationMinutes,
    date: date.toISOString().slice(0, 10),
    note,
    createdAt: date.toISOString()
  };
}

function sampleMistake(subjectId, title, knowledgePoint, reason, status) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    subjectId,
    title,
    knowledgePoint,
    reason,
    status,
    sourceRecordId: "",
    questionText: "",
    analysis: "先把题目截图或关键步骤补进来，复盘时再完善解析。",
    nextReviewAt: "",
    createdAt: now,
    updatedAt: now
  };
}

function toPlainEntries(entries) {
  return entries.map((entry) => {
    const plain = {};
    Object.entries(entry || {}).forEach(([key, value]) => {
      if (value !== undefined) {
        plain[key] = value;
      }
    });
    return plain;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}
