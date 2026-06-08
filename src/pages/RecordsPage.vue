<script setup>
import { computed, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { ChevronLeft, ChevronRight, Search, Trash2, X } from "@lucide/vue";
import RecordForm from "../components/RecordForm.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const page = ref(1);
const pageSize = 8;
const filters = reactive({ keyword: "", subjectId: "" });
const draftFilters = reactive({ keyword: "", subjectId: "" });

const filteredRecords = computed(() => {
  const keyword = normalizeSearch(filters.keyword);
  return [...store.records]
    .filter((record) => {
      const subject = store.subjectName(record.subjectId);
      const haystack = normalizeSearch([
        record.paperName,
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

watch(() => [filters.keyword, filters.subjectId], () => {
  page.value = 1;
});

function applyFilters() {
  filters.keyword = draftFilters.keyword;
  filters.subjectId = draftFilters.subjectId;
  page.value = 1;
}

function clearFilters() {
  draftFilters.keyword = "";
  draftFilters.subjectId = "";
  applyFilters();
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
</script>

<template>
  <div class="page-stack">
    <section class="panel">
      <div class="section-head">
        <h2>成绩筛选</h2>
        <span class="section-meta">{{ filteredRecords.length }} 条结果</span>
      </div>
      <form class="filter-bar with-actions" @submit.prevent="applyFilters">
        <input v-model="draftFilters.keyword" placeholder="搜索试卷、备注、科目" />
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

    <section class="content-grid">
      <div class="panel">
        <div class="section-head">
          <h2>新增成绩</h2>
        </div>
        <RecordForm />
      </div>
      <div class="panel panel-wide">
        <div class="section-head">
          <h2>成绩列表</h2>
          <span class="section-meta">分页展示</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>试卷</th>
                <th>科目</th>
                <th>得分</th>
                <th>用时</th>
                <th>日期</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in pagedRecords" :key="record.id">
                <td><RouterLink :to="`/records/${record.id}`">{{ record.paperName }}</RouterLink></td>
                <td>{{ store.subjectName(record.subjectId) }}</td>
                <td>{{ record.score }} / {{ record.fullScore }}</td>
                <td>{{ formatDuration(record.durationMinutes) }}</td>
                <td>{{ record.date }}</td>
                <td>
                  <button class="icon-button danger" type="button" @click="store.removeRecord(record.id)">
                    <Trash2 :size="15" />
                  </button>
                </td>
              </tr>
              <tr v-if="!pagedRecords.length">
                <td colspan="6" class="empty-cell">没有找到匹配的成绩。</td>
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
