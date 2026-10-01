<script setup>
/**
 * 首页 / 数据面板。
 *
 * 结构：欢迎区（含今日待办）→ 核心指标 → 快速录入 → 科目掌握度
 *      → 学习贡献 + 提醒/快捷入口 → 分数趋势 → 最近成绩
 *
 * 两条自我约束：
 * 1. 不编数据。所有数字都来自 store 里真实的成绩 / 错题 / 备份时间，
 *    推导不出来就不显示，不用假占位撑版面。
 * 2. 顶部筛选（科目 + 时间范围）作用于整页，下面的模块共享同一个口径。
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  ChartLine,
  ClipboardList,
  ClipboardPlus,
  Database,
  Flame,
  FolderCog,
  Layers,
  Target,
  Timer,
  Upload
} from "@lucide/vue";
import ContributionHeatmap from "../components/ContributionHeatmap.vue";
import RecordForm from "../components/RecordForm.vue";
import ScoreCharts from "../components/ScoreCharts.vue";
import DsEmptyState from "../components/ds/DsEmptyState.vue";
import DsRecordCard from "../components/ds/DsRecordCard.vue";
import DsSection from "../components/ds/DsSection.vue";
import DsStatCard from "../components/ds/DsStatCard.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();

const FILTER_KEY = "exam-tracker-dashboard-filter";
const rangeOptions = [
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
  { value: 180, label: "近半年" },
  { value: 0, label: "全部" }
];

function readFilter() {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTER_KEY) || "{}");
    return {
      subjectId: typeof raw.subjectId === "string" ? raw.subjectId : "",
      rangeDays: rangeOptions.some((item) => item.value === raw.rangeDays) ? raw.rangeDays : 90
    };
  } catch {
    return { subjectId: "", rangeDays: 90 };
  }
}

const initialFilter = readFilter();
const selectedSubject = ref(initialFilter.subjectId);
const rangeDays = ref(initialFilter.rangeDays);
const showRecordForm = ref(false);
const importFile = ref(null);

watch([selectedSubject, rangeDays], () => {
  localStorage.setItem(FILTER_KEY, JSON.stringify({ subjectId: selectedSubject.value, rangeDays: rangeDays.value }));
});

const hasFilter = computed(() => Boolean(selectedSubject.value) || rangeDays.value !== 90);

function clearFilter() {
  selectedSubject.value = "";
  rangeDays.value = 90;
}

/* ------------------------------------------------------------------ *
 * 时间口径
 * ------------------------------------------------------------------ */

/** 本地时区的 YYYY-MM-DD，避免 toISOString 把凌晨的记录算到前一天 */
function localDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

const todayKey = localDateKey(new Date());

function rangeStart(days) {
  if (!days) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return start;
}

function inRange(dateString) {
  const start = rangeStart(rangeDays.value);
  if (!start) return true;
  const value = new Date(dateString);
  return !Number.isNaN(value.getTime()) && value >= start;
}

/** 只看时间范围，不看科目 */
const rangedRecords = computed(() => store.records.filter((record) => inRange(record.date)));
const rangedMistakes = computed(() => store.mistakes.filter((mistake) => inRange(mistake.createdAt)));

/** 时间范围 + 科目 */
const scopedRecords = computed(() =>
  selectedSubject.value ? rangedRecords.value.filter((record) => record.subjectId === selectedSubject.value) : rangedRecords.value
);
const scopedMistakes = computed(() =>
  selectedSubject.value ? rangedMistakes.value.filter((mistake) => mistake.subjectId === selectedSubject.value) : rangedMistakes.value
);

/* ------------------------------------------------------------------ *
 * 核心指标
 * ------------------------------------------------------------------ */

const totalScore = computed(() => scopedRecords.value.reduce((sum, record) => sum + Number(record.score || 0), 0));
const totalFullScore = computed(() => scopedRecords.value.reduce((sum, record) => sum + Number(record.fullScore || 0), 0));
const averageRate = computed(() => (totalFullScore.value ? Math.round((totalScore.value / totalFullScore.value) * 100) : 0));

