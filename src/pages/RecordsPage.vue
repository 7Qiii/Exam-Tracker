<script setup>
import { computed, nextTick, reactive, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  BookOpenCheck,
  Calculator,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  EyeOff,
  FileSpreadsheet,
  MoveRight,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Trash2,
  X
} from "@lucide/vue";
import RecordForm from "../components/RecordForm.vue";
import { exportColumnGroups, exportColumnOptions, exportThemeOptions } from "../services/excelExport";
import { useTrackerStore } from "../stores/tracker";

const HEALTH_IGNORE_KEY = "exam-tracker-ignored-health-issues";
const store = useTrackerStore();
const router = useRouter();
const page = ref(1);
const pageSize = 8;
const sortBy = ref("date-desc");
const isSortMenuOpen = ref(false);
const sortOptions = [
  { value: "date-desc", label: "最近日期", shortLabel: "日期 ↓" },
  { value: "date-asc", label: "最早日期", shortLabel: "日期 ↑" },
  { value: "year-desc", label: "年份最新", shortLabel: "年份 ↓" },
  { value: "year-asc", label: "年份最早", shortLabel: "年份 ↑" },
  { value: "rate-desc", label: "得分率最高", shortLabel: "得分率 ↓" },
  { value: "rate-asc", label: "得分率最低", shortLabel: "得分率 ↑" },
  { value: "score-desc", label: "得分最高", shortLabel: "得分 ↓" }
];
const filters = reactive({ keyword: "", subjectId: "", paperVariant: "all" });
const draftFilters = reactive({ keyword: "", subjectId: "", paperVariant: "all" });
const showForm = ref(false);
const formPanelRef = ref(null);
const editingRecordId = ref("");
const selectedRecordIds = ref([]);
const compositeForm = reactive({ paperName: "", date: "", note: "" });
const compositeRows = reactive({});
const isCompositeDialogOpen = ref(false);
const isCompositeSaving = ref(false);
const isRestorePanelOpen = ref(false);
const batchSubjectId = ref("");
const isBatchWorking = ref(false);
const workingRecordActions = reactive(new Set());
const isExportDialogOpen = ref(false);
const recommendedExportColumns = ["subject", "record", "scoreText", "note"];
const exportForm = reactive({
  scope: "filtered",
  sheetMode: "single",
  theme: "ocean",
  filename: `成绩导出-${new Date().toISOString().slice(0, 10)}`,
  includeSummary: false,
  subjectIds: [],
  recordType: "all",
  paperVariant: "all",
  columns: [...recommendedExportColumns]
});
const ignoredHealthIssueIds = ref(readIgnoredHealthIssues());
const isIgnoredHealthOpen = ref(false);
const isHealthPanelExpanded = ref(false);

const paperVariantOptions = [
  { value: "all", label: "全部" },
  { value: "true", label: "真题" },
  { value: "mock", label: "模拟卷" }
];
const exportRecordTypeOptions = [
  { value: "all", label: "全部类型", hint: "试卷、习题、合成" },
  { value: "paper", label: "试卷", hint: "成套成绩" },
  { value: "exercise", label: "习题", hint: "单题或习题册" },
  { value: "composite", label: "合成", hint: "汇总成绩" }
];
const exportPaperVariantOptions = [
  { value: "all", label: "全部卷型", hint: "不限制真题/模拟" },
  { value: "true", label: "真题", hint: "历年真题" },
  { value: "mock", label: "模拟卷", hint: "模考套卷" }
];
const isMathDraftFilter = computed(() => draftFilters.subjectId === "math1");

const filteredRecords = computed(() => {
  const keyword = normalizeSearch(filters.keyword);
  return [...store.records]
    .filter((record) => {
      const subject = store.subjectName(record.subjectId);
      const haystack = normalizeSearch([
        record.paperName,
        recordTypeLabel(record),
        recordVariantLabel(record),
        record.exerciseBookName,
        record.exercisePage,
        record.exerciseQuestion,
        record.note,
        subject,
        record.score,
        record.fullScore,
        record.durationMinutes,
        formatDuration(record.durationMinutes),
        record.date,
        `${record.score}/${record.fullScore}`,
        `${record.score} / ${record.fullScore}`
      ].join(" "));
      return (
        (!keyword || haystack.includes(keyword)) &&
        (!filters.subjectId || record.subjectId === filters.subjectId) &&
        matchesPaperVariantFilter(record)
      );
    })
    .sort(compareRecords);
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize)));
const pagedRecords = computed(() => filteredRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const exportBaseRecords = computed(() => {
  if (exportForm.scope === "selected") return selectedRecords.value;
  if (exportForm.scope === "all") return store.records;
  return filteredRecords.value;
});
const exportSourceRecords = computed(() => exportBaseRecords.value.filter(matchesExportFilters));
const exportAvailableSubjects = computed(() => {
  const counts = new Map();
  exportBaseRecords.value.forEach((record) => counts.set(record.subjectId, (counts.get(record.subjectId) || 0) + 1));
  const knownSubjects = store.subjects.filter((subject) => counts.has(subject.id)).map((subject) => ({ ...subject, count: counts.get(subject.id) }));
  const knownIds = new Set(knownSubjects.map((subject) => subject.id));
  const unknownSubjects = [...counts.entries()]
    .filter(([id]) => !knownIds.has(id))
    .map(([id, count]) => ({ id, name: store.subjectName(id), color: store.subjectColor(id), count }));
  return [...knownSubjects, ...unknownSubjects];
});
const exportSubjectCount = computed(() => new Set(exportSourceRecords.value.map((record) => record.subjectId)).size);
const exportSelectionLabel = computed(() => {
  if (exportForm.scope === "selected") return `已选 ${selectedRecords.value.length} 条`;
  if (exportForm.scope === "all") return `全部 ${store.records.length} 条`;
  return hasActiveFilters.value ? `当前筛选 ${filteredRecords.value.length} 条` : `当前列表 ${filteredRecords.value.length} 条`;
});
const exportSubjectLabel = computed(() => {
  if (!exportForm.subjectIds.length) return "全部科目";
  if (exportForm.subjectIds.length === 1) return store.subjectName(exportForm.subjectIds[0]);
  return `${exportForm.subjectIds.length} 个科目`;
});
const exportTypeLabel = computed(() => {
  const type = exportRecordTypeOptions.find((option) => option.value === exportForm.recordType)?.label || "全部类型";
  const variant = exportPaperVariantOptions.find((option) => option.value === exportForm.paperVariant)?.label || "全部卷型";
  return exportForm.paperVariant === "all" ? type : `${type} · ${variant}`;
});
const exportPreviewColumns = computed(() => exportColumnOptions.filter((column) => exportForm.columns.includes(column.id)));
const exportPreviewRows = computed(() => exportSourceRecords.value.map((record) => buildExportPreviewRow(record)));
const exportPreviewAverageRow = computed(() => buildExportAverageRow(exportSourceRecords.value));
const exportPreviewCount = computed(() => exportPreviewRows.value.length + (exportPreviewAverageRow.value ? 1 : 0));
const currentSortOption = computed(() => sortOptions.find((option) => option.value === sortBy.value) || sortOptions[0]);
const editingRecord = computed(() => store.records.find((record) => record.id === editingRecordId.value) || null);
const hasActiveFilters = computed(() => Boolean(filters.keyword || filters.subjectId || filters.paperVariant !== "all"));
const selectableFilteredRecords = computed(() => filteredRecords.value.filter((record) => record.recordType !== "composite"));
const selectedRecords = computed(() =>
  selectedRecordIds.value
    .map((id) => store.records.find((record) => record.id === id))
    .filter((record) => record && record.recordType !== "composite")
);
const allFilteredRecordsSelected = computed(() => {
  if (!selectableFilteredRecords.value.length) return false;
  const selectedIds = new Set(selectedRecordIds.value);
  return selectableFilteredRecords.value.every((record) => selectedIds.has(record.id));
});
const selectedSubjectCount = computed(() => new Set(selectedRecords.value.map((record) => record.subjectId)).size);
const canCreateComposite = computed(() => selectedRecords.value.length >= 2 && selectedSubjectCount.value === 1 && compositeSummary.value.fullScore > 0);
const selectedCompositeRows = computed(() => selectedRecords.value.map((record) => ({ record, draft: compositeRows[record.id] })).filter((item) => item.draft));
const selectedAverageStats = computed(() => {
  const records = selectedRecords.value;
  const scoredRecords = records.filter((record) => normalizeScoreValue(record.fullScore) > 0);
  const totalScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.score), 0);
  const totalFullScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.fullScore), 0);
  const durations = records
    .map((record) => normalizeDuration(record.durationMinutes))
    .filter((value) => value !== "");
  const avgScore = scoredRecords.length ? totalScore / scoredRecords.length : 0;
  const avgFullScore = scoredRecords.length ? totalFullScore / scoredRecords.length : 0;
  const avgRate = totalFullScore > 0 ? Math.round((totalScore / totalFullScore) * 100) : 0;
  const avgDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + Number(value), 0) / durations.length) : "";
  const subjectName = selectedSubjectCount.value === 1 && records.length ? store.subjectName(records[0].subjectId) : "多科目";
  return {
    avgScore,
    avgFullScore,
    avgRate,
    avgDuration,
    count: records.length,
    scoredCount: scoredRecords.length,
    subjectName,
    isReady: records.length > 0 && selectedSubjectCount.value === 1 && scoredRecords.length > 0
  };
});
const compositeSummary = computed(() => {
  const score = selectedCompositeRows.value.reduce((sum, item) => sum + normalizeScoreValue(item.draft.score), 0);
  const fullScore = selectedCompositeRows.value.reduce((sum, item) => sum + normalizeScoreValue(item.draft.fullScore), 0);
  const durations = selectedCompositeRows.value.map((item) => normalizeDuration(item.draft.durationMinutes));
  const durationMinutes = durations.every((value) => value !== "") ? durations.reduce((sum, value) => sum + Number(value), 0) : "";
  const latestDate = selectedRecords.value.map((record) => record.date).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10);
  return { score, fullScore, durationMinutes, latestDate };
});
const defaultCompositeName = computed(() => {
  const year = commonYearLabel(selectedRecords.value);
  return year ? `${year} 合成成绩` : "合成成绩";
});
const dashboardStats = computed(() => {
  const records = filteredRecords.value;
  const scoredRecords = records.filter((record) => normalizeScoreValue(record.fullScore) > 0);
  const totalScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.score), 0);
  const totalFullScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.fullScore), 0);
  const scoreRate = totalFullScore > 0 ? Math.round((totalScore / totalFullScore) * 100) : 0;
  const timedDurations = records
    .map((record) => normalizeDuration(record.durationMinutes))
    .filter((value) => value !== "");
  const timedCount = timedDurations.length;
  const avgDuration = timedCount ? Math.round(timedDurations.reduce((sum, value) => sum + Number(value), 0) / timedCount) : "";
  const syncedCount = records.filter((record) => !record.pendingSync).length;
  const latestDate = records.map((record) => record.date).filter(Boolean).sort().at(-1) || "—";
  return {
    totalRecords: records.length,
    scoreRate,
    totalScore,
    totalFullScore,
    timedCount,
    avgDuration,
    syncedCount,
    latestDate
  };
});
const topSubject = computed(() => {
  const counts = new Map();
  filteredRecords.value.forEach((record) => {
    counts.set(record.subjectId, (counts.get(record.subjectId) || 0) + 1);
  });
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner ? { name: store.subjectName(winner[0]), count: winner[1] } : { name: "暂无", count: 0 };
});
const selectionProgress = computed(() => {
  const total = selectedRecords.value.length;
  return total >= 2 ? Math.min(100, Math.round((total / 4) * 100)) : total ? 25 : 0;
});
const shouldShowRestorePanel = computed(() => isRestorePanelOpen.value || store.deletedRecords.length > 0);
const rawHealthIssues = computed(() => buildHealthIssues());
const ignoredHealthIssues = computed(() => rawHealthIssues.value.filter((issue) => ignoredHealthIssueIds.value.includes(issue.id)));
const healthIssues = computed(() => rawHealthIssues.value.filter((issue) => !ignoredHealthIssueIds.value.includes(issue.id)));
const healthIssueCount = computed(() => healthIssues.value.reduce((sum, issue) => sum + issue.count, 0));
const ignoredHealthIssueCount = computed(() => ignoredHealthIssues.value.length);
const healthStatusText = computed(() => {
  if (healthIssueCount.value) return `${healthIssueCount.value} 个待整理点`;
  if (ignoredHealthIssueCount.value) return `已忽略 ${ignoredHealthIssueCount.value} 项`;
  return "数据状态良好";
});

