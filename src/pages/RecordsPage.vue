<script setup>
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { BarChart3, BookOpenCheck, ChevronLeft, ChevronRight, Clock3, Edit3, Plus, RefreshCw, Search, Target, TrendingUp, Trash2, X } from "@lucide/vue";
import RecordForm from "../components/RecordForm.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const router = useRouter();
const page = ref(1);
const pageSize = 8;
const filters = reactive({ keyword: "", subjectId: "" });
const draftFilters = reactive({ keyword: "", subjectId: "" });
const showForm = ref(false);
const editingRecordId = ref("");
const selectedRecordIds = ref([]);
const compositeForm = reactive({ paperName: "", date: "", note: "" });
const compositeRows = reactive({});
const isCompositeDialogOpen = ref(false);
const isCompositeSaving = ref(false);

const filteredRecords = computed(() => {
  const keyword = normalizeSearch(filters.keyword);
  return [...store.records]
    .filter((record) => {
      const subject = store.subjectName(record.subjectId);
      const haystack = normalizeSearch([
        record.paperName,
        recordTypeLabel(record),
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
        (!filters.subjectId || record.subjectId === filters.subjectId)
      );
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize)));
const pagedRecords = computed(() => filteredRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const editingRecord = computed(() => store.records.find((record) => record.id === editingRecordId.value) || null);
const hasActiveFilters = computed(() => Boolean(filters.keyword || filters.subjectId));
const selectedRecords = computed(() =>
  selectedRecordIds.value
    .map((id) => store.records.find((record) => record.id === id))
    .filter((record) => record && record.recordType !== "composite")
);
const selectedSubjectCount = computed(() => new Set(selectedRecords.value.map((record) => record.subjectId)).size);
const canCreateComposite = computed(() => selectedRecords.value.length >= 2 && selectedSubjectCount.value === 1 && compositeSummary.value.fullScore > 0);
const selectedCompositeRows = computed(() => selectedRecords.value.map((record) => ({ record, draft: compositeRows[record.id] })).filter((item) => item.draft));
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

watch(() => [filters.keyword, filters.subjectId], () => {
  page.value = 1;
});

watch(selectedRecordIds, () => {
  const validIds = selectedRecordIds.value.filter((id) => store.records.some((record) => record.id === id && record.recordType !== "composite"));
  if (validIds.length !== selectedRecordIds.value.length || validIds.some((id, index) => id !== selectedRecordIds.value[index])) {
    selectedRecordIds.value = validIds;
    return;
  }
  syncCompositeRows();
  syncCompositeDefaults();
  if (!selectedRecords.value.length) isCompositeDialogOpen.value = false;
});

function applyFilters() {
  filters.keyword = draftFilters.keyword;
  filters.subjectId = draftFilters.subjectId;
  page.value = 1;
  showForm.value = false;
  editingRecordId.value = "";
}

function clearFilters() {
  draftFilters.keyword = "";
  draftFilters.subjectId = "";
  applyFilters();
}

function startCreate() {
  editingRecordId.value = "";
  showForm.value = true;
}

function startEdit(record) {
  editingRecordId.value = record.id;
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editingRecordId.value = "";
}

function onFormSaved() {
  closeForm();
}

function createMistakeFromRecord(record) {
  router.push({ path: "/mistakes", query: { recordId: record.id } });
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
      note: compositeForm.note
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

function scorePercent(record) {
  const fullScore = normalizeScoreValue(record.fullScore);
  if (!fullScore) return 0;
  const rate = Math.round((normalizeScoreValue(record.score) / fullScore) * 100);
  return Math.max(0, Math.min(100, rate));
}

function scoreBarStyle(record) {
  const percent = scorePercent(record);
  const color = percent >= 90 ? "linear-gradient(90deg, #12b76a 0%, #22c55e 100%)" : percent >= 60 ? "linear-gradient(90deg, #177ddc 0%, #38bdf8 100%)" : "linear-gradient(90deg, #f79009 0%, #f97316 100%)";
  return { width: `${percent}%`, background: color };
}
</script>

<template>
  <div class="page-stack">
    <section class="panel records-hero">
      <div class="records-hero-grid">
        <div class="records-hero-copy">
          <p class="eyebrow">Study workspace</p>
          <h2>成绩工作台</h2>
          <p class="records-hero-desc">把记录、计时、合成和同步放在同一处，页面保持克制，但信息层次更清楚。</p>
          <div class="records-hero-tags">
            <span>{{ hasActiveFilters ? "当前视图已筛选" : "当前视图为全量" }}</span>
            <span>{{ selectedRecords.length ? `已选 ${selectedRecords.length} 条` : "尚未选择合成来源" }}</span>
            <span>{{ topSubject.name }} · {{ topSubject.count }} 条</span>
          </div>
          <div class="records-hero-actions">
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
              <span>合成状态</span>
            </div>
            <strong>{{ selectedRecords.length }}</strong>
            <small>{{ selectionProgress }}% 进入合成准备</small>
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
        <button class="primary-button" type="submit">
          <Search :size="16" />
          搜索
        </button>
        <button class="secondary-button" type="button" @click="clearFilters">
          <X :size="16" />
          清空
        </button>
      </form>
    </section>

    <section v-if="showForm" class="panel">
      <div class="section-head">
        <h2>{{ editingRecord ? "编辑成绩" : "新增成绩" }}</h2>
        <button class="secondary-button compact" type="button" @click="closeForm">
          <X :size="15" />
          关闭
        </button>
      </div>
      <RecordForm :record="editingRecord" @saved="onFormSaved" />
    </section>

    <div v-if="isCompositeDialogOpen && selectedRecords.length" class="composite-dialog-backdrop" @mousedown.self="closeCompositeDialog">
      <section class="composite-dialog" role="dialog" aria-modal="true" aria-labelledby="composite-dialog-title">
        <div class="composite-dialog-head">
          <div>
            <p class="eyebrow">Composite Builder</p>
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
          <span class="section-meta">独立模块</span>
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
            <span class="section-meta">分页展示</span>
            <span v-if="selectedRecords.length" class="selection-count">已选择 {{ selectedRecords.length }} 条</span>
          </div>
        </div>
        <div v-if="selectedRecords.length" class="composite-selection-bar">
          <div class="composite-selection-info">
            <strong>合成来源</strong>
            <span v-if="selectedSubjectCount === 1">{{ store.subjectName(selectedRecords[0].subjectId) }} · {{ selectedRecords.length }} 条记录</span>
            <span v-else class="danger-text">包含多个科目，请保留同一科目的记录</span>
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
              <tr v-for="record in pagedRecords" :key="record.id" :class="{ 'is-selected': isSelected(record.id) }">
                <td class="select-column">
                  <input
                    type="checkbox"
                    :checked="isSelected(record.id)"
                    :disabled="record.recordType === 'composite'"
                    :title="record.recordType === 'composite' ? '合成成绩不能再次作为来源' : '选择为合成来源'"
                    @change="toggleSelect(record)"
                  />
                </td>
                <td><RouterLink :to="`/records/${record.id}`">{{ recordTitle(record) }}</RouterLink></td>
                <td>{{ store.subjectName(record.subjectId) }}</td>
                <td>{{ recordTypeLabel(record) }}</td>
                <td>
                  <div class="score-cell">
                    <strong>{{ record.score }} / {{ record.fullScore }}</strong>
                    <div class="progress micro"><i :style="scoreBarStyle(record)"></i></div>
                    <span>{{ scorePercent(record) }}%</span>
                  </div>
                </td>
                <td>{{ formatDuration(record.durationMinutes) }}</td>
                <td>{{ record.date }}</td>
                <td>{{ record.pendingSync ? "待同步" : "已同步" }}</td>
                <td class="table-actions">
                  <button class="icon-button" type="button" title="编辑成绩" @click="startEdit(record)">
                    <Edit3 :size="15" />
                  </button>
                  <button class="icon-button" type="button" title="基于本成绩新增错题" @click="createMistakeFromRecord(record)">
                    <BookOpenCheck :size="15" />
                  </button>
                  <button class="icon-button danger" type="button" title="删除成绩" @click="store.removeRecord(record.id)">
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
                </div>
                <div class="record-card-meta-line">
                  <span>{{ store.subjectName(record.subjectId) }}</span>
                  <span>{{ record.date }}</span>
                  <span>{{ record.pendingSync ? "待同步" : "已同步" }}</span>
                </div>
              </div>
              <div class="record-card-score">
                <strong>{{ record.score }} / {{ record.fullScore }}</strong>
                <span>{{ scorePercent(record) }}%</span>
              </div>
            </div>
            <div class="record-card-progress">
              <div class="progress micro"><i :style="scoreBarStyle(record)"></i></div>
              <span>{{ formatDuration(record.durationMinutes) }}</span>
            </div>
            <div class="record-card-actions">
              <button class="icon-button" type="button" title="编辑成绩" @click="startEdit(record)">
                <Edit3 :size="15" />
              </button>
              <button class="icon-button" type="button" title="基于本成绩新增错题" @click="createMistakeFromRecord(record)">
                <BookOpenCheck :size="15" />
              </button>
              <button class="icon-button danger" type="button" title="删除成绩" @click="store.removeRecord(record.id)">
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
