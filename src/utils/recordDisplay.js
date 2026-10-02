/**
 * 成绩的「显示名」和几个纯格式化函数。
 *
 * 单独抽出来是因为导出弹窗（ExportDialog.vue）和成绩列表（RecordsPage.vue）
 * 必须用**同一份**实现 —— 两边各写一套，预览里看到的卷子名和列表里看到的
 * 迟早会对不上，而这种不一致极难排查。
 */

/** 列表和预览里显示的那一行名字：习题会带上书名 / 页码 / 题号 */
export function recordTitle(record) {
  if (record.recordType !== "exercise") return record.paperName;
  return [
    record.exerciseBookName || record.paperName,
    record.exercisePage ? `P${record.exercisePage}` : "",
    record.exerciseQuestion ? `第 ${record.exerciseQuestion} 题` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 优先用记录日期里的年份，没有就退回卷子名里的 4 位年份，都没有算 0 */
export function recordYear(record) {
  const dateYear = String(record?.date || "").match(/\d{4}/)?.[0];
  if (dateYear) return Number(dateYear);
  const titleYear = String(record?.paperName || "").match(/(?:19|20)\d{2}/)?.[0];
  return titleYear ? Number(titleYear) : 0;
}

export function recordTypeLabel(record) {
  if (record.recordType === "composite") return "合成";
  return record.recordType === "exercise" ? "习题" : "试卷";
}

/**
 * 卷型归一：显式字段优先，其次从卷子名里猜（含「模拟 / 模考」算模拟卷，
 * 含「真题 / 历年」算真题），都判断不出来返回空串。
 */
export function normalizePaperVariant(record) {
  const raw = String(record?.paperVariant || "").trim().toLowerCase();
  if (raw === "true" || raw === "mock") return raw;
  const name = String(record?.paperName || "").trim().toLowerCase();
  if (/mock|模拟|模考/.test(name)) return "mock";
  if (/真题|历年|历届/.test(name)) return "true";
  return "";
}

/** 只有数学一的试卷才分真题 / 模拟卷，其它科目没有卷型这个概念 */
export function recordVariantLabel(record) {
  if (record.subjectId !== "math1" || (record.recordType || "paper") !== "paper") return "";
  const value = normalizePaperVariant(record);
  if (value === "true") return "真题";
  if (value === "mock") return "模拟卷";
  return "未分类";
}

/** 搜索用：去掉所有空白再转小写，「张宇 八套卷」也能被「张宇八套卷」搜到 */
export function normalizeSearch(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function formatDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "未记录";
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${value} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function normalizeScoreValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function formatScoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}