watch(() => [filters.keyword, filters.subjectId, filters.paperVariant], () => {
  page.value = 1;
  const validIds = new Set(selectableFilteredRecords.value.map((record) => record.id));
  selectedRecordIds.value = selectedRecordIds.value.filter((id) => validIds.has(id));
});

watch(
  () => draftFilters.subjectId,
  () => {
    if (draftFilters.subjectId !== "math1") {
      draftFilters.paperVariant = "all";
    }
  }
);

watch(selectedRecordIds, () => {
  const validIds = selectedRecordIds.value.filter((id) => store.records.some((record) => record.id === id && record.recordType !== "composite"));
  if (validIds.length !== selectedRecordIds.value.length || validIds.some((id, index) => id !== selectedRecordIds.value[index])) {
    selectedRecordIds.value = validIds;
    return;
  }
  syncCompositeRows();
  syncCompositeDefaults();
  if (!selectedRecords.value.length) isCompositeDialogOpen.value = false;
  if (!batchSubjectId.value && selectedRecords.value[0]?.subjectId) {
    batchSubjectId.value = selectedRecords.value[0].subjectId;
  }
});

watch(exportAvailableSubjects, () => {
  const availableIds = new Set(exportAvailableSubjects.value.map((subject) => subject.id));
  const nextIds = exportForm.subjectIds.filter((id) => availableIds.has(id));
  if (nextIds.length !== exportForm.subjectIds.length) {
    exportForm.subjectIds = nextIds;
  }
});

function applyFilters() {
  filters.keyword = draftFilters.keyword;
  filters.subjectId = draftFilters.subjectId;
  filters.paperVariant = draftFilters.subjectId === "math1" ? draftFilters.paperVariant : "all";
  page.value = 1;
  showForm.value = false;
  editingRecordId.value = "";
}

function clearFilters() {
  draftFilters.keyword = "";
  draftFilters.subjectId = "";
  draftFilters.paperVariant = "all";
  applyFilters();
}

