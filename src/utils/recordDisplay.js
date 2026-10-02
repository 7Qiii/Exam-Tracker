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

/**
 * 用时（整数分钟）的归一。
 *
 * 空、null、undefined、非数字、负数一律返回 ""，而不是 0 ——
 * 「没记录用时」和「用时为 0」是两回事，store 里的 hasDuration() 也是按
 * `!== ""` 判定的。把空值落成 0 会让「未记录用时」的健康检查漏报。
 * 小数四舍五入：界面上不显示秒，89.6 分钟就是 90 分钟。
 */
export function normalizeDurationMinutes(value) {
  if (value === "" || value === null || value === undefined) return "";
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : "";
}

/**
 * 整数分钟 → 两个输入框的值。
 *
 * 「用时」在录入端是「小时 + 分钟」两个框，在存储和展示端是一个整数分钟。
 * 这里负责前者到后者的拆解，composeDuration 负责合回去，两者必须成对使用：
 * 拆了再合必须还原成同一个数，否则用户一打开编辑框、什么都没改就保存，
 * 数据就悄悄变了。
 */
export function splitDurationMinutes(value) {
  const total = normalizeDurationMinutes(value);
  if (total === "") return { hours: "", minutes: "" };
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

/**
 * 「小时 + 分钟」两个输入框的值 → 整数分钟。
 *
 * 两个框都空返回 ""（未记录），只要填了一个就按 0 补齐另一个。
 * 分钟填超过 59 会自动进位（填 90 → 1 小时 30 分），
 * 这样用户在分钟框里写 90 也能得到对的结果，而不是被截成 30。
 */
export function composeDuration(hoursValue, minutesValue) {
  const hasHours = hoursValue !== "" && hoursValue !== null && hoursValue !== undefined;
  const hasMinutes = minutesValue !== "" && minutesValue !== null && minutesValue !== undefined;
  if (!hasHours && !hasMinutes) return "";
  // 小时向下取整：小时框里出现 1.5 时按 1 小时算，用户会立刻看到输入框跳回 1，
  // 比悄悄按 90 分钟算更好解释（分钟框才是表达零头的地方）。
  const hours = hasHours ? Math.floor(Number(hoursValue)) : 0;
  const minutes = hasMinutes ? Math.round(Number(minutesValue)) : 0;
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return safeHours * 60 + safeMinutes;
}

/**
 * 整数分钟 → 人话。
 *
 * emptyLabel 可配是因为各处的空态文案不一样：列表和导出里写「未记录」，
 * 仪表盘和热力图里写「未记录用时」。除了这一句，其它分支完全一致 ——
 * 之前有三个文件各写了一份这个函数，改动任何一处都会让同一份数据
 * 在不同页面上显示成不同的样子。
 */
export function formatDuration(minutes, { emptyLabel = "未记录" } = {}) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return emptyLabel;
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
