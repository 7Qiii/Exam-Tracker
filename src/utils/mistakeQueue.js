import { byId } from "./sorting";

/**
 * 错题复习队列：筛选 + 排序的唯一实现。
 *
 * 列表页和详情页的「上一题 / 下一题」必须走同一套规则，否则会出现
 * 「列表里筛出 5 道，翻页却翻到没筛选的题」这种错位。
 * 所以这里抽出来，两边都调它，筛选条件通过 URL query 传递。
 */

export const MISTAKE_STATUS_OPTIONS = ["待复盘", "不熟", "不会", "已整理", "已掌握"];

export const MISTAKE_DIFFICULTY_OPTIONS = ["简单", "中等", "困难"];

export const MISTAKE_SORT_OPTIONS = [
  { value: "created-desc", label: "最新创建" },
  { value: "created-asc", label: "最早创建" },
  { value: "updated-desc", label: "最近更新" },
  { value: "status", label: "按掌握状态" }
];

const DEFAULT_SORT = "created-desc";

function normalizeSearch(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

/** 从路由 query 里读出筛选条件，非法值一律回落 */
export function readMistakeFilters(query = {}) {
  const pick = (key) => (typeof query[key] === "string" ? query[key] : "");
  const sort = pick("sort");
  return {
    keyword: pick("q"),
    subjectId: pick("subject"),
    knowledgePoint: pick("chapter"),
    status: MISTAKE_STATUS_OPTIONS.includes(pick("status")) ? pick("status") : "",
    difficulty: MISTAKE_DIFFICULTY_OPTIONS.includes(pick("difficulty")) ? pick("difficulty") : "",
    sort: MISTAKE_SORT_OPTIONS.some((item) => item.value === sort) ? sort : DEFAULT_SORT
  };
}

/** 把筛选条件写回 query，空值不写 */
export function toMistakeQuery(filters = {}) {
  const query = {};
  if (filters.keyword) query.q = filters.keyword;
  if (filters.subjectId) query.subject = filters.subjectId;
  if (filters.knowledgePoint) query.chapter = filters.knowledgePoint;
  if (filters.status) query.status = filters.status;
  if (filters.difficulty) query.difficulty = filters.difficulty;
  if (filters.sort && filters.sort !== DEFAULT_SORT) query.sort = filters.sort;
  return query;
}

export function hasActiveMistakeFilters(filters = {}) {
  return Boolean(
    filters.keyword ||
      filters.subjectId ||
      filters.knowledgePoint ||
      filters.status ||
      filters.difficulty ||
      (filters.sort && filters.sort !== DEFAULT_SORT)
  );
}

/**
 * @param {Array} mistakes 全量错题
 * @param {object} filters readMistakeFilters() 的返回值
 * @param {(id:string)=>string} subjectName 科目名解析函数
 */
export function filterAndSortMistakes(mistakes, filters, subjectName = () => "") {
  const keyword = normalizeSearch(filters.keyword);
  const list = mistakes.filter((item) => {
    const haystack = normalizeSearch(
      [item.title, item.knowledgePoint, item.analysis, item.questionText, subjectName(item.subjectId)].join(" ")
    );
    return (
      (!keyword || haystack.includes(keyword)) &&
      (!filters.subjectId || item.subjectId === filters.subjectId) &&
      (!filters.knowledgePoint || (item.knowledgePoint || "") === filters.knowledgePoint) &&
      (!filters.status || (item.status || "待复盘") === filters.status) &&
      (!filters.difficulty || (item.difficulty || "") === filters.difficulty)
    );
  });

  // 每个比较函数都以 id 兜底：createdAt / updatedAt 相同时（批量导入、同一天连续录入）
  // 顺序会退化成 store 里数组的原始顺序，列表和「上一题 / 下一题」就会飘。
  // byId 的定义和原因见 utils/sorting.js。
  const byCreatedAsc = (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || byId(a, b);
  const byCreatedDesc = (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || byId(a, b);
  const byUpdatedDesc = (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || byId(a, b);
  // 状态排序同组内按创建时间倒序，保持「新题在前」的直觉
  const byStatus = (a, b) => String(a.status || "").localeCompare(String(b.status || ""), "zh-Hans-CN") || byCreatedDesc(a, b);

  if (filters.sort === "created-asc") return list.sort(byCreatedAsc);
  if (filters.sort === "status") return list.sort(byStatus);
  if (filters.sort === "updated-desc") return list.sort(byUpdatedDesc);
  return list.sort(byCreatedDesc);
}
