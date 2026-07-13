<script setup>
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { BookOpenCheck, ChevronLeft, ChevronRight, Edit3, Plus, Search, Trash2, X } from "@lucide/vue";
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
const canCreateComposite = computed(() => selectedRecords.value.length >= 2 && selectedSubjectCount.value === 1);
const compositeSummary = computed(() => {
  const score = selectedRecords.value.reduce((sum, record) => sum + Number(record.score || 0), 0);
  const fullScore = selectedRecords.value.reduce((sum, record) => sum + Number(record.fullScore || 0), 0);
  const durations = selectedRecords.value.map((record) => normalizeDuration(record.durationMinutes));
  const durationMinutes = durations.every((value) => value !== "") ? durations.reduce((sum, value) => sum + Number(value), 0) : "";
  const latestDate = selectedRecords.value.map((record) => record.date).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10);
  return { score, fullScore, durationMinutes, latestDate };
});
const defaultCompositeName = computed(() => {
  const year = commonYearLabel(selectedRecords.value);
  return year ? `${year} 合成成绩` : "合成成绩";
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
  compositeForm.date = compositeSummary.value.latestDate;
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
  compositeForm.paperName = "";
  compositeForm.note = "";
  compositeForm.date = "";
}

async function createCompositeRecord() {
  if (!canCreateComposite.value) return;
  isCompositeSaving.value = true;
  try {
    await store.addCompositeRecord(selectedRecordIds.value, {
      paperName: compositeForm.paperName || defaultCompositeName.value,
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
</script>

<template>
  <div class="page-stack">
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

    <section v-if="selectedRecords.length" class="panel composite-builder">
      <div class="section-head">
        <div>
          <h2>合成成绩</h2>
          <span class="section-meta">已选择 {{ selectedRecords.length }} 条分项记录</span>
        </div>
        <button class="secondary-button compact" type="button" @click="clearSelection">
          <X :size="15" />
          清空选择
        </button>
      </div>
      <div v-if="selectedSubjectCount > 1" class="inline-alert danger">请选择同一科目的记录进行合成。</div>
      <div class="composite-summary">
        <article>
          <span>合计得分</span>
          <strong>{{ compositeSummary.score }} / {{ compositeSummary.fullScore }}</strong>
        </article>
        <article>
          <span>合计用时</span>
          <strong>{{ formatDuration(compositeSummary.durationMinutes) }}</strong>
        </article>
      </div>
      <form class="form-grid" @submit.prevent="createCompositeRecord">
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
        <label>
          备注
          <textarea v-model.trim="compositeForm.note" rows="2"></textarea>
        </label>
        <div class="composite-source-list">
          <span v-for="record in selectedRecords" :key="record.id">{{ record.paperName }} · {{ record.score }}/{{ record.fullScore }}</span>
        </div>
        <button class="primary-button" type="submit" :disabled="!canCreateComposite || isCompositeSaving">
          <Plus :size="17" />
          {{ isCompositeSaving ? "合成中..." : "生成合成成绩" }}
        </button>
      </form>
    </section>

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
          <span class="section-meta">分页展示</span>
        </div>
        <div class="table-wrap">
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
              <tr v-for="record in pagedRecords" :key="record.id">
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
                <td>{{ record.score }} / {{ record.fullScore }}</td>
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
        <div class="pager">
          <button type="button" :disabled="page === 1" @click="page -= 1"><ChevronLeft :size="16" />上一页</button>
          <span>{{ page }} / {{ pageCount }}</span>
          <button type="button" :disabled="page === pageCount" @click="page += 1">下一页<ChevronRight :size="16" /></button>
        </div>
      </div>
    </section>
  </div>
</template>
