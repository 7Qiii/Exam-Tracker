<script setup>
/**
 * 首页 / 数据面板。
 *
 * 结构：欢迎区（问候语 + 记录成绩/复习错题）→ 顶部筛选 → 核心指标
 *      → 快速录入（点按钮才展开）→ 最近成绩 → 分数趋势
 *      → 提醒 + 快捷入口 → 学习贡献（默认收起）→ 脚注
 *
 * 两条自我约束：
 * 1. 不编数据。所有数字都来自 store 里真实的成绩 / 错题 / 备份时间，
 *    推导不出来就不显示，不用假占位撑版面。
 * 2. 顶部筛选（科目 + 时间范围）作用于整页，下面的模块共享同一个口径。
 *
 * 首页只承担两件事：看清最近成绩、拿到常用入口。其余内容能收就收、
 * 能挪就挪（科目掌握度在 /subjects，完整列表在 /records）。
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
  FileSpreadsheet,
  Flame,
  FolderCog,
  Target,
  Timer,
  Upload
} from "@lucide/vue";
import ContributionHeatmap from "../components/ContributionHeatmap.vue";
import RecordForm from "../components/RecordForm.vue";
import ScoreCharts from "../components/ScoreCharts.vue";
import { exportRecordsToExcel } from "../services/excelExport";
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
 * 今日数据：只用于底部脚注的「今天已学习」
 * ------------------------------------------------------------------ */

const todayRecords = computed(() => store.records.filter((record) => record.date === todayKey));
const todayMinutes = computed(() => todayRecords.value.reduce((sum, record) => sum + (Number(record.durationMinutes) || 0), 0));

const backupAgeDays = computed(() => {
  if (!store.lastBackupAt) return null;
  const value = new Date(store.lastBackupAt);
  if (Number.isNaN(value.getTime())) return null;
  return Math.floor((Date.now() - value.getTime()) / 86400000);
});

const todayLabel = computed(() =>
  new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })
);

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

const rangeLabel = computed(() => rangeOptions.find((item) => item.value === rangeDays.value)?.label || "全部");

/* ------------------------------------------------------------------ *
 * 学习贡献热力图：默认收起
 * 它屏高很大，又和「看成绩」这条主线关系较弱，所以做成可折叠，
 * 展开状态记在本地，用户打开过一次之后就保持打开。
 * ------------------------------------------------------------------ */

const HEATMAP_KEY = "exam-tracker-dashboard-heatmap-open";
const isHeatmapOpen = ref(localStorage.getItem(HEATMAP_KEY) === "1");

watch(isHeatmapOpen, (value) => {
  localStorage.setItem(HEATMAP_KEY, value ? "1" : "0");
});

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

  // 「该备份了」原本挂在首屏的今日待办里，待办区去掉后挪到这里，
  // 免得唯一的备份提醒被一起删掉——清缓存会丢全部本地数据。
  if (backupAgeDays.value === null || backupAgeDays.value >= 14) {
    list.push({
      tone: "info",
      title: backupAgeDays.value === null ? "还没有备份过数据" : `已经 ${backupAgeDays.value} 天没有备份`,
      detail: "导出一份 JSON，换设备或清缓存都不怕",
      to: "/backup",
      action: "去备份"
    });
  }

  return list;
});

// 成绩记录是主要用途，首页给足条数（8 条），不够再去列表页
const latestRecords = computed(() =>
  [...store.records]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 8)
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

/**
 * 导出成绩 Excel。
 * 和成绩页顶部的「导出 Excel」是同一套逻辑，只是这里不弹配置面板，
 * 直接用默认列 / 单表导出全部成绩——首页要的是「一步拿到」。
 * 需要挑字段、按卷子分列时，仍然去成绩页的导出面板。
 */
