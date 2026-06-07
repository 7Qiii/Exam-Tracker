<script setup>
import { computed, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { ChevronLeft, ChevronRight, Trash2 } from "@lucide/vue";
import RecordForm from "../components/RecordForm.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const page = ref(1);
const pageSize = 8;
const filters = reactive({ keyword: "", subjectId: "" });

const filteredRecords = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase();
  return [...store.records]
    .filter((record) => {
      const subject = store.subjectName(record.subjectId);
      return (
        (!keyword || `${record.paperName} ${record.note} ${subject}`.toLowerCase().includes(keyword)) &&
        (!filters.subjectId || record.subjectId === filters.subjectId)
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize)));
const pagedRecords = computed(() => filteredRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize));
</script>

<template>
  <div class="page-stack">
    <section class="panel">
      <div class="section-head">
        <h2>成绩筛选</h2>
        <span class="section-meta">{{ filteredRecords.length }} 条结果</span>
      </div>
      <div class="filter-bar">
        <input v-model="filters.keyword" placeholder="搜索试卷、备注、科目" @input="page = 1" />
        <select v-model="filters.subjectId" @change="page = 1">
          <option value="">全部科目</option>
          <option v-for="subject in store.subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
      </div>
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
                <th>日期</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in pagedRecords" :key="record.id">
                <td><RouterLink :to="`/records/${record.id}`">{{ record.paperName }}</RouterLink></td>
                <td>{{ store.subjectName(record.subjectId) }}</td>
                <td>{{ record.score }} / {{ record.fullScore }}</td>
                <td>{{ record.date }}</td>
                <td>
                  <button class="icon-button danger" type="button" @click="store.removeRecord(record.id)">
                    <Trash2 :size="15" />
                  </button>
                </td>
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