function compareRecords(a, b) {
  if (sortBy.value === "year-desc" || sortBy.value === "year-asc") {
    const yearDiff = recordYear(a) - recordYear(b);
    return (sortBy.value === "year-desc" ? -yearDiff : yearDiff) || String(b.date || "").localeCompare(String(a.date || ""));
  }
  if (sortBy.value === "date-asc") {
    return String(a.date || "").localeCompare(String(b.date || "")) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  }
  if (sortBy.value === "rate-desc" || sortBy.value === "rate-asc") {
    const rateDiff = scorePercent(a) - scorePercent(b);
    return (sortBy.value === "rate-desc" ? -rateDiff : rateDiff) || String(b.date || "").localeCompare(String(a.date || ""));
  }
  if (sortBy.value === "score-desc") {
    const scoreDiff = normalizeScoreValue(a.score) - normalizeScoreValue(b.score);
    return -scoreDiff || String(b.date || "").localeCompare(String(a.date || ""));
  }
  return String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

function recordYear(record) {
  const dateYear = String(record?.date || "").match(/\d{4}/)?.[0];
  if (dateYear) return Number(dateYear);
  const titleYear = String(record?.paperName || "").match(/(?:19|20)\d{2}/)?.[0];
  return titleYear ? Number(titleYear) : 0;
}

function chooseSort(value) {
  sortBy.value = value;
  isSortMenuOpen.value = false;
}

function openExportDialog() {
  if (!store.records.length) {
    store.notify("暂无成绩可以导出。", "info");
    return;
  }
  isExportDialogOpen.value = true;
}

function closeExportDialog() {
  isExportDialogOpen.value = false;
}

function matchesExportFilters(record) {
  if (exportForm.subjectIds.length && !exportForm.subjectIds.includes(record.subjectId)) return false;
  if (exportForm.recordType !== "all" && (record.recordType || "paper") !== exportForm.recordType) return false;
  if (exportForm.paperVariant !== "all") {
    return (record.recordType || "paper") === "paper" && normalizePaperVariant(record) === exportForm.paperVariant;
  }
  return true;
}

function toggleExportSubject(subjectId) {
  exportForm.subjectIds = exportForm.subjectIds.includes(subjectId)
    ? exportForm.subjectIds.filter((id) => id !== subjectId)
    : [...exportForm.subjectIds, subjectId];
}

function clearExportSubjects() {
  exportForm.subjectIds = [];
}

function setExportRecordType(value) {
  exportForm.recordType = value;
  if (value !== "all" && value !== "paper") {
    exportForm.paperVariant = "all";
  }
}

function chooseExportPaperVariant(value) {
  if (exportForm.recordType !== "all" && exportForm.recordType !== "paper") return;
  exportForm.paperVariant = value;
}

function toggleExportColumn(columnId) {
  const next = exportForm.columns.includes(columnId)
    ? exportForm.columns.filter((id) => id !== columnId)
    : [...exportForm.columns, columnId];
  if (next.length) exportForm.columns = next;
}

function selectAllExportColumns() {
  exportForm.columns = exportColumnOptions.map((column) => column.id);
}

function resetExportColumns() {
  exportForm.columns = [...recommendedExportColumns];
}

function exportExcel() {
  closeExportDialog();
}

function startCreate() {
  editingRecordId.value = "";
  showForm.value = true;
  revealRecordForm();
}

function startEdit(record) {
  if (!record?.id || isRecordActionWorking(record, "delete")) return;
  editingRecordId.value = record.id;
  showForm.value = true;
  revealRecordForm();
}

function closeForm() {
  showForm.value = false;
  editingRecordId.value = "";
}

function onFormSaved() {
  closeForm();
}

function createMistakeFromRecord(record) {
  if (!record?.id || isRecordActionWorking(record, "delete")) return;
  router.push({ path: "/mistakes", query: { recordId: record.id } });
}

async function revealRecordForm() {
  await nextTick();
  formPanelRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(record) {
  if (!record?.id) return;
  const ok = typeof window === "undefined" || window.confirm(`确定删除「${recordTitle(record)}」吗？24 小时内可以从最近删除恢复。`);
  if (!ok) return;
  await withRecordAction(record, "delete", async () => {
    await store.removeRecord(record.id);
    selectedRecordIds.value = selectedRecordIds.value.filter((id) => id !== record.id);
    delete compositeRows[record.id];
    isRestorePanelOpen.value = true;
  });
}

async function withRecordAction(record, action, runner) {
  const key = recordActionKey(record, action);
  if (workingRecordActions.has(key)) return;
  workingRecordActions.add(key);
  try {
    await runner();
  } catch (error) {
    store.notify(error.message || "成绩操作失败，请稍后重试。", "error", 6000);
  } finally {
    workingRecordActions.delete(key);
  }
}

function recordActionKey(record, action) {
  return `${record?.id || "unknown"}:${action}`;
}

function isRecordActionWorking(record, action) {
  return workingRecordActions.has(recordActionKey(record, action));
}

function toggleSelect(record) {
  if (record.recordType === "composite") return;
  selectedRecordIds.value = isSelected(record.id)
    ? selectedRecordIds.value.filter((id) => id !== record.id)
    : [...selectedRecordIds.value, record.id];
}

function isSelected(id) {
  return selectedRecordIds.value.includes(id);
}

function clearSelection() {
  selectedRecordIds.value = [];
  Object.keys(compositeRows).forEach((id) => delete compositeRows[id]);
  compositeForm.paperName = "";
  compositeForm.note = "";
  compositeForm.date = "";
  isCompositeDialogOpen.value = false;
}

function selectAllFilteredRecords() {
  const ids = selectableFilteredRecords.value.map((record) => record.id);
  if (!ids.length) return;
  selectedRecordIds.value = allFilteredRecordsSelected.value ? [] : ids;
}

function closeCompositeDialog() {
  isCompositeDialogOpen.value = false;
}

function openCompositeDialog() {
  if (selectedRecords.value.length) {
    syncCompositeRows();
    syncCompositeDefaults();
    isCompositeDialogOpen.value = true;
  }
}

function removeCompositeSource(id) {
  selectedRecordIds.value = selectedRecordIds.value.filter((selectedId) => selectedId !== id);
  delete compositeRows[id];
  if (!selectedRecordIds.value.length) {
    clearSelection();
  }
}

function syncCompositeRows(force = false) {
  const selectedIds = new Set(selectedRecords.value.map((record) => record.id));
  Object.keys(compositeRows).forEach((id) => {
    if (!selectedIds.has(id)) delete compositeRows[id];
  });
  selectedRecords.value.forEach((record) => {
    if (!compositeRows[record.id] || force) {
      compositeRows[record.id] = {
        score: String(record.score ?? ""),
        fullScore: String(record.fullScore ?? ""),
        durationMinutes: normalizeDuration(record.durationMinutes) === "" ? "" : String(normalizeDuration(record.durationMinutes))
      };
    }
  });
}

function syncCompositeDefaults(force = false) {
  if (!selectedRecords.value.length) return;
  compositeForm.date = compositeSummary.value.latestDate;
  if (force || !compositeForm.paperName) compositeForm.paperName = defaultCompositeName.value;
}

function resetCompositeValues() {
  if (!selectedRecords.value.length) return;
  syncCompositeRows(true);
  compositeForm.paperName = defaultCompositeName.value;
}

async function restoreDeletedRecord(entry) {
  await store.restoreDeletedRecord(entry.id);
  if (!store.deletedRecords.length) isRestorePanelOpen.value = false;
}

function toggleRestorePanel() {
  isRestorePanelOpen.value = !isRestorePanelOpen.value;
}

async function batchMoveSelectedRecords() {
  if (!selectedRecords.value.length || !batchSubjectId.value) return;
  isBatchWorking.value = true;
  try {
    const records = [...selectedRecords.value];
    for (const record of records) {
      if (record.subjectId !== batchSubjectId.value) {
        await store.updateRecord(record.id, buildRecordUpdatePayload(record, { subjectId: batchSubjectId.value }));
      }
    }
    store.notify(`已批量调整 ${records.length} 条成绩科目。`, "success");
  } catch (error) {
    store.notify(error.message || "批量改科目失败。", "error", 6000);
  } finally {
    isBatchWorking.value = false;
  }
}

async function batchDeleteSelectedRecords() {
  if (!selectedRecords.value.length) return;
  const count = selectedRecords.value.length;
  if (typeof window !== "undefined" && !window.confirm(`确定删除选中的 ${count} 条成绩吗？24 小时内可以从最近删除恢复。`)) return;
  isBatchWorking.value = true;
  try {
    const ids = selectedRecords.value.map((record) => record.id);
    for (const id of ids) {
      await store.removeRecord(id);
    }
    clearSelection();
    isRestorePanelOpen.value = true;
    store.notify(`${count} 条成绩已移入最近删除。`, "success", 5200);
  } catch (error) {
    store.notify(error.message || "批量删除失败。", "error", 6000);
  } finally {
    isBatchWorking.value = false;
  }
}

function selectHealthIssue(issue) {
  draftFilters.keyword = "";
  draftFilters.subjectId = "";
  draftFilters.paperVariant = "all";
  filters.keyword = "";
  filters.subjectId = "";
  filters.paperVariant = "all";
  page.value = 1;
  showForm.value = false;
  editingRecordId.value = "";
  selectedRecordIds.value = issue.records.filter((record) => record.recordType !== "composite").map((record) => record.id);
}

function ignoreHealthIssue(issue) {
  if (!issue?.id || ignoredHealthIssueIds.value.includes(issue.id)) return;
  saveIgnoredHealthIssues([...ignoredHealthIssueIds.value, issue.id]);
  store.notify(`已忽略「${issue.title}」，之后不再显示。`, "success");
}

function restoreIgnoredHealthIssue(id) {
  saveIgnoredHealthIssues(ignoredHealthIssueIds.value.filter((item) => item !== id));
}

function clearIgnoredHealthIssues() {
  saveIgnoredHealthIssues([]);
}

function readIgnoredHealthIssues() {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HEALTH_IGNORE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveIgnoredHealthIssues(ids) {
  ignoredHealthIssueIds.value = [...new Set(ids)];
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(HEALTH_IGNORE_KEY, JSON.stringify(ignoredHealthIssueIds.value));
  }
}

async function createCompositeRecord() {
  if (!canCreateComposite.value) return;
  isCompositeSaving.value = true;
  try {
    await store.addCompositeRecord(selectedRecordIds.value, {
      paperName: compositeForm.paperName || defaultCompositeName.value,
      score: compositeSummary.value.score,
      fullScore: compositeSummary.value.fullScore,
      durationMinutes: compositeSummary.value.durationMinutes,
      date: compositeForm.date || compositeSummary.value.latestDate,
      note: compositeForm.note,
      sources: selectedCompositeRows.value.map(({ record, draft }) => ({
        id: record.id,
        score: draft.score,
        fullScore: draft.fullScore,
        durationMinutes: draft.durationMinutes
      }))
    });
    clearSelection();
  } catch (error) {
    store.notify(error.message || "合成成绩创建失败。", "error", 6000);
  } finally {
    isCompositeSaving.value = false;
  }
}

function recordTitle(record) {
  if (record.recordType !== "exercise") return record.paperName;
  return [record.exerciseBookName || record.paperName, record.exercisePage ? `P${record.exercisePage}` : "", record.exerciseQuestion ? `第 ${record.exerciseQuestion} 题` : ""]
    .filter(Boolean)
    .join(" · ");
}

function recordTypeLabel(record) {
  if (record.recordType === "composite") return "合成";
  return record.recordType === "exercise" ? "习题" : "试卷";
}

function matchesPaperVariantFilter(record) {
  if (filters.subjectId !== "math1" || filters.paperVariant === "all") return true;
  return record.subjectId === "math1" && (record.recordType || "paper") === "paper" && normalizePaperVariant(record) === filters.paperVariant;
}

function recordVariantLabel(record) {
  if (record.subjectId !== "math1" || (record.recordType || "paper") !== "paper") return "";
  const value = normalizePaperVariant(record);
  if (value === "true") return "真题";
  if (value === "mock") return "模拟卷";
  return "未分类";
}

function normalizePaperVariant(record) {
  const raw = String(record?.paperVariant || "").trim().toLowerCase();
  if (raw === "true" || raw === "mock") return raw;
  const name = String(record?.paperName || "").trim().toLowerCase();
  if (/mock|模拟|模考/.test(name)) return "mock";
  if (/真题|历年|历届/.test(name)) return "true";
  return "";
}

function buildRecordUpdatePayload(record, overrides = {}) {
  const subjectId = overrides.subjectId || record.subjectId;
  const targetIsMath = subjectId === "math1";
  const recordType = !targetIsMath && record.recordType === "exercise" ? "paper" : record.recordType || "paper";
  return {
    subjectId,
    recordType,
    paperVariant: subjectId === "math1" && recordType === "paper" ? normalizePaperVariant(record) : "",
    paperName: recordType === "exercise" ? record.paperName : recordTitle(record),
    exerciseBookName: recordType === "exercise" ? record.exerciseBookName || "" : "",
    exercisePage: recordType === "exercise" ? record.exercisePage || "" : "",
    exerciseQuestion: recordType === "exercise" ? record.exerciseQuestion || "" : "",
    score: record.score,
    fullScore: record.fullScore,
    durationMinutes: record.durationMinutes,
    date: record.date,
    note: store.displayRecordNote(record) || ""
  };
}

function buildHealthIssues() {
  const records = store.records.filter((record) => record.recordType !== "composite");
  const issues = [];
  const untimed = records.filter((record) => normalizeDuration(record.durationMinutes) === "");
  const invalidScore = records.filter((record) => {
    const score = Number(record.score);
    const fullScore = Number(record.fullScore);
    return !Number.isFinite(score) || !Number.isFinite(fullScore) || score < 0 || fullScore <= 0 || score > fullScore;
  });
  const pendingSync = records.filter((record) => record.pendingSync);
  const exactDuplicates = duplicateGroups(records, exactRecordKey).flatMap((group) => group);
  const sameNameRecords = duplicateGroups(records, nameRecordKey)
    .filter((group) => new Set(group.map((record) => `${record.date}|${record.score}|${record.fullScore}`)).size > 1)
    .flatMap((group) => group);

  if (untimed.length) {
    issues.push({
      id: "untimed",
      title: "未记录用时",
      description: "这些成绩没有计时，会影响平均用时和节奏复盘。",
      count: untimed.length,
      tone: "blue",
      records: untimed
    });
  }
  if (invalidScore.length) {
    issues.push({
      id: "invalid-score",
      title: "分数异常",
      description: "包含得分超过满分、满分为空或负数等问题。",
      count: invalidScore.length,
      tone: "red",
      records: invalidScore
    });
  }
  if (exactDuplicates.length) {
    issues.push({
      id: "duplicates",
      title: "疑似重复",
      description: "科目、名称、日期和分数完全一致，可能是重复录入。",
      count: exactDuplicates.length,
      tone: "orange",
      records: exactDuplicates
    });
  }
  if (sameNameRecords.length) {
    issues.push({
      id: "same-name",
      title: "同名记录",
      description: "同一科目下存在同名成绩，适合检查是否需要重命名。",
      count: sameNameRecords.length,
      tone: "purple",
      records: sameNameRecords
    });
  }
  if (pendingSync.length) {
    issues.push({
      id: "pending-sync",
      title: "待同步",
      description: "这些记录还没有确认写入云端，建议稍后手动同步。",
      count: pendingSync.length,
      tone: "blue",
      records: pendingSync
    });
  }
  return issues;
}

function duplicateGroups(records, keyBuilder) {
  const groups = new Map();
  records.forEach((record) => {
    const key = keyBuilder(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) || []), record]);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

function exactRecordKey(record) {
  return [record.subjectId, record.recordType || "paper", normalizePaperVariant(record), normalizeSearch(recordTitle(record)), record.date, record.score, record.fullScore].join("|");
}

function nameRecordKey(record) {
  return [record.subjectId, record.recordType || "paper", normalizePaperVariant(record), normalizeSearch(recordTitle(record))].join("|");
}

function commonYearLabel(records) {
  const years = [...new Set(records.map((record) => String(record.paperName || "").match(/\d{2,4}/)?.[0]).filter(Boolean))];
  if (years.length !== 1) return "";
  return years[0].length === 2 ? `20${years[0]}` : years[0];
}

function normalizeSearch(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function formatDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "未记录";
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${value} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function normalizeDuration(value) {
  if (value === "" || value === null || value === undefined) return "";
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : "";
}

function normalizeScoreValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function formatScoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function subjectAccentStyle(record) {
  return { "--subject-color": store.subjectColor(record.subjectId) };
}

function scorePercent(record) {
  const fullScore = normalizeScoreValue(record.fullScore);
  if (!fullScore) return 0;
  const rate = Math.round((normalizeScoreValue(record.score) / fullScore) * 100);
  return Math.max(0, Math.min(100, rate));
}

function scoreBarStyle(record) {
  const percent = scorePercent(record);
  const subjectColor = store.subjectColor(record.subjectId);
  const performanceColor = percent >= 90 ? "#22c55e" : percent >= 60 ? "#38bdf8" : "#f97316";
  const color = `linear-gradient(90deg, ${subjectColor} 0%, ${performanceColor} 100%)`;
  return { width: `${percent}%`, background: color };
}

function buildExportPreviewRow(record) {
  const score = formatScoreValue(record.score);
  const fullScore = formatScoreValue(record.fullScore);
  return {
    id: record.id,
    subject: store.subjectName(record.subjectId),
    year: recordYear(record) || "",
    record: recordTitle(record),
    date: record.date || "",
    type: recordTypeLabel(record),
    variant: recordVariantLabel(record),
    scoreText: `${score} / ${fullScore}`,
    score,
    fullScore,
    rate: `${scorePercent(record)}%`,
    exerciseBook: record.exerciseBookName || "",
    exercisePage: record.exercisePage || "",
    exerciseQuestion: record.exerciseQuestion || "",
    duration: formatDuration(record.durationMinutes),
    sync: record.pendingSync ? "待同步" : "已同步",
    note: record.note || "",
    subjectColor: store.subjectColor(record.subjectId),
    isSummary: false
  };
}

function buildExportAverageRow(records) {
  const scoredRecords = records.filter((record) => Number(record.fullScore) > 0);
  if (!records.length) return null;
  const totalScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.score), 0);
  const totalFullScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.fullScore), 0);
  const divisor = scoredRecords.length || records.length;
  const avgScore = divisor ? totalScore / divisor : 0;
  const avgFullScore = divisor ? totalFullScore / divisor : 0;
  return {
    id: "average-row",
    subject: "平均",
    year: "",
    record: "平均分",
    date: "",
    type: "",
    variant: "",
    scoreText: `${formatScoreValue(avgScore)} / ${formatScoreValue(avgFullScore)}`,
    score: formatScoreValue(avgScore),
    fullScore: formatScoreValue(avgFullScore),
    rate: totalFullScore ? `${Math.round((totalScore / totalFullScore) * 100)}%` : "0%",
    exerciseBook: "",
    exercisePage: "",
    exerciseQuestion: "",
    duration: "",
    sync: "",
    note: `共 ${records.length} 条`,
    subjectColor: "#2563eb",
    isSummary: true
  };
}
</script>

