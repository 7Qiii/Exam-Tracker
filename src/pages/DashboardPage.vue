<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Calculator, Download, FilePlus2, Target, TrendingUp, Trophy, Upload } from "@lucide/vue";
import MetricCard from "../components/MetricCard.vue";
import RecordForm from "../components/RecordForm.vue";
import ScoreCharts from "../components/ScoreCharts.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const selectedSubject = ref("");
const selectedPaperVariant = ref("all");
const importFile = ref(null);

const paperVariantOptions = [
  { value: "all", label: "全部" },
  { value: "true", label: "真题" },
  { value: "mock", label: "模拟卷" }
];

const isMathSubjectSelected = computed(() => selectedSubject.value === "math1");
const chartPaperVariant = computed(() => (isMathSubjectSelected.value ? selectedPaperVariant.value : "all"));
const scopedRecords = computed(() => {
  const list = selectedSubject.value ? store.records.filter((record) => record.subjectId === selectedSubject.value) : store.records;
  return isMathSubjectSelected.value ? list.filter(matchesSelectedPaperVariant) : list;
});
const currentScopeName = computed(() => {
  if (!selectedSubject.value) return "全部科目";
  const subjectName = store.subjectName(selectedSubject.value);
  const suffix = isMathSubjectSelected.value ? paperVariantOptions.find((item) => item.value === selectedPaperVariant.value)?.label : "";
  return suffix && suffix !== "全部" ? `${subjectName} · ${suffix}` : subjectName;
});
const weekCount = computed(() => {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return scopedRecords.value.filter((record) => new Date(record.date) >= start).length;
});

const latestRecords = computed(() =>
  [...scopedRecords.value].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
);

const subjectStats = computed(() =>
  store.visibleSubjects.map((subject) => {
    const records = subject.id === selectedSubject.value ? scopedRecords.value : store.records.filter((record) => record.subjectId === subject.id);
    const latest = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
    return {
      ...subject,
      count: records.length,
      latest,
      progress: latest ? Math.min(100, Math.round((latest.score / latest.fullScore) * 100)) : 0
    };
  })
);
const displayedSubjectStats = computed(() => (selectedSubject.value ? subjectStats.value.filter((subject) => subject.id === selectedSubject.value) : subjectStats.value));
const defaultAverageSubjectId = computed(() => subjectStats.value.find((subject) => subject.count)?.id || store.visibleSubjects[0]?.id || "");
const averageSubjectId = computed(() => selectedSubject.value || defaultAverageSubjectId.value);
const averageSubject = computed(() => store.visibleSubjects.find((subject) => subject.id === averageSubjectId.value) || null);
const averageSubjectStats = computed(() => {
  const records = store.records
    .filter((record) => record.subjectId === averageSubjectId.value && record.recordType !== "composite")
    .filter((record) => (averageSubjectId.value === "math1" && selectedPaperVariant.value !== "all" ? matchesSelectedPaperVariant(record) : true));
  const scoredRecords = records.filter((record) => Number(record.fullScore) > 0);
  const totalScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.score), 0);
  const totalFullScore = scoredRecords.reduce((sum, record) => sum + normalizeScoreValue(record.fullScore), 0);
  const durations = records
    .map((record) => normalizeDuration(record.durationMinutes))
    .filter((value) => value !== "");
  const latest = [...records].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
  const best = scoredRecords.reduce((winner, record) => (!winner || normalizeScoreValue(record.score) / normalizeScoreValue(record.fullScore) > normalizeScoreValue(winner.score) / normalizeScoreValue(winner.fullScore) ? record : winner), null);
  const avgScore = scoredRecords.length ? totalScore / scoredRecords.length : 0;
  const avgFullScore = scoredRecords.length ? totalFullScore / scoredRecords.length : 0;
  const rate = totalFullScore ? Math.round((totalScore / totalFullScore) * 100) : 0;
  const avgDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + Number(value), 0) / durations.length) : "";
  return {
    records,
    count: records.length,
    scoredCount: scoredRecords.length,
    avgScore,
    avgFullScore,
    rate,
    avgDuration,
    latest,
    best,
    isReady: scoredRecords.length > 0
  };
});

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

function matchesSelectedPaperVariant(record) {
  if (selectedPaperVariant.value === "all") return true;
  return record.subjectId === "math1" && (record.recordType || "paper") === "paper" && normalizePaperVariant(record) === selectedPaperVariant.value;
}

function normalizePaperVariant(record) {
  const raw = String(record?.paperVariant || "").trim().toLowerCase();
  if (raw === "true" || raw === "mock") return raw;
  const name = String(record?.paperName || "").trim().toLowerCase();
  if (/mock|模拟|模考/.test(name)) return "mock";
  if (/真题|历年|历届/.test(name)) return "true";
  return "";
}

