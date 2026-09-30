<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowUpRight,
  BookOpenCheck,
  ClipboardPlus,
  Database,
  FilePlus2,
  Flame,
  FolderCog,
  Gauge,
  History,
  Upload
} from "@lucide/vue";
import ContributionHeatmap from "../components/ContributionHeatmap.vue";
import MetricCard from "../components/MetricCard.vue";
import RecordForm from "../components/RecordForm.vue";
import ScoreCharts from "../components/ScoreCharts.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const selectedSubject = ref("");
const showRecordForm = ref(false);
const importFile = ref(null);

const latestRecords = computed(() =>
  [...store.records]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 6)
);

const scopedRecords = computed(() =>
  selectedSubject.value ? store.records.filter((record) => record.subjectId === selectedSubject.value) : store.records
);

const totalScore = computed(() =>
  scopedRecords.value.reduce((sum, record) => sum + Number(record.score || 0), 0)
);
const totalFullScore = computed(() =>
  scopedRecords.value.reduce((sum, record) => sum + Number(record.fullScore || 0), 0)
);
const averageRate = computed(() => (totalFullScore.value ? Math.round((totalScore.value / totalFullScore.value) * 100) : 0));
const latestRecord = computed(() => latestRecords.value[0] || null);
const weekCount = computed(() => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return store.records.filter((record) => new Date(record.date) >= start).length;
});
const activeDays = computed(() => {
  const days = new Set(store.records.map((record) => record.date).filter(Boolean));
  return days.size;
});

const subjectStats = computed(() =>
  store.visibleSubjects.map((subject) => {
    const records = store.records.filter((record) => record.subjectId === subject.id);
    const latest = [...records].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const score = records.reduce((sum, record) => sum + Number(record.score || 0), 0);
    const fullScore = records.reduce((sum, record) => sum + Number(record.fullScore || 0), 0);
    const rate = fullScore ? Math.round((score / fullScore) * 100) : 0;
    const mistakes = store.mistakes.filter((item) => item.subjectId === subject.id).length;
    return { ...subject, latest, rate, count: records.length, mistakes };
  })
);

const reminders = computed(() => [
  {
    tone: store.mistakes.length ? "warning" : "success",
    title: store.mistakes.length ? `${store.mistakes.length} 道错题待复盘` : "错题库保持清爽",
    detail: store.mistakes.length ? "优先处理最近新增的错题" : "可以继续记录新的薄弱点"
  },
  {
    tone: store.lastBackupAt ? "success" : "info",
    title: store.lastBackupAt ? "本地数据已有备份" : "建议创建第一份备份",
    detail: store.lastBackupAt ? `上次备份于 ${new Date(store.lastBackupAt).toLocaleDateString("zh-CN")}` : "JSON 文件可用于迁移和恢复"
  },
  {
    tone: latestRecord.value ? "info" : "neutral",
    title: latestRecord.value ? "继续保持练习节奏" : "先记录一场练习",
    detail: latestRecord.value ? `最近一次得分 ${latestRecord.value.score}/${latestRecord.value.fullScore}` : "从成绩或错题开始建立学习档案"
  }
]);

async function exportData() {
  const data = await store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `exam-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  store.markBackupExported();
}

function chooseImport() {
  importFile.value?.click();
}

async function onImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await store.importData(JSON.parse(await file.text()), true);
    store.notify("数据已合并导入", "success");
  } catch (error) {
    store.notify(error.message || "导入失败，请检查文件格式", "error", 6000);
  } finally {
    event.target.value = "";
  }
}

function recordTitle(record) {
  if (record.recordType !== "exercise") return record.paperName;
  return [record.exerciseBookName || record.paperName, record.exercisePage ? `P${record.exercisePage}` : "", record.exerciseQuestion ? `第 ${record.exerciseQuestion} 题` : ""]
    .filter(Boolean)
    .join(" · ");
}

function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "未记录";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} 小时${rest ? ` ${rest} 分钟` : ""}` : `${rest} 分钟`;
}
</script>