const weekCount = computed(() => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return scopedRecords.value.filter((record) => {
    const date = new Date(record.date);
    return !Number.isNaN(date.getTime()) && date >= start;
  }).length;
});

const activeDays = computed(() => new Set(scopedRecords.value.map((record) => record.date).filter(Boolean)).size);

const pendingMistakes = computed(() => scopedMistakes.value.filter((mistake) => (mistake.status || "待复盘") !== "已掌握"));

/** 连续学习天数：把成绩和错题都算作「学习过」 */
const studyDays = computed(() => {
  const days = new Set();
  store.records.forEach((record) => {
    const key = localDateKey(record.date);
    if (key) days.add(key);
  });
  store.mistakes.forEach((mistake) => {
    const key = localDateKey(mistake.createdAt);
    if (key) days.add(key);
  });
  return days;
});

const streak = computed(() => {
  let count = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // 今天还没开始不算断档
  if (!studyDays.value.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (studyDays.value.has(localDateKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
});

const metrics = computed(() => [
  {
    label: "成绩记录",
    icon: ClipboardList,
    value: scopedRecords.value.length,
    unit: "条",
    hint: weekCount.value ? `最近 7 天新增 ${weekCount.value} 条` : "最近 7 天还没有新增"
  },
  {
    label: "平均得分率",
    icon: Target,
    value: averageRate.value,
    unit: "%",
    hint: totalFullScore.value ? `累计 ${totalScore.value} / ${totalFullScore.value} 分` : "还没有可统计的分数"
  },
  {
    label: "错题待复盘",
    icon: BookOpenCheck,
    value: pendingMistakes.value.length,
    unit: "道",
    hint: pendingMistakes.value.length ? `错题共 ${scopedMistakes.value.length} 道` : "错题都复习完了"
  },
  {
    label: "连续学习",
    icon: Flame,
    value: streak.value,
    unit: "天",
    hint: activeDays.value ? `本范围内活跃 ${activeDays.value} 天` : "有记录的天数"
  }
]);

/* ------------------------------------------------------------------ *
 * 今日待办：全部由真实数据推导
 * ------------------------------------------------------------------ */

const todayRecords = computed(() => store.records.filter((record) => record.date === todayKey));
const todayMinutes = computed(() => todayRecords.value.reduce((sum, record) => sum + (Number(record.durationMinutes) || 0), 0));

/** 到复习时间、或者躺了 3 天以上的错题 */
const dueMistakes = computed(() => {
  const staleBefore = new Date();
  staleBefore.setDate(staleBefore.getDate() - 3);
  return store.mistakes.filter((mistake) => {
    if ((mistake.status || "待复盘") === "已掌握") return false;
    if (mistake.nextReviewAt && String(mistake.nextReviewAt).slice(0, 10) <= todayKey) return true;
    const updated = new Date(mistake.updatedAt || mistake.createdAt || 0);
    return !Number.isNaN(updated.getTime()) && updated < staleBefore;
  });
});

const backupAgeDays = computed(() => {
  if (!store.lastBackupAt) return null;
  const value = new Date(store.lastBackupAt);
  if (Number.isNaN(value.getTime())) return null;
  return Math.floor((Date.now() - value.getTime()) / 86400000);
});

const todayTasks = computed(() => {
  const tasks = [];

  // 注意区分「到期该复习」和「还没复盘」：前者是提醒，后者是进度，
  // 混在一起会出现「2 道待复盘」和「没有积压」同时出现的矛盾。
  const due = dueMistakes.value.length;
  const pending = pendingMistakes.value.length;
  if (due) {
    tasks.push({
      tone: "warning",
      title: `${due} 道错题到复习时间了`,
      detail: "按科目进连续复习，一题一题过",
      to: "/mistakes",
      action: "去复习"
    });
  } else if (pending) {
    tasks.push({
      tone: "info",
      title: `还有 ${pending} 道错题没复盘`,
      detail: "没有到期提醒，但早点过一遍更稳",
      to: "/mistakes",
      action: "去复习"
    });
  } else {
    tasks.push({
      tone: "success",
      title: "错题复习没有积压",
      detail: "错题库里的题都已经标记为已掌握",
      to: "/mistakes",
      action: "看错题库"
    });
  }

  if (todayRecords.value.length) {
    tasks.push({
      tone: "success",
      title: `今天已记录 ${todayRecords.value.length} 条成绩`,
      detail: todayMinutes.value ? `累计用时 ${formatDuration(todayMinutes.value)}` : "这次没有填用时",
      to: "/records",
      action: "查看记录"
    });
  } else {
    tasks.push({
      tone: "info",
      title: "今天还没有记录成绩",
      detail: "做完一套卷子顺手记一下，趋势图才不会断档",
      to: "/records",
      action: "去记录"
    });
  }

  if (backupAgeDays.value === null || backupAgeDays.value >= 14) {
    tasks.push({
      tone: "info",
      title: backupAgeDays.value === null ? "还没有备份过数据" : `已经 ${backupAgeDays.value} 天没有备份`,
      detail: "导出一份 JSON，换设备或清缓存都不怕",
      to: "/backup",
      action: "去备份"
    });
  }

  return tasks;
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return "还在熬夜？先把今天最要紧的一件事做掉。";
  if (hour < 12) return "早上好，今天从一套卷子开始。";
  if (hour < 18) return "下午好，接着把节奏稳住。";
  return "晚上好，花十分钟复盘一下今天。";
});

const welcomeHint = computed(() => {
  if (!store.records.length && !store.mistakes.length) return "还没有任何数据。先记一次成绩或一道错题，这里就会长出趋势和掌握度。";
  const pending = pendingMistakes.value.length;
  if (pending) return `当前有 ${pending} 道错题待复盘，处理完这一批，掌握度会明显好看。`;
  return "错题都清完了，可以多刷几套新卷子扩一下样本。";
});

/* ------------------------------------------------------------------ *
 * 科目掌握度
 * ------------------------------------------------------------------ */

// 错题状态沿用现有数据里的取值，不重新定义枚举
const MISTAKE_STATES = [
  { key: "已掌握", label: "已掌握", color: "var(--state-mastered)" },
  { key: "已整理", label: "已整理", color: "var(--state-organized)" },
  { key: "不熟", label: "不熟", color: "var(--state-fuzzy)" },
  { key: "不会", label: "不会", color: "var(--state-unknown)" },
  { key: "待复盘", label: "待复盘", color: "var(--state-todo)" }
];

function countStates(list) {
  const result = MISTAKE_STATES.map((state) => ({ ...state, count: 0 }));
  const index = new Map(result.map((state) => [state.key, state]));
  list.forEach((mistake) => {
    const key = mistake.status || "待复盘";
    (index.get(key) || index.get("待复盘")).count += 1;
  });
  return result;
}

const subjectStats = computed(() =>
  store.visibleSubjects
    .filter((subject) => !selectedSubject.value || subject.id === selectedSubject.value)
    .map((subject) => {
      const records = rangedRecords.value.filter((record) => record.subjectId === subject.id);
      const mistakes = rangedMistakes.value.filter((mistake) => mistake.subjectId === subject.id);
      const score = records.reduce((sum, record) => sum + Number(record.score || 0), 0);
      const fullScore = records.reduce((sum, record) => sum + Number(record.fullScore || 0), 0);
      const rate = fullScore ? Math.round((score / fullScore) * 100) : 0;
      const average = records.length ? Math.round((score / records.length) * 10) / 10 : 0;
      const latest = [...records].sort(
        (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))
      )[0];
      const states = countStates(mistakes);
      return {
        ...subject,
        recordCount: records.length,
        mistakeCount: mistakes.length,
        pending: mistakes.filter((mistake) => (mistake.status || "待复盘") !== "已掌握").length,
        rate,
        average,
        latest,
        states,
        total: mistakes.length
      };
    })
    .sort((a, b) => b.recordCount - a.recordCount)
);

const rangeLabel = computed(() => rangeOptions.find((item) => item.value === rangeDays.value)?.label || "全部");

/* ------------------------------------------------------------------ *
 * 提醒与最近记录
 * ------------------------------------------------------------------ */

const reminders = computed(() => {
  const list = [];

  if (store.syncError) {
    list.push({ tone: "danger", title: "同步失败", detail: store.syncError, to: "/login", action: "去处理" });
  } else if (!store.user) {
    list.push({ tone: "info", title: "当前是本地模式", detail: "登录后可以在多设备之间同步数据", to: "/login", action: "去登录" });
  } else {
    list.push({
      tone: "success",
      title: "已登录并开启同步",
      detail: store.lastSyncedAt ? `最后同步：${new Date(store.lastSyncedAt).toLocaleString("zh-CN")}` : "还没有完成首次同步",
      to: "/login",
      action: "同步设置"
    });
  }

  if (store.failedImages.length) {
    list.push({
      tone: "danger",
      title: `${store.failedImages.length} 张图片上传失败`,
      detail: "可以在备份页重新上传",
      to: "/backup",
      action: "去重试"
    });
  } else if (store.pendingImages.length) {
    list.push({
      tone: "warning",
      title: `${store.pendingImages.length} 张图片等待上传`,
      detail: "网络恢复后会自动继续",
      to: "/backup",
      action: "查看队列"
    });
  }

  if (!store.visibleSubjects.length) {
    list.push({ tone: "warning", title: "还没有配置科目", detail: "先建好科目，记录时才能归类", to: "/subjects", action: "去配置" });
  }

  return list;
});

const latestRecords = computed(() =>
  [...store.records]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 6)
);

/* ------------------------------------------------------------------ *
 * 展示辅助
 * ------------------------------------------------------------------ */

function formatDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "未记录用时";
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function recordTitle(record) {
  if (record.recordType !== "exercise") return record.paperName;
  return [
    record.exerciseBookName || record.paperName,
    record.exercisePage ? `P${record.exercisePage}` : "",
    record.exerciseQuestion ? `第 ${record.exerciseQuestion} 题` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

function recordMeta(record) {
  const parts = [store.subjectName(record.subjectId), record.date];
  if (record.durationMinutes) parts.push(formatDuration(record.durationMinutes));
  return parts;
}

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
</script>

<template>
  <div class="page-stack dashboard-page">
    <!-- 1. 欢迎区 + 今日待办 -->
    <section class="ds-welcome">
      <div>
        <p class="eyebrow">{{ new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }) }}</p>
        <h2>{{ greeting }}</h2>
        <p>{{ welcomeHint }}</p>
      </div>
      <div class="ds-welcome-actions">
        <button class="primary-button" type="button" @click="showRecordForm = !showRecordForm">
          <ClipboardPlus :size="17" />
          {{ showRecordForm ? "收起录入" : "记录成绩" }}
        </button>
        <RouterLink class="secondary-button" to="/mistakes">
          <BookOpenCheck :size="17" />
          复习错题
        </RouterLink>
      </div>
    </section>

    <section class="ds-task-list">
      <component
        :is="task.to ? RouterLink : 'div'"
        v-for="task in todayTasks"
        :key="task.title"
        :to="task.to || undefined"
        class="ds-task"
        :class="[`tone-${task.tone}`, { 'is-link': Boolean(task.to) }]"
      >
        <i aria-hidden="true"></i>
        <div>
          <strong>{{ task.title }}</strong>
          <span>{{ task.detail }}</span>
        </div>
        <span v-if="task.action" class="ds-task-action">{{ task.action }}</span>
      </component>
    </section>

    <!-- 2. 核心指标 + 筛选 -->
    <section class="dashboard-filter-row">
      <div class="dashboard-filter">
        <label class="ds-field">
          <span class="ds-field-label">科目</span>
          <select v-model="selectedSubject">
            <option value="">全部科目</option>
            <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
          </select>
        </label>
        <label class="ds-field">
          <span class="ds-field-label">时间范围</span>
          <select v-model.number="rangeDays">
            <option v-for="option in rangeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <button v-if="hasFilter" class="ghost-button" type="button" @click="clearFilter">重置</button>
      </div>
      <p class="dashboard-filter-note">
        以下数据范围：{{ selectedSubject ? store.subjectName(selectedSubject) : "全部科目" }} · {{ rangeLabel }}
      </p>
    </section>

    <section class="ds-stats">
      <DsStatCard
        v-for="item in metrics"
        :key="item.label"
        :label="item.label"
        :value="item.value"
        :unit="item.unit"
        :hint="item.hint"
        :icon="item.icon"
      />
    </section>

    <!-- 3. 快速录入 -->
    <DsSection
      v-if="showRecordForm"
      title="快速记录成绩"
      description="保存后会立即更新趋势图和科目掌握度"
      closable
      @close="showRecordForm = false"
    >
      <RecordForm @saved="showRecordForm = false" />
    </DsSection>

    <!-- 4. 科目掌握度 -->
    <DsSection title="科目掌握度" :description="`${rangeLabel} · 按记录条数排序`">
      <template #actions>
        <RouterLink class="text-link" to="/subjects">管理科目 <ArrowUpRight :size="15" /></RouterLink>
      </template>

      <div v-if="subjectStats.length" class="ds-subject-grid">
        <article
          v-for="subject in subjectStats"
          :key="subject.id"
          class="ds-subject-card"
          :style="{ '--subject-color': subject.color || 'var(--blue)' }"
        >
          <div class="ds-subject-head">
            <p class="ds-subject-name"><i aria-hidden="true"></i>{{ subject.name }}</p>
            <span class="ds-subject-count">{{ subject.recordCount }} 次练习</span>
          </div>

          <div class="ds-meter">
            <div class="ds-meter-head">
              <strong>{{ subject.rate }}%</strong>
              <span>平均得分率</span>
            </div>
            <div class="ds-meter-track">
              <i :style="{ width: `${subject.rate}%`, background: subject.color || 'var(--blue)' }"></i>
            </div>
          </div>

          <div class="ds-subject-metrics">
            <div class="ds-subject-metric">
              <span>平均分</span>
              <strong>{{ subject.recordCount ? subject.average : "--" }}</strong>
            </div>
            <div class="ds-subject-metric">
              <span>最近一次</span>
              <strong>{{ subject.latest ? `${subject.latest.score}/${subject.latest.fullScore}` : "--" }}</strong>
            </div>
            <div class="ds-subject-metric">
              <span>错题</span>
              <strong>{{ subject.mistakeCount }}</strong>
            </div>
            <div class="ds-subject-metric">
              <span>待复盘</span>
              <strong>{{ subject.pending }}</strong>
            </div>
          </div>

          <div v-if="subject.total" class="ds-state-bar">
            <i
              v-for="state in subject.states"
              :key="state.key"
              :style="{ width: `${(state.count / subject.total) * 100}%`, background: state.color }"
              :title="`${state.label} ${state.count}`"
            ></i>
          </div>
          <div v-if="subject.total" class="ds-state-legend">
            <span v-for="state in subject.states" :key="state.key">
              <em :style="{ background: state.color }"></em>{{ state.label }} <b>{{ state.count }}</b>
            </span>
          </div>
          <p v-else class="ds-muted">还没有这个科目的错题记录。</p>
        </article>
      </div>

      <DsEmptyState
        v-else
        :icon="Layers"
        title="还没有可统计的科目"
        description="先在科目管理里配置考试科目，或者调整上面的筛选条件。"
      >
        <template #action>
          <RouterLink class="secondary-button" to="/subjects">去配置科目</RouterLink>
        </template>
      </DsEmptyState>
    </DsSection>

    <!-- 5. 学习贡献 + 提醒 / 快捷入口 -->
    <section class="dashboard-grid dashboard-primary-grid">
      <div class="dashboard-main-column">
        <ContributionHeatmap :records="store.records" :mistakes="store.mistakes" :days="rangeDays || 365" />
      </div>

      <aside class="dashboard-side-column">
        <DsSection title="提醒" description="来自同步状态和本地数据">
          <div v-if="reminders.length" class="ds-task-list">
            <component
              :is="item.to ? RouterLink : 'div'"
              v-for="item in reminders"
              :key="item.title"
              :to="item.to || undefined"
              class="ds-task"
              :class="[`tone-${item.tone}`, { 'is-link': Boolean(item.to) }]"
            >
              <i aria-hidden="true"></i>
              <div>
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
              </div>
              <span v-if="item.action" class="ds-task-action">{{ item.action }}</span>
            </component>
          </div>
          <p v-else class="ds-muted">暂时没有需要处理的事项。</p>
        </DsSection>

        <DsSection title="快捷入口">
          <div class="ds-quick-grid">
            <RouterLink class="ds-quick-item" to="/records"><ClipboardList :size="17" />成绩记录</RouterLink>
            <RouterLink class="ds-quick-item" to="/mistakes"><BookOpenCheck :size="17" />错题库</RouterLink>
            <RouterLink class="ds-quick-item" to="/subjects"><FolderCog :size="17" />科目管理</RouterLink>
            <RouterLink class="ds-quick-item" to="/backup"><Database :size="17" />数据备份</RouterLink>
            <button class="ds-quick-item" type="button" @click="exportData"><Upload :size="17" />导出 JSON</button>
            <button class="ds-quick-item" type="button" @click="chooseImport"><Database :size="17" />合并导入</button>
          </div>
          <input ref="importFile" class="visually-hidden" type="file" accept=".json,application/json" @change="onImport" />
        </DsSection>
      </aside>
    </section>

    <!-- 6. 分数趋势 -->
    <ScoreCharts :subject-id="selectedSubject" :range-days="rangeDays" />

    <!-- 7. 最近成绩 -->
    <DsSection title="最近成绩" :description="`共 ${store.records.length} 条记录 · 点击进入详情`" flush>
      <template #actions>
        <RouterLink class="text-link" to="/records">查看全部 <ArrowUpRight :size="15" /></RouterLink>
      </template>

      <div v-if="latestRecords.length" class="ds-card-list">
        <DsRecordCard
          v-for="record in latestRecords"
          :key="record.id"
          :to="`/records/${record.id}`"
          :title="recordTitle(record)"
          :score="record.score"
          :full-score="record.fullScore"
          :meta="recordMeta(record)"
          :accent="store.subjectColor(record.subjectId)"
        />
      </div>

      <DsEmptyState
        v-else
        :icon="ChartLine"
        title="还没有成绩记录"
        description="记录第一场练习之后，趋势和掌握度都会出现在这里。"
      >
        <template #action>
          <button class="primary-button" type="button" @click="showRecordForm = true">
            <ClipboardPlus :size="16" />记录成绩
          </button>
        </template>
      </DsEmptyState>
    </DsSection>

    <p class="dashboard-footnote">
      <CalendarDays :size="14" />
      数据保存在本机浏览器；<RouterLink to="/backup">定期导出备份</RouterLink>可以避免清缓存后丢失。
      <template v-if="todayRecords.length">
        <Timer :size="14" />
        今天已学习 {{ formatDuration(todayMinutes) }}。
      </template>
    </p>
  </div>
</template>
