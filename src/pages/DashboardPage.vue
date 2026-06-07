<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Download, FilePlus2, Upload } from "@lucide/vue";
import MetricCard from "../components/MetricCard.vue";
import RecordForm from "../components/RecordForm.vue";
import ScoreCharts from "../components/ScoreCharts.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const selectedSubject = ref("");
const importFile = ref(null);

const weekCount = computed(() => {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return store.records.filter((record) => new Date(record.date) >= start).length;
});

const latestRecords = computed(() =>
  [...store.records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
);

const subjectStats = computed(() =>
  store.visibleSubjects.map((subject) => {
    const records = store.records.filter((record) => record.subjectId === subject.id);
    const latest = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
    return {
      ...subject,
      count: records.length,
      latest,
      progress: latest ? Math.min(100, Math.round((latest.score / latest.fullScore) * 100)) : 0
    };
  })
);

async function exportData() {
  const data = await store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `exam-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function chooseImport() {
  importFile.value?.click();
}

async function onImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const payload = JSON.parse(await file.text());
  await store.importData(payload, true);
  event.target.value = "";
}
</script>

<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">Workspace</p>
        <h2>把成绩、错题和图片复盘放在同一个工作台。</h2>
        <p>本地优先存储，支持后续不断补充知识点、解析复盘和图片资料。</p>
      </div>
      <div class="hero-actions">
        <RouterLink class="primary-button" to="/mistakes">
          <FilePlus2 :size="17" />
          记录错题
        </RouterLink>
        <button class="secondary-button" type="button" @click="exportData">
          <Download :size="17" />
          导出
        </button>
        <button class="secondary-button" type="button" @click="chooseImport">
          <Upload :size="17" />
          导入
        </button>
        <input ref="importFile" class="visually-hidden" type="file" accept=".json,application/json" @change="onImport" />
      </div>
    </section>

    <section class="summary-grid">
      <MetricCard label="成绩记录" :value="store.records.length" hint="套试卷 / 专项练习" tone="blue" />
      <MetricCard label="近 7 天练习" :value="weekCount" hint="保持节奏更重要" tone="green" />
      <MetricCard label="错题记录" :value="store.mistakes.length" hint="解析与图片复盘" tone="orange" />
      <MetricCard label="最近成绩" :value="latestRecords[0] ? `${latestRecords[0].score}/${latestRecords[0].fullScore}` : '--'" hint="最近一套卷" tone="purple" />
    </section>

    <section class="content-grid">
      <div class="panel">
        <div class="section-head">
          <h2>新增成绩</h2>
          <span class="section-meta">基础功能保留</span>
        </div>
        <RecordForm />
      </div>

      <div class="panel">
        <div class="section-head">
          <h2>科目状态</h2>
          <select v-model="selectedSubject">
            <option value="">全部科目</option>
            <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
          </select>
        </div>
        <div class="subject-list">
          <article v-for="subject in subjectStats" :key="subject.id" class="subject-card">
            <div>
              <strong>{{ subject.name }}</strong>
              <span>{{ subject.count }} 条记录</span>
            </div>
            <b>{{ subject.latest ? `${subject.latest.score} / ${subject.latest.fullScore}` : "--" }}</b>
            <div class="progress"><i :style="{ width: `${subject.progress}%`, background: subject.color }"></i></div>
          </article>
        </div>
      </div>
    </section>

    <ScoreCharts :subject-id="selectedSubject" />

    <section class="panel">
      <div class="section-head">
        <h2>最近成绩</h2>
        <RouterLink class="text-link" to="/records">查看全部</RouterLink>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>试卷</th>
              <th>科目</th>
              <th>得分</th>
              <th>日期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in latestRecords" :key="record.id">
              <td><RouterLink :to="`/records/${record.id}`">{{ record.paperName }}</RouterLink></td>
              <td>{{ store.subjectName(record.subjectId) }}</td>
              <td>{{ record.score }} / {{ record.fullScore }}</td>
              <td>{{ record.date }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