<template>
  <div class="page-stack dashboard-page">
    <section class="dashboard-welcome">
      <div>
        <p class="eyebrow">学习档案 · {{ new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }) }}</p>
        <h2>欢迎回来，继续推进今天的复盘。</h2>
        <p class="dashboard-welcome-copy">把成绩、错题和备份集中在一个轻量工作台里，先处理最重要的一件事。</p>
      </div>
      <div class="dashboard-welcome-actions">
        <button class="primary-button" type="button" @click="showRecordForm = !showRecordForm">
          <ClipboardPlus :size="17" />
          {{ showRecordForm ? "收起录入" : "记录成绩" }}
        </button>
        <RouterLink class="secondary-button" to="/mistakes">
          <BookOpenCheck :size="17" />
          添加错题
        </RouterLink>
      </div>
    </section>

    <section class="summary-grid dashboard-summary-grid">
      <MetricCard label="成绩记录" :value="store.records.length" :hint="`${weekCount} 条发生在最近 7 天`" tone="blue" />
      <MetricCard label="错题待复盘" :value="store.mistakes.length" hint="按科目进入连续复习" tone="orange" />
      <MetricCard label="累计活跃日" :value="activeDays" hint="有成绩或错题记录的日期" tone="green" />
      <MetricCard label="平均得分率" :value="`${averageRate}%`" :hint="selectedSubject ? store.subjectName(selectedSubject) : '全部科目'" tone="purple" />
    </section>

    <section v-if="showRecordForm" class="panel quick-record-panel">
      <div class="section-head">
        <div>
          <h2>快速记录成绩</h2>
          <span class="section-meta">保存后会立即更新趋势和科目掌握进度</span>
        </div>
        <button class="icon-button" type="button" aria-label="收起快速录入" title="收起快速录入" @click="showRecordForm = false">×</button>
      </div>
      <RecordForm @saved="showRecordForm = false" />
    </section>

    <section class="dashboard-grid dashboard-primary-grid">
      <div class="dashboard-main-column">
        <ContributionHeatmap :records="store.records" :mistakes="store.mistakes" />

        <section class="panel subject-progress-panel">
          <div class="section-head">
            <div>
              <h2>科目掌握进度</h2>
              <span class="section-meta">按成绩得分率与错题数量综合观察</span>
            </div>
            <select v-model="selectedSubject" class="compact-select" aria-label="选择科目">
              <option value="">全部科目</option>
              <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
            </select>
          </div>
          <div class="subject-progress-list">
            <article v-for="subject in subjectStats.filter((item) => !selectedSubject || item.id === selectedSubject)" :key="subject.id" class="subject-progress-row">
              <div class="subject-progress-title">
                <span class="subject-chip" :style="{ '--subject-color': subject.color }"><span class="subject-dot"></span>{{ subject.name }}</span>
                <strong>{{ subject.rate }}%</strong>
              </div>
              <div class="progress"><i :style="{ width: `${subject.rate}%`, background: subject.color }"></i></div>
              <div class="subject-progress-meta">
                <span>{{ subject.count }} 条成绩</span>
                <span>{{ subject.mistakes }} 道错题</span>
                <span>{{ subject.latest ? `最近 ${subject.latest.score}/${subject.latest.fullScore}` : "暂无成绩" }}</span>
              </div>
            </article>
            <div v-if="!subjectStats.length" class="empty-state compact-empty">还没有可展示的科目。</div>
          </div>
        </section>
      </div>

      <aside class="dashboard-side-column">
        <section class="panel focus-panel">
          <div class="section-head">
            <div>
              <h2>今日焦点</h2>
              <span class="section-meta">把下一步安排得清楚一点</span>
            </div>
            <Flame :size="18" class="section-icon orange" />
          </div>
          <div class="focus-score">
            <Gauge :size="22" />
            <strong>{{ latestRecord ? latestRecord.score : "--" }}</strong>
            <span>{{ latestRecord ? `最近一次 · ${store.subjectName(latestRecord.subjectId)}` : "还没有成绩记录" }}</span>
          </div>
          <div class="focus-links">
            <RouterLink to="/records"><History :size="16" />查看成绩历史<ArrowUpRight :size="15" /></RouterLink>
            <RouterLink to="/mistakes"><BookOpenCheck :size="16" />进入错题复习<ArrowUpRight :size="15" /></RouterLink>
          </div>
        </section>

        <section class="panel reminder-panel">
          <div class="section-head">
            <div>
              <h2>提醒</h2>
              <span class="section-meta">来自你的学习档案</span>
            </div>
          </div>
          <div class="reminder-list">
            <article v-for="item in reminders" :key="item.title" class="reminder-item" :class="`tone-${item.tone}`">
              <span class="reminder-dot"></span>
              <div><strong>{{ item.title }}</strong><span>{{ item.detail }}</span></div>
            </article>
          </div>
        </section>

        <section class="panel quick-links-panel">
          <div class="section-head">
            <h2>快捷入口</h2>
          </div>
          <div class="quick-links">
            <RouterLink to="/records"><FilePlus2 :size="17" />成绩记录</RouterLink>
            <RouterLink to="/mistakes"><BookOpenCheck :size="17" />错题库</RouterLink>
            <RouterLink to="/subjects"><FolderCog :size="17" />科目管理</RouterLink>
            <RouterLink to="/backup"><Database :size="17" />数据备份</RouterLink>
            <button type="button" @click="exportData"><Upload :size="17" />快速导出</button>
            <button type="button" @click="chooseImport"><Database :size="17" />合并导入</button>
          </div>
          <input ref="importFile" class="visually-hidden" type="file" accept=".json,application/json" @change="onImport" />
        </section>
      </aside>
    </section>

    <ScoreCharts :subject-id="selectedSubject" />

    <section class="panel recent-panel">
      <div class="section-head">
        <div>
          <h2>最近成绩</h2>
          <span class="section-meta">共 {{ store.records.length }} 条记录 · 点击进入详情</span>
        </div>
        <RouterLink class="text-link" to="/records">查看全部 <ArrowUpRight :size="15" /></RouterLink>
      </div>
      <div v-if="latestRecords.length" class="recent-record-list">
        <RouterLink v-for="record in latestRecords" :key="record.id" :to="`/records/${record.id}`" class="recent-record-row">
          <span class="recent-record-accent" :style="{ background: store.subjectColor(record.subjectId) }"></span>
          <div class="recent-record-main">
            <strong>{{ recordTitle(record) }}</strong>
            <span>{{ store.subjectName(record.subjectId) }} · {{ record.date }} · {{ formatDuration(record.durationMinutes) }}</span>
          </div>
          <div class="recent-record-score">
            <strong>{{ record.score }}/{{ record.fullScore }}</strong>
            <span>{{ record.fullScore ? Math.round((record.score / record.fullScore) * 100) : 0 }}%</span>
          </div>
          <ArrowUpRight :size="16" />
        </RouterLink>
      </div>
      <div v-else class="empty-state">还没有成绩记录，先从“记录成绩”开始。</div>
    </section>
  </div>
</template>