async function exportScoresExcel() {
  if (!store.records.length) {
    store.notify("暂无成绩可以导出。", "info");
    return;
  }
  try {
    await exportRecordsToExcel({
      records: store.records,
      subjects: store.subjects,
      filename: `成绩导出-${new Date().toISOString().slice(0, 10)}`
    });
    store.notify(`Excel 已导出，共 ${store.records.length} 条成绩。`, "success");
  } catch (error) {
    store.notify(error.message || "Excel 导出失败，请稍后重试。", "error", 6000);
  }
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
    <!-- 1. 欢迎区：只留问候语 + 两个动作。
         原来这里还挂着一份「今日待办」列表（错题到期 / 今天记了几条），
         但它和下面的核心指标、错题库入口说的是同一件事，属于重复播报，
         已经去掉；「该备份了」这条提醒挪到下面的「提醒」模块继续保留。 -->
    <section class="ds-welcome-block">
      <div class="ds-welcome">
        <div>
          <p class="eyebrow">{{ todayLabel }}</p>
          <h1>{{ greeting }}</h1>
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
      </div>
    </section>

    <!-- 2. 顶部筛选：以下所有模块共享同一个口径 -->
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

    <!-- 3. 快速录入：点「记录成绩」才展开 -->
    <DsSection
      v-if="showRecordForm"
      title="快速记录成绩"
      description="保存后会立即更新趋势与统计"
      closable
      @close="showRecordForm = false"
    >
      <RecordForm @saved="showRecordForm = false" />
    </DsSection>

    <!-- 4. 最近成绩：成绩记录是主线，放在趋势图前面 -->
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
        description="记录第一场练习之后，趋势和统计都会出现在这里。"
      >
        <template #action>
          <button class="primary-button" type="button" @click="showRecordForm = true">
            <ClipboardPlus :size="16" />记录成绩
          </button>
        </template>
      </DsEmptyState>
    </DsSection>

    <!-- 5. 分数趋势 -->
    <ScoreCharts :subject-id="selectedSubject" :range-days="rangeDays" />

    <!-- 6. 提醒 + 快捷入口 -->
    <section class="dashboard-secondary-grid">
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
          <button class="ds-quick-item" type="button" @click="exportScoresExcel">
            <FileSpreadsheet :size="17" />导出成绩 Excel
          </button>
          <RouterLink class="ds-quick-item" to="/records"><ClipboardList :size="17" />成绩记录</RouterLink>
          <RouterLink class="ds-quick-item" to="/mistakes"><BookOpenCheck :size="17" />错题库</RouterLink>
          <RouterLink class="ds-quick-item" to="/subjects"><FolderCog :size="17" />科目管理</RouterLink>
          <RouterLink class="ds-quick-item" to="/backup"><Database :size="17" />数据备份</RouterLink>
          <button class="ds-quick-item" type="button" @click="exportData"><Upload :size="17" />备份全部数据</button>
          <button class="ds-quick-item" type="button" @click="chooseImport"><Database :size="17" />恢复备份</button>
        </div>
        <!-- 隐藏的文件框只是「恢复备份」按钮的实现细节，真正的控件是那个按钮。
             从可访问性树里摘掉，免得读屏用户多停一个说不清用途的输入框。 -->
        <input ref="importFile" class="visually-hidden" type="file" accept=".json,application/json" aria-hidden="true" tabindex="-1" @change="onImport" />
      </DsSection>
    </section>

    <!-- 7. 学习贡献：默认收起。屏高很大，又和「看成绩」这条主线关系较弱，
         需要看节奏时点标题展开，展开状态记在本地。 -->
    <DsSection
      title="学习贡献"
      :description="isHeatmapOpen ? `最近 ${rangeDays || 365} 天 · 成绩与错题都计入` : '点标题展开，看最近的学习节奏'"
      collapsible
      :collapsed="!isHeatmapOpen"
      @update:collapsed="isHeatmapOpen = !$event"
    >
      <ContributionHeatmap :records="store.records" :mistakes="store.mistakes" :days="rangeDays || 365" />
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