<template>
  <div class="page-stack">
    <section class="panel records-hero">
      <div class="records-hero-grid">
        <div class="records-hero-copy">
          <p class="eyebrow">成绩</p>
          <h2>成绩工作台</h2>
          <p class="records-hero-desc">记录、计时、合成和同步放在同一处，保留关键操作，减少界面干扰。</p>
          <div class="records-hero-tags">
            <span>{{ hasActiveFilters ? "当前视图已筛选" : "当前视图为全量" }}</span>
            <span>{{ selectedRecords.length ? `已选 ${selectedRecords.length} 条` : "勾选成绩可实时算均分" }}</span>
            <span>{{ topSubject.name }} · {{ topSubject.count }} 条</span>
          </div>
          <div class="records-hero-actions">
            <button class="secondary-button" type="button" @click="openExportDialog">
              <FileSpreadsheet :size="16" />
              在线预览
            </button>
            <button class="primary-button" type="button" @click="startCreate">
              <Plus :size="17" />
              新增成绩
            </button>
            <button class="secondary-button" type="button" @click="clearFilters">
              <Search :size="16" />
              重置筛选
            </button>
          </div>
        </div>
        <div class="records-hero-stats">
          <article class="records-metric">
            <div class="metric-head">
              <Target :size="16" />
              <span>得分率</span>
            </div>
            <strong>{{ dashboardStats.scoreRate }}%</strong>
            <div class="records-progress"><i :style="{ width: `${dashboardStats.scoreRate}%` }"></i></div>
            <small>{{ dashboardStats.totalScore }} / {{ dashboardStats.totalFullScore }}</small>
          </article>
          <article class="records-metric accent">
            <div class="metric-head">
              <Clock3 :size="16" />
              <span>用时记录</span>
            </div>
            <strong>{{ dashboardStats.timedCount }}</strong>
            <small>{{ dashboardStats.avgDuration ? `${formatDuration(dashboardStats.avgDuration)} 平均` : "暂无计时" }}</small>
          </article>
          <article class="records-metric">
            <div class="metric-head">
              <BarChart3 :size="16" />
              <span>当前结果</span>
            </div>
            <strong>{{ dashboardStats.totalRecords }}</strong>
            <small>{{ dashboardStats.latestDate }} · {{ dashboardStats.syncedCount }} 条已同步</small>
          </article>
          <article class="records-metric">
            <div class="metric-head">
              <TrendingUp :size="16" />
              <span>选择分析</span>
            </div>
            <strong>{{ selectedRecords.length }}</strong>
            <small>{{ selectedAverageStats.isReady ? `${selectedAverageStats.subjectName} 均分 ${formatScoreValue(selectedAverageStats.avgScore)}` : `${selectionProgress}% 进入合成准备` }}</small>
            <div class="records-progress subtle"><i :style="{ width: `${selectionProgress}%` }"></i></div>
          </article>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>成绩筛选</h2>
        <div class="topbar-tools">
          <span class="section-meta">{{ filteredRecords.length }} 条结果</span>
          <button class="secondary-button compact" type="button" :disabled="!selectableFilteredRecords.length" @click="selectAllFilteredRecords">
            {{ allFilteredRecordsSelected ? "取消全选" : `全选结果 ${selectableFilteredRecords.length}` }}
          </button>
          <button class="secondary-button compact" type="button" @click="startCreate">
            <Plus :size="15" />
            新增成绩
          </button>
        </div>
      </div>
      <form class="filter-bar with-actions" @submit.prevent="applyFilters">
        <input v-model="draftFilters.keyword" />
        <select v-model="draftFilters.subjectId">
          <option value="">全部科目</option>
          <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
        <div v-if="isMathDraftFilter" class="paper-kind-tabs compact">
          <button
            v-for="option in paperVariantOptions"
            :key="option.value"
            type="button"
            :class="{ active: draftFilters.paperVariant === option.value }"
            @click="draftFilters.paperVariant = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <button class="primary-button" type="submit">
          <Search :size="16" />
          搜索
        </button>
        <button class="secondary-button" type="button" @click="clearFilters">
          <X :size="16" />
          清空
        </button>
      </form>
      <div class="records-query-status">
        <div class="records-query-count">
          <strong>{{ filteredRecords.length }}</strong>
          <span>条成绩匹配当前查询</span>
        </div>
        <div class="records-sort-menu">
          <button class="records-sort-trigger" type="button" :aria-expanded="isSortMenuOpen" aria-haspopup="menu" @click="isSortMenuOpen = !isSortMenuOpen">
            <ArrowDownUp :size="14" />
            <span>{{ currentSortOption.shortLabel }}</span>
          </button>
          <div v-if="isSortMenuOpen" class="records-sort-popover" role="menu">
            <button
              v-for="option in sortOptions"
              :key="option.value"
              type="button"
              role="menuitem"
              :class="{ active: sortBy === option.value }"
              @click="chooseSort(option.value)"
            >
              <span>{{ option.label }}</span>
              <Check v-if="sortBy === option.value" :size="14" />
            </button>
          </div>
        </div>
        <div class="records-query-chips">
          <span v-if="filters.keyword" class="query-chip">关键词：{{ filters.keyword }}</span>
          <span v-if="filters.subjectId" class="query-chip">{{ store.subjectName(filters.subjectId) }}</span>
          <span v-if="filters.paperVariant !== 'all'" class="query-chip">{{ recordVariantLabel({ subjectId: 'math1', recordType: 'paper', paperVariant: filters.paperVariant }) }}</span>
          <span v-if="!hasActiveFilters" class="query-chip neutral">显示全部成绩</span>
          <button v-if="hasActiveFilters" class="query-clear-button" type="button" @click="clearFilters">
            <X :size="13" />
            清除筛选
          </button>
        </div>
      </div>
    </section>

    <section v-if="showForm" ref="formPanelRef" class="panel">
      <div class="section-head">
        <h2>{{ editingRecord ? "编辑成绩" : "新增成绩" }}</h2>
        <button class="secondary-button compact" type="button" @click="closeForm">
          <X :size="15" />
          关闭
        </button>
      </div>
      <RecordForm :key="editingRecordId || 'new-record'" :record="editingRecord" @saved="onFormSaved" />
    </section>

    <div v-if="isExportDialogOpen" class="export-dialog-backdrop" @mousedown.self="closeExportDialog">
      <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        <div class="export-dialog-head">
          <div>
            <p class="eyebrow">在线预览</p>
            <h2 id="export-dialog-title">Excel 表格预览</h2>
            <span class="section-meta">{{ exportSelectionLabel }} · {{ exportSubjectCount }} 个科目 · 所见即所得</span>
          </div>
          <button class="icon-button" type="button" title="关闭预览" aria-label="关闭预览" @click="closeExportDialog">
            <X :size="17" />
          </button>
        </div>

        <div class="export-dialog-layout">
          <div class="export-dialog-main">
            <div class="export-summary-strip">
              <article>
                <span>预览明细</span>
                <strong>{{ exportSourceRecords.length }}</strong>
                <small>{{ exportSubjectLabel }} · {{ exportTypeLabel }}</small>
              </article>
              <article>
                <span>预览行数</span>
                <strong>{{ exportPreviewCount }}</strong>
                <small>底部附平均分</small>
              </article>
            </div>

            <div class="export-option-section">
              <div class="export-option-title">
                <strong>导出范围</strong>
                <span>选择要放进文件的成绩</span>
              </div>
              <div class="export-segmented">
                <button type="button" :class="{ active: exportForm.scope === 'filtered' }" @click="exportForm.scope = 'filtered'">
                  当前查询
                  <small>{{ filteredRecords.length }} 条</small>
                </button>
                <button type="button" :class="{ active: exportForm.scope === 'selected' }" :disabled="!selectedRecords.length" @click="exportForm.scope = 'selected'">
                  已选记录
                  <small>{{ selectedRecords.length }} 条</small>
                </button>
                <button type="button" :class="{ active: exportForm.scope === 'all' }" @click="exportForm.scope = 'all'">
                  全部成绩
                  <small>{{ store.records.length }} 条</small>
                </button>
              </div>
            </div>

            <div class="export-option-section">
              <div class="export-option-title">
                <strong>导出筛选</strong>
                <span>可在导出前单独选择科目、试卷类型和真题 / 模拟卷</span>
              </div>
              <div class="export-filter-block">
                <div class="export-filter-head">
                  <strong>科目</strong>
                  <button type="button" :class="{ active: !exportForm.subjectIds.length }" @click="clearExportSubjects">
                    全部科目
                  </button>
                </div>
                <div class="export-subject-grid">
                  <button
                    v-for="subject in exportAvailableSubjects"
                    :key="subject.id"
                    class="export-subject-option"
                    type="button"
                    :class="{ active: exportForm.subjectIds.includes(subject.id) }"
                    :style="{ '--subject-color': subject.color }"
                    @click="toggleExportSubject(subject.id)"
                  >
                    <span class="subject-dot"></span>
                    <span>{{ subject.name }}</span>
                    <small>{{ subject.count }} 条</small>
                    <Check v-if="exportForm.subjectIds.includes(subject.id)" :size="14" />
                  </button>
                </div>
              </div>
              <div class="export-filter-split">
                <div class="export-filter-block">
                  <div class="export-filter-head">
                    <strong>记录类型</strong>
                  </div>
                  <div class="export-choice-grid">
                    <button
                      v-for="option in exportRecordTypeOptions"
                      :key="option.value"
                      class="export-choice-option"
                      type="button"
                      :class="{ active: exportForm.recordType === option.value }"
                      @click="setExportRecordType(option.value)"
                    >
                      <span>{{ option.label }}</span>
                      <small>{{ option.hint }}</small>
                    </button>
                  </div>
                </div>
                <div class="export-filter-block">
                  <div class="export-filter-head">
                    <strong>卷型</strong>
                  </div>
                  <div class="export-choice-grid">
                    <button
                      v-for="option in exportPaperVariantOptions"
                      :key="option.value"
                      class="export-choice-option"
                      type="button"
                      :disabled="exportForm.recordType !== 'all' && exportForm.recordType !== 'paper'"
                      :class="{ active: exportForm.paperVariant === option.value }"
                      @click="chooseExportPaperVariant(option.value)"
                    >
                      <span>{{ option.label }}</span>
                      <small>{{ option.hint }}</small>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="export-option-section">
              <div class="export-option-title">
                <strong>工作表布局</strong>
                <span>按你习惯的方式显示单表或分科目</span>
              </div>
              <div class="export-segmented two">
                <button type="button" :class="{ active: exportForm.sheetMode === 'single' }" @click="exportForm.sheetMode = 'single'">
                  单表明细
                  <small>适合汇总查看</small>
                </button>
                <button type="button" :class="{ active: exportForm.sheetMode === 'subject' }" @click="exportForm.sheetMode = 'subject'">
                  按科目分表
                  <small>适合分类复盘</small>
                </button>
              </div>
            </div>

            <div class="export-option-section">
              <div class="export-option-title">
                <strong>导出字段</strong>
                <span>至少保留一项，可按需要精简</span>
              </div>
              <div class="export-field-actions">
                <button type="button" @click="resetExportColumns">恢复推荐</button>
                <button type="button" @click="selectAllExportColumns">全选字段</button>
              </div>
              <div class="export-field-groups">
                <div v-for="group in exportColumnGroups" :key="group.id" class="export-field-group">
                  <strong>{{ group.label }}</strong>
                  <div class="export-field-grid">
                    <button
                      v-for="column in group.columns"
                      :key="column.id"
                      class="export-field-option"
                      type="button"
                      :class="{ active: exportForm.columns.includes(column.id) }"
                      @click="toggleExportColumn(column.id)"
                    >
                      <span class="export-field-check">
                        <Check v-if="exportForm.columns.includes(column.id)" :size="13" />
                      </span>
                      {{ column.label }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="export-option-section export-preview-section">
              <div class="export-option-title">
                <strong>在线表格预览</strong>
                <span>字体已加粗，科目和分数会更清楚，最后一行是平均分</span>
              </div>
              <div class="export-preview-table-wrap">
                <table class="export-preview-table">
                  <thead>
                    <tr>
                      <th v-for="column in exportPreviewColumns" :key="column.id">{{ column.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in exportPreviewRows" :key="row.id">
                      <td
                        v-for="column in exportPreviewColumns"
                        :key="column.id"
                        :class="[
                          `preview-cell preview-cell-${column.id}`,
                          {
                            'subject-cell': column.id === 'subject',
                            'score-cell': column.id === 'scoreText',
                            'is-summary': row.isSummary
                          }
                        ]"
                      >
                        {{ row[column.id] ?? " " }}
                      </td>
                    </tr>
                    <tr v-if="exportPreviewAverageRow" class="summary-preview-row">
                      <td
                        v-for="column in exportPreviewColumns"
                        :key="column.id"
                        :class="[
                          `preview-cell preview-cell-${column.id}`,
                          {
                            'subject-cell': column.id === 'subject',
                            'score-cell': column.id === 'scoreText',
                            'is-summary': true
                          }
                        ]"
                      >
                        {{ exportPreviewAverageRow[column.id] ?? " " }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside class="export-dialog-side">
            <label class="export-input-label">
              文件名
              <input v-model.trim="exportForm.filename" placeholder="成绩导出" />
            </label>
            <div class="export-option-title">
              <strong>表格颜色</strong>
              <span>科目颜色会同步到科目列与得分率</span>
            </div>
            <div class="export-theme-list">
              <button
                v-for="theme in exportThemeOptions"
                :key="theme.id"
                class="export-theme-option"
                type="button"
                :class="{ active: exportForm.theme === theme.id }"
                @click="exportForm.theme = theme.id"
              >
                <span class="export-theme-preview" :style="{ '--theme-color': `#${theme.header}`, '--theme-accent': `#${theme.accent}` }"></span>
                <span>{{ theme.label }}</span>
                <Check v-if="exportForm.theme === theme.id" class="export-theme-selected" :size="15" />
              </button>
            </div>
            <label class="export-switch-row">
              <input v-model="exportForm.includeSummary" type="checkbox" />
              <span>
                <strong>包含导出概览</strong>
                <small>自动生成记录数量、累计分数和总体得分率</small>
              </span>
            </label>
            <div class="export-preview-card">
              <FileSpreadsheet :size="20" />
              <strong>{{ exportSourceRecords.length }} 条成绩</strong>
              <span>{{ exportSubjectLabel }} · {{ exportForm.columns.length }} 个字段</span>
              <span>{{ exportForm.sheetMode === "subject" ? `${exportSubjectCount} 个科目分表` : "1 个明细表" }}</span>
            </div>
          </aside>
        </div>

        <div class="export-dialog-footer">
          <button class="secondary-button" type="button" @click="closeExportDialog">关闭</button>
          <button class="primary-button" type="button" :disabled="!exportSourceRecords.length || !exportForm.columns.length" @click="exportExcel">
            <FileSpreadsheet :size="17" />
            完成
          </button>
        </div>
      </section>
    </div>

    <div v-if="isCompositeDialogOpen && selectedRecords.length" class="composite-dialog-backdrop" @mousedown.self="closeCompositeDialog">
      <section class="composite-dialog" role="dialog" aria-modal="true" aria-labelledby="composite-dialog-title">
        <div class="composite-dialog-head">
          <div>
            <p class="eyebrow">合成工具</p>
            <h2 id="composite-dialog-title">合成成绩</h2>
            <span class="section-meta">已选择 {{ selectedRecords.length }} 条分项记录</span>
          </div>
          <div class="composite-dialog-actions">
            <button class="secondary-button compact" type="button" @click="resetCompositeValues">
              <RefreshCw :size="15" />
              恢复原始值
            </button>
            <button class="secondary-button compact" type="button" @click="closeCompositeDialog">
              继续选择
            </button>
          </div>
        </div>

        <div v-if="selectedRecords.length < 2" class="inline-alert">再选择至少一条同科目记录后即可生成合成成绩。</div>
        <div v-else-if="selectedSubjectCount > 1" class="inline-alert danger">请选择同一科目的记录进行合成。</div>

        <div class="composite-total-bar">
          <article>
            <span>当前合计</span>
            <strong>{{ compositeSummary.score }} / {{ compositeSummary.fullScore }}</strong>
          </article>
          <article>
            <span>当前用时</span>
            <strong>{{ formatDuration(compositeSummary.durationMinutes) }}</strong>
          </article>
        </div>

        <form class="composite-dialog-body" @submit.prevent="createCompositeRecord">
          <div class="form-row two">
            <label>
              合成名称
              <input v-model.trim="compositeForm.paperName" :placeholder="defaultCompositeName" />
            </label>
            <label>
              日期
              <input v-model="compositeForm.date" type="date" required />
            </label>
          </div>

          <div class="composite-source-editor-list">
            <article v-for="{ record, draft } in selectedCompositeRows" :key="record.id" class="composite-source-editor">
              <div class="composite-source-title">
                <strong>{{ record.paperName }}</strong>
                <span>{{ store.subjectName(record.subjectId) }} · 原始 {{ record.score }}/{{ record.fullScore }} · {{ formatDuration(record.durationMinutes) }}</span>
              </div>
              <div class="composite-source-fields">
                <label>
                  计入得分
                  <input v-model="draft.score" type="number" min="0" step="0.5" />
                </label>
                <label>
                  计入满分
                  <input v-model="draft.fullScore" type="number" min="0" step="0.5" />
                </label>
                <label>
                  计入用时
                  <input v-model="draft.durationMinutes" type="number" min="0" step="1" />
                </label>
              </div>
              <button class="icon-button danger" type="button" title="移除此来源" @click="removeCompositeSource(record.id)">
                <X :size="15" />
              </button>
            </article>
          </div>

          <label>
            备注
            <textarea v-model.trim="compositeForm.note" rows="2"></textarea>
          </label>

          <div class="composite-dialog-footer">
            <button class="secondary-button" type="button" @click="clearSelection">取消合成</button>
            <button class="primary-button" type="submit" :disabled="!canCreateComposite || isCompositeSaving">
              <Plus :size="17" />
              {{ isCompositeSaving ? "合成中..." : "生成合成成绩" }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <section class="content-grid records-content-grid">
      <div v-if="!hasActiveFilters && !showForm" class="panel record-create-hint">
        <div class="section-head">
          <h2>快速录入</h2>
        </div>
        <button class="primary-button" type="button" @click="startCreate">
          <Plus :size="17" />
          新增成绩
        </button>
      </div>
      <div class="panel panel-wide" :class="{ 'full-span': hasActiveFilters || showForm }">
        <div class="section-head">
          <h2>成绩列表</h2>
          <div class="topbar-tools">
            <span v-if="selectedRecords.length" class="selection-count">已选择 {{ selectedRecords.length }} 条</span>
            <button class="secondary-button compact" type="button" @click="toggleRestorePanel">
              <Trash2 :size="15" />
              最近删除 {{ store.deletedRecords.length }}
            </button>
            <button class="secondary-button compact" type="button" :disabled="!selectableFilteredRecords.length" @click="selectAllFilteredRecords">
              {{ allFilteredRecordsSelected ? "取消全选" : "全选当前结果" }}
            </button>
          </div>
        </div>
        <div v-if="shouldShowRestorePanel" class="record-restore-panel">
          <div class="record-restore-head">
            <div>
              <strong>最近删除</strong>
              <span>24 小时内可以恢复，适合处理误删。</span>
            </div>
            <span>{{ store.deletedRecords.length }} 条</span>
          </div>
          <div v-if="store.deletedRecords.length" class="record-restore-list">
            <article v-for="entry in store.deletedRecords" :key="entry.id">
              <div>
                <strong>{{ recordTitle(entry.record) }}</strong>
                <span>{{ store.subjectName(entry.record.subjectId) }} · {{ entry.record.score }}/{{ entry.record.fullScore }} · 还剩约 {{ store.deletedRecordRemainingHours(entry) }} 小时</span>
              </div>
              <button class="secondary-button compact" type="button" @click="restoreDeletedRecord(entry)">恢复</button>
            </article>
          </div>
          <div v-else class="record-restore-empty">
            暂无可恢复成绩。删除成绩后，这里会保留 24 小时。
          </div>
        </div>
        <div class="health-check-panel">
          <div class="health-check-head">
            <div>
              <strong><ShieldCheck :size="16" />数据健康检查</strong>
              <span>{{ healthStatusText }} · 点击问题可自动选中相关成绩</span>
            </div>
            <div class="health-check-actions">
              <button v-if="ignoredHealthIssueCount" class="secondary-button compact" type="button" @click="isIgnoredHealthOpen = !isIgnoredHealthOpen">
                <EyeOff :size="15" />
                已忽略 {{ ignoredHealthIssueCount }}
              </button>
              <button v-if="healthIssueCount && isHealthPanelExpanded" class="secondary-button compact" type="button" @click="isHealthPanelExpanded = false">收起检查</button>
              <span :class="{ good: !healthIssueCount }">{{ healthIssueCount ? "需要整理" : "状态良好" }}</span>
            </div>
          </div>
          <div v-if="healthIssueCount && !isHealthPanelExpanded" class="health-check-compact">
            <span>待整理项已收起，不影响新增和编辑成绩。</span>
            <button class="secondary-button compact" type="button" @click="isHealthPanelExpanded = true">展开检查</button>
          </div>
          <div v-if="healthIssues.length && isHealthPanelExpanded" class="health-issue-grid">
            <article v-for="issue in healthIssues" :key="issue.id" class="health-issue-card" :class="`tone-${issue.tone}`">
              <div>
                <AlertTriangle v-if="issue.tone === 'red' || issue.tone === 'orange'" :size="16" />
                <CheckCircle2 v-else :size="16" />
                <strong>{{ issue.title }}</strong>
                <b>{{ issue.count }}</b>
              </div>
              <p>{{ issue.description }}</p>
              <div class="health-issue-actions">
                <button class="secondary-button compact" type="button" @click="selectHealthIssue(issue)">选中处理</button>
                <button class="secondary-button compact" type="button" @click="ignoreHealthIssue(issue)">
                  <EyeOff :size="14" />
                  忽略
                </button>
              </div>
            </article>
          </div>
          <div v-else-if="!healthIssues.length" class="health-check-empty">
            当前没有发现明显异常。保持这个状态，很漂亮。
          </div>
          <div v-if="isIgnoredHealthOpen" class="ignored-health-panel">
            <div class="ignored-health-head">
              <strong>已忽略项目</strong>
              <button class="secondary-button compact" type="button" @click="clearIgnoredHealthIssues">
                <RotateCcw :size="14" />
                恢复全部
              </button>
            </div>
            <div v-if="ignoredHealthIssues.length" class="ignored-health-list">
              <article v-for="issue in ignoredHealthIssues" :key="issue.id">
                <div>
                  <strong>{{ issue.title }}</strong>
                  <span>当前仍匹配 {{ issue.count }} 条，已隐藏。</span>
                </div>
                <button class="secondary-button compact" type="button" @click="restoreIgnoredHealthIssue(issue.id)">恢复显示</button>
              </article>
            </div>
            <div v-else class="health-check-empty">暂无仍然匹配的已忽略项目。</div>
          </div>
        </div>
        <div v-if="selectedRecords.length" class="batch-management-panel">
          <div class="batch-management-copy">
            <strong>批量管理</strong>
            <span>已选 {{ selectedRecords.length }} 条，可统一改科目或移入最近删除。</span>
          </div>
          <select v-model="batchSubjectId">
            <option value="">选择目标科目</option>
            <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
          </select>
          <button class="secondary-button compact" type="button" :disabled="isBatchWorking || !batchSubjectId" @click="batchMoveSelectedRecords">
            <MoveRight :size="15" />
            批量改科目
          </button>
          <button class="secondary-button compact danger-text" type="button" :disabled="isBatchWorking" @click="batchDeleteSelectedRecords">
            <Trash2 :size="15" />
            批量删除
          </button>
        </div>
        <div v-if="selectedRecords.length" class="composite-selection-bar">
          <div class="composite-selection-info">
            <strong>选择分析</strong>
            <span v-if="selectedSubjectCount === 1">{{ store.subjectName(selectedRecords[0].subjectId) }} · {{ selectedRecords.length }} 条记录 · 实时计算不保存</span>
            <span v-else class="danger-text">包含多个科目，请保留同一科目来计算均分</span>
          </div>
          <div class="selection-average-card" :class="{ muted: !selectedAverageStats.isReady }">
            <div class="selection-average-head">
              <span><Calculator :size="15" />实时均分</span>
              <small>{{ selectedAverageStats.subjectName }}</small>
            </div>
            <strong v-if="selectedAverageStats.isReady">
              {{ formatScoreValue(selectedAverageStats.avgScore) }} / {{ formatScoreValue(selectedAverageStats.avgFullScore) }}
            </strong>
            <strong v-else>--</strong>
            <div class="selection-average-meta">
              <span>{{ selectedAverageStats.isReady ? `${selectedAverageStats.avgRate}% 得分率` : "选择同一科目后显示" }}</span>
              <span>{{ selectedAverageStats.avgDuration ? `${formatDuration(selectedAverageStats.avgDuration)} 平均用时` : "暂无计时均值" }}</span>
            </div>
            <div class="records-progress"><i :style="{ width: `${selectedAverageStats.isReady ? selectedAverageStats.avgRate : 0}%` }"></i></div>
          </div>
          <div class="composite-selection-list">
            <button
              v-for="record in selectedRecords"
              :key="record.id"
              class="selected-record-chip"
              type="button"
              title="移除此条来源"
              @click="removeCompositeSource(record.id)"
            >
              <span>{{ recordTitle(record) }}</span>
              <small>{{ formatScoreValue(record.score) }}/{{ formatScoreValue(record.fullScore) }}</small>
              <X :size="14" />
            </button>
          </div>
          <div class="composite-selection-actions">
            <button class="secondary-button compact" type="button" @click="clearSelection">清空</button>
            <button class="primary-button compact" type="button" @click="openCompositeDialog">
              <Plus :size="15" />
              进入合成
            </button>
          </div>
        </div>
        <div class="table-wrap desktop-record-table">
          <table>
            <thead>
              <tr>
                <th class="select-column">选择</th>
                <th>记录</th>
                <th>科目</th>
                <th>类型</th>
                <th>得分</th>
                <th>用时</th>
                <th>日期</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in pagedRecords"
                :key="record.id"
                class="subject-record-row"
                :class="{ 'is-selected': isSelected(record.id) }"
                :style="subjectAccentStyle(record)"
              >
                <td class="select-column">
                  <input
                    type="checkbox"
                    :checked="isSelected(record.id)"
                    :disabled="record.recordType === 'composite'"
                    :title="record.recordType === 'composite' ? '合成成绩不能再次作为来源' : '选择为合成来源'"
                    @change="toggleSelect(record)"
                  />
                </td>
                <td>
                  <RouterLink :to="`/records/${record.id}`">{{ recordTitle(record) }}</RouterLink>
                  <span v-if="recordVariantLabel(record)" class="record-variant-pill">{{ recordVariantLabel(record) }}</span>
                </td>
                <td>
                  <span class="subject-chip">
                    <span class="subject-dot"></span>
                    {{ store.subjectName(record.subjectId) }}
                  </span>
                </td>
                <td>{{ recordTypeLabel(record) }}</td>
                <td>
                  <div class="score-cell subject-score-cell">
                    <strong>{{ record.score }} / {{ record.fullScore }}</strong>
                    <div class="progress micro"><i :style="scoreBarStyle(record)"></i></div>
                    <span>{{ scorePercent(record) }}%</span>
                  </div>
                </td>
                <td>{{ formatDuration(record.durationMinutes) }}</td>
                <td>{{ record.date }}</td>
                <td>{{ record.pendingSync ? "待同步" : "已同步" }}</td>
                <td class="table-actions">
                  <button class="icon-button" type="button" title="编辑成绩" aria-label="编辑成绩" :disabled="isRecordActionWorking(record, 'delete')" @click="startEdit(record)">
                    <Edit3 :size="15" />
                  </button>
                  <button class="icon-button" type="button" title="基于本成绩新增错题" aria-label="基于本成绩新增错题" :disabled="isRecordActionWorking(record, 'delete')" @click="createMistakeFromRecord(record)">
                    <BookOpenCheck :size="15" />
                  </button>
                  <button class="icon-button danger" type="button" title="删除成绩" aria-label="删除成绩" :disabled="isRecordActionWorking(record, 'delete')" @click="deleteRecord(record)">
                    <Trash2 :size="15" />
                  </button>
                </td>
              </tr>
              <tr v-if="!pagedRecords.length">
                <td colspan="9" class="empty-cell">没有找到匹配的成绩。</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mobile-record-list">
          <article
            v-for="record in pagedRecords"
            :key="record.id"
            class="record-card"
            :class="{ 'is-selected': isSelected(record.id) }"
            :style="subjectAccentStyle(record)"
          >
            <div class="record-card-top">
              <label class="record-card-check">
                <input
                  type="checkbox"
                  :checked="isSelected(record.id)"
                  :disabled="record.recordType === 'composite'"
                  :title="record.recordType === 'composite' ? '合成成绩不能再次作为来源' : '选择为合成来源'"
                  @change="toggleSelect(record)"
                />
              </label>
              <div class="record-card-main">
                <div class="record-card-title-row">
                  <RouterLink :to="`/records/${record.id}`">{{ recordTitle(record) }}</RouterLink>
                  <span class="record-type-pill">{{ recordTypeLabel(record) }}</span>
                  <span v-if="recordVariantLabel(record)" class="record-variant-pill">{{ recordVariantLabel(record) }}</span>
                </div>
                <div class="record-card-meta-line">
                  <span class="subject-chip compact">
                    <span class="subject-dot"></span>
                    {{ store.subjectName(record.subjectId) }}
                  </span>
                  <span>{{ record.date }}</span>
                  <span>{{ record.pendingSync ? "待同步" : "已同步" }}</span>
                </div>
              </div>
              <div class="record-card-score subject-score-badge">
                <strong>{{ record.score }} / {{ record.fullScore }}</strong>
                <span>{{ scorePercent(record) }}%</span>
              </div>
            </div>
            <div class="record-card-progress">
              <div class="progress micro"><i :style="scoreBarStyle(record)"></i></div>
              <span>{{ formatDuration(record.durationMinutes) }}</span>
            </div>
            <div class="record-card-actions">
              <button class="icon-button" type="button" title="编辑成绩" aria-label="编辑成绩" :disabled="isRecordActionWorking(record, 'delete')" @click="startEdit(record)">
                <Edit3 :size="15" />
              </button>
              <button class="icon-button" type="button" title="基于本成绩新增错题" aria-label="基于本成绩新增错题" :disabled="isRecordActionWorking(record, 'delete')" @click="createMistakeFromRecord(record)">
                <BookOpenCheck :size="15" />
              </button>
              <button class="icon-button danger" type="button" title="删除成绩" aria-label="删除成绩" :disabled="isRecordActionWorking(record, 'delete')" @click="deleteRecord(record)">
                <Trash2 :size="15" />
              </button>
            </div>
          </article>
          <div v-if="!pagedRecords.length" class="mobile-empty-state">没有找到匹配的成绩。</div>
        </div>
        <div class="pager">
          <button type="button" :disabled="page === 1" @click="page -= 1"><ChevronLeft :size="16" />上一页</button>
          <span>{{ page }} / {{ pageCount }}</span>
          <button type="button" :disabled="page === pageCount" @click="page += 1">下一页<ChevronRight :size="16" /></button>
        </div>
      </div>
    </section>
  </div>
</template>