function recordVariantLabel(record) {
  if (record.subjectId !== "math1" || (record.recordType || "paper") !== "paper") return "";
  const value = normalizePaperVariant(record);
  if (value === "true") return "真题";
  if (value === "mock") return "模拟卷";
  return "未分类";
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

function recordTitle(record) {
  if (record.recordType !== "exercise") return record.paperName;
  return [record.exerciseBookName || record.paperName, record.exercisePage ? `P${record.exercisePage}` : "", record.exerciseQuestion ? `第 ${record.exerciseQuestion} 题` : ""]
    .filter(Boolean)
    .join(" · ");
}
</script>

<template>
  <div class="page-stack">
    <section class="hero-panel dashboard-hero">
      <div>
        <p class="eyebrow">今日</p>
        <h2>今天继续推进</h2>
        <p>集中处理成绩、错题和备份，页面更轻，重点更清楚。</p>
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
      <MetricCard label="近 7 天练习" :value="weekCount" :hint="`${currentScopeName} · 保持节奏`" tone="green" />
      <MetricCard label="错题记录" :value="store.mistakes.length" hint="解析与图片复盘" tone="orange" />
      <MetricCard label="最近成绩" :value="latestRecords[0] ? `${latestRecords[0].score}/${latestRecords[0].fullScore}` : '--'" :hint="`${currentScopeName} · 最近一套`" tone="purple" />
    </section>

    <section class="average-dashboard-panel">
      <div class="average-dashboard-main">
        <div class="average-dashboard-head">
          <span><Calculator :size="16" />科目均分</span>
          <select v-model="selectedSubject">
            <option value="">全部科目 · 自动均分科目</option>
            <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
          </select>
        </div>
        <div v-if="averageSubjectId === 'math1'" class="paper-kind-tabs">
          <button
            v-for="option in paperVariantOptions"
            :key="option.value"
            type="button"
            :class="{ active: selectedPaperVariant === option.value }"
            @click="selectedPaperVariant = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <div class="average-score-display">
          <small>{{ averageSubject?.name || "暂无科目" }}{{ averageSubjectId === 'math1' && selectedPaperVariant !== 'all' ? ` · ${paperVariantOptions.find((item) => item.value === selectedPaperVariant)?.label}` : "" }}</small>
          <strong v-if="averageSubjectStats.isReady">
            {{ formatScoreValue(averageSubjectStats.avgScore) }} / {{ formatScoreValue(averageSubjectStats.avgFullScore) }}
          </strong>
          <strong v-else>--</strong>
          <p>{{ averageSubjectStats.isReady ? `${averageSubjectStats.count} 条记录参与统计，合成成绩已排除` : "选择一个已有成绩的科目后显示平均分。" }}</p>
        </div>
        <div class="average-ring-row">
          <div class="average-ring" :style="{ '--rate': `${averageSubjectStats.rate}%`, '--color': averageSubject?.color || '#007aff' }">
            <span>{{ averageSubjectStats.rate }}%</span>
          </div>
          <div>
            <b>平均得分率</b>
            <span>{{ averageSubjectStats.avgDuration ? `${formatDuration(averageSubjectStats.avgDuration)} 平均用时` : "暂无计时均值" }}</span>
          </div>
        </div>
      </div>
      <div class="average-dashboard-metrics">
        <article>
          <Target :size="16" />
          <span>统计样本</span>
          <strong>{{ averageSubjectStats.count }}</strong>
        </article>
        <article>
          <Trophy :size="16" />
          <span>最高表现</span>
          <strong>{{ averageSubjectStats.best ? `${averageSubjectStats.best.score}/${averageSubjectStats.best.fullScore}` : "--" }}</strong>
        </article>
        <article>
          <TrendingUp :size="16" />
          <span>最近一次</span>
          <strong>{{ averageSubjectStats.latest ? `${averageSubjectStats.latest.score}/${averageSubjectStats.latest.fullScore}` : "--" }}</strong>
        </article>
        <article>
          <Calculator :size="16" />
          <span>有效分数</span>
          <strong>{{ averageSubjectStats.scoredCount }}</strong>
        </article>
      </div>
    </section>

    <section class="content-grid">
      <div class="panel">
        <div class="section-head">
          <h2>新增成绩</h2>
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
          <article v-for="subject in displayedSubjectStats" :key="subject.id" class="subject-card">
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

    <ScoreCharts :subject-id="selectedSubject" :paper-variant="chartPaperVariant" />

    <section class="panel">
      <div class="section-head">
        <h2>最近成绩</h2>
        <RouterLink class="text-link" to="/records">查看全部</RouterLink>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>记录</th>
              <th>科目</th>
              <th>得分</th>
              <th>用时</th>
              <th>日期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in latestRecords" :key="record.id">
              <td>
                <RouterLink :to="`/records/${record.id}`">{{ recordTitle(record) }}</RouterLink>
                <span v-if="recordVariantLabel(record)" class="paper-variant-pill">{{ recordVariantLabel(record) }}</span>
              </td>
              <td>{{ store.subjectName(record.subjectId) }}</td>
              <td>{{ record.score }} / {{ record.fullScore }}</td>
              <td>{{ formatDuration(record.durationMinutes) }}</td>
              <td>{{ record.date }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
