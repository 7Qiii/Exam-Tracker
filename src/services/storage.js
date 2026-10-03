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
  // 难度和创建时间都要给全。之前这两条种子错题既没有 difficulty，
  // createdAt 又都是「当前毫秒」（两条完全相同），结果是：
  //   - 列表里两条都显示「难度未填」，像是应用有数据质量问题；
  //   - 时间戳一样，排序分不出先后，列表顺序每次刷新都可能变。
  // 演示数据应该是「正常用起来的样子」，不是边界情况的样本。
  return [
    sampleMistake("cs408", "进程调度周转时间计算", "操作系统", "concept", "待复盘", -1, "中等"),
    sampleMistake("math1", "二重积分换元边界", "高等数学", "method", "已整理", -3, "困难")
  ];
}

/**
 * 种子数据的「指纹」。
 *
 * 判定只用内容指纹，**不看 id**：老版本用 crypto.randomUUID() 生成 id，
 * 那批已经漏进云端的记录认不出来，得靠内容兜住。而如果拿 id 前缀当标记，
 * 用户改过一条演示数据之后它仍然是「demo-」，就永远不会被同步 ——
 * 改过的数据反而丢了。只看内容就没这个问题：改过就不再算演示数据，
 * 会正常参与同步。
 *
 * 这几条的科目、名称、分数、用时、备注都是写死的常量，真实数据撞不上。
 */
function recordFingerprint(record) {
  return [record.subjectId, record.paperName, record.score, record.fullScore, record.durationMinutes, record.note].join("|");
}

function mistakeFingerprint(mistake) {
  return [mistake.subjectId, mistake.title, mistake.knowledgePoint, mistake.reason].join("|");
}

const DEMO_RECORD_FINGERPRINTS = new Set(createDemoRecords().map(recordFingerprint));
const DEMO_MISTAKE_FINGERPRINTS = new Set(createDemoMistakes().map(mistakeFingerprint));

export function isDemoRecord(record) {
  return Boolean(record) && DEMO_RECORD_FINGERPRINTS.has(recordFingerprint(record));
}

export function isDemoMistake(mistake) {
  return Boolean(mistake) && DEMO_MISTAKE_FINGERPRINTS.has(mistakeFingerprint(mistake));
}

const DEMO_SEEDED_KEY = "exam-tracker-demo-seeded";

function hasSeededDemo() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DEMO_SEEDED_KEY) === "1";
  } catch {
    return false;
  }
}

function markDemoSeeded() {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(DEMO_SEEDED_KEY, "1");
  } catch {
    /* 存不进去就退化成「空库时还可能再种一次」，不影响主流程 */
  }
}

/**
 * 补齐默认科目，并在明确允许时灌一次演示数据。
 *
 * 演示数据以前是**无条件**灌的：只要 records / mistakes 表为空就写 4 条成绩
 * 加 2 道错题。后果是它会被同步当成「本地新增」上传到云端，从此每台设备、
 * 每次同步都会把它拉回来 —— 用户看到的就是「几条自己从没记过的成绩」。
 * 所以现在改成三条约束：
 *   1. 默认**不灌**，seedDemo 由调用方显式开启（只在纯本地模式开）；
 *   2. 只在 records 和 mistakes **都**为空时灌 —— 以前各自独立判断，
 *      把错题删光也会被重新塞两道进来；
 *   3. 灌过一次就不再灌，否则用户删掉之后下次空库又冒出来。
 */
export async function seedIfEmpty({ seedDemo = false } = {}) {
  const subjectCount = await db.subjects.count();
  if (!subjectCount) {
    await db.subjects.bulkPut(defaultSubjects);
  } else {
    await db.subjects.bulkPut(normalizeSubjects(await db.subjects.toArray()));
  }

  if (!seedDemo || hasSeededDemo()) return;

  const recordCount = await db.records.count();
  const mistakeCount = await db.mistakes.count();
  if (recordCount || mistakeCount) return;

  await db.records.bulkPut(createDemoRecords());
  await db.mistakes.bulkPut(createDemoMistakes());
  markDemoSeeded();
}

export async function loadAllData(options = {}) {
  await seedIfEmpty(options);
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

function sampleRecord(subjectId, paperName, daysAgo, score, fullScore, durationMinutes, note, paperVariant = "") {
  const date = new Date();
  date.setDate(date.getDate() + daysAgo);
  return {
    id: `demo-record-${subjectId}`,
    subjectId,
    paperName,
    paperVariant,
    score,
    fullScore,
    durationMinutes,
    date: date.toISOString().slice(0, 10),
    note,
    createdAt: date.toISOString()
  };
}

function sampleMistake(subjectId, title, knowledgePoint, reason, status, daysAgo, difficulty) {
  // 创建时间用「几天前」，和 sampleRecord 一样 —— 真实数据本来就有先后，
  // 两条种子错题都取当前毫秒的话时间戳会完全相同，排序只能靠 id 兜底。
  const created = new Date();
  created.setDate(created.getDate() + daysAgo);
  const now = created.toISOString();
  return {
    id: `demo-mistake-${subjectId}`,
    subjectId,
    title,
    knowledgePoint,
    reason,
    difficulty,
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
