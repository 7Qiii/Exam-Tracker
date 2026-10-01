<script setup>
/**
 * 分数图表：趋势折线 + 对比柱状。
 *
 * 相比旧版：
 * - 支持时间范围筛选（rangeDays，0 表示全部），趋势图不再一股脑画完所有记录。
 * - 颜色统一从设计 token 里读，不再散落硬编码色值。
 * - 没有数据时给空状态，而不是渲染一张空白坐标系。
 * - 两个面板各自独立初始化：某个面板没数据被 v-if 掉时，另一个照常渲染。
 * - 面板尺寸变化（侧栏在 rail / 抽屉之间切换）时用 ResizeObserver 重新适配。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChartLine } from "@lucide/vue";
import DsEmptyState from "./ds/DsEmptyState.vue";
import { useTrackerStore } from "../stores/tracker";

const props = defineProps({
  subjectId: { type: String, default: "" },
  paperVariant: { type: String, default: "all" },
  /** 只看最近 N 天；0 = 全部 */
  rangeDays: { type: Number, default: 90 }
});

const store = useTrackerStore();
const rootRef = ref(null);
const trendRef = ref(null);
const comparisonRef = ref(null);
const isChartReady = ref(false);

let echarts = null;
let trendChart = null;
let comparisonChart = null;
let observer = null;
let resizeObserver = null;
let themeObserver = null;
let systemThemeQuery = null;

function normalizePaperVariant(record) {
  const raw = String(record?.paperVariant || "").trim().toLowerCase();
  if (raw === "true" || raw === "mock") return raw;
  const name = String(record?.paperName || "").trim().toLowerCase();
  if (/mock|模拟|模考/.test(name)) return "mock";
  if (/真题|历年|历届/.test(name)) return "true";
  return "";
}

function rangeStart(days) {
  if (!days) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return start;
}

/** 当前筛选条件下的成绩，按日期升序 */
const scopedRecords = computed(() => {
  const start = rangeStart(props.rangeDays);
  let list = store.records;
  if (props.subjectId) list = list.filter((record) => record.subjectId === props.subjectId);
  if (props.subjectId === "math1" && props.paperVariant !== "all") {
    list = list.filter((record) => (record.recordType || "paper") === "paper" && normalizePaperVariant(record) === props.paperVariant);
  }
  if (start) {
    list = list.filter((record) => {
      const date = new Date(record.date);
      return !Number.isNaN(date.getTime()) && date >= start;
    });
  }
  return [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
});

const hasTrendData = computed(() => scopedRecords.value.length > 0);

/** 柱状图：选了科目就看该科目最近几次，没选就横向比各科最新一次 */
const comparison = computed(() => {
  if (props.subjectId) {
    const subject = store.visibleSubjects.find((item) => item.id === props.subjectId);
    return scopedRecords.value.slice(-6).map((record) => ({
      label: record.date.slice(5),
      title: record.paperName,
      detail: `${record.score}/${record.fullScore}`,
      value: Number(record.score) || 0,
      color: subject?.color || ""
    }));
  }

  return store.visibleSubjects
    .map((subject) => {
      const latest = [...store.records]
        .filter((record) => record.subjectId === subject.id)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      if (!latest) return null;
      return {
        label: subject.name,
        title: latest.paperName,
        detail: `${latest.score}/${latest.fullScore}`,
        value: Number(latest.score) || 0,
        color: subject.color || ""
      };
    })
    .filter(Boolean);
});

const hasComparisonData = computed(() => comparison.value.length > 0);

/** 从设计 token 取色，取不到就退回默认值 */
function token(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function colorWithAlpha(color, alpha) {
  const value = String(color).trim();
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const int = parseInt(hex[1], 16);
    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
  }
  return value;
}

function isDarkMode() {
  if (typeof window === "undefined") return false;
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function isCompact() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 720;
}

function getChartTheme() {
  const isDark = isDarkMode();
  return {
    axis: isDark ? "rgba(244, 247, 251, 0.36)" : token("--line-strong", "rgba(73, 88, 108, 0.35)"),
    grid: isDark ? "rgba(244, 247, 251, 0.09)" : token("--line", "rgba(73, 88, 108, 0.12)"),
    muted: token("--muted", isDark ? "#a7b0bd" : "#64748b"),
    text: token("--ink", isDark ? "#f4f7fb" : "#1f2329"),
    blue: token("--blue", "#2f6fed"),
    green: token("--green", "#16a34a"),
    surface: token("--surface", isDark ? "#182029" : "#ffffff"),
    area: colorWithAlpha(token("--blue", "#2f6fed"), isDark ? 0.18 : 0.1),
    tooltipBg: isDark ? "rgba(24, 31, 41, 0.96)" : "rgba(255, 255, 255, 0.98)"
  };
}

function axisLayout(theme) {
  const compact = isCompact();
  return {
    compact,
    grid: { left: compact ? 34 : 44, right: 16, top: 24, bottom: compact ? 48 : 38 },
    axisLine: { lineStyle: { color: theme.axis } },
    axisLabel: { color: theme.muted, rotate: compact ? 40 : 0, hideOverlap: true, fontSize: compact ? 10 : 11 }
  };
}

function drawTrend(theme) {
  if (!trendRef.value || !hasTrendData.value) return;
  trendChart ||= echarts.init(trendRef.value);
  const records = scopedRecords.value;
  const { compact, grid, axisLine, axisLabel } = axisLayout(theme);

  trendChart.setOption(
    {
      backgroundColor: "transparent",
      grid,
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.tooltipBg,
        borderColor: theme.grid,
        textStyle: { color: theme.text },
        extraCssText: "border-radius: 10px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);",
        formatter(params) {
          const record = records[params[0]?.dataIndex];
          if (!record) return "";
          const rate = record.fullScore ? Math.round((Number(record.score) / Number(record.fullScore)) * 100) : 0;
          return `${record.paperName}<br/>${store.subjectName(record.subjectId)} · ${record.date}<br/>得分 ${record.score}/${record.fullScore}（${rate}%）`;
        }
      },
      xAxis: { type: "category", data: records.map((item) => item.date), axisLine, axisTick: { show: false }, axisLabel },
      yAxis: {
        type: "value",
        axisLabel: { color: theme.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.grid } }
      },
      series: [
        {
          name: "得分",
          type: "line",
          smooth: true,
          symbolSize: compact ? 6 : 8,
          lineStyle: { width: 2.5, color: theme.blue },
          itemStyle: { color: theme.blue, borderColor: theme.surface, borderWidth: 2 },
          areaStyle: { color: theme.area },
          data: records.map((item) => Number(item.score) || 0)
        }
      ]
    },
    true
  );
}

function drawComparison(theme) {
  if (!comparisonRef.value || !hasComparisonData.value) return;
  comparisonChart ||= echarts.init(comparisonRef.value);
  const bars = comparison.value;
  const { grid, axisLine, axisLabel } = axisLayout(theme);

  comparisonChart.setOption(
    {
      backgroundColor: "transparent",
      grid,
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.tooltipBg,
        borderColor: theme.grid,
        textStyle: { color: theme.text },
        extraCssText: "border-radius: 10px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);",
        formatter(params) {
          const item = bars[params[0]?.dataIndex];
          if (!item) return "";
          return `${item.title}<br/>得分 ${item.detail}`;
        }
      },
      xAxis: { type: "category", data: bars.map((item) => item.label), axisLine, axisTick: { show: false }, axisLabel },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: theme.grid } },
        axisLabel: { color: theme.muted, fontSize: 11 }
      },
      series: [
        {
          name: "得分",
          type: "bar",
          barMaxWidth: 34,
          data: bars.map((item) => ({
            value: item.value,
            itemStyle: { color: item.color || theme.green, borderRadius: [6, 6, 0, 0] }
          }))
        }
      ]
    },
    true
  );
}

async function draw() {
  if (!trendRef.value && !comparisonRef.value) return;
  echarts ||= await import("echarts");
  const theme = getChartTheme();
  drawTrend(theme);
  drawComparison(theme);
  isChartReady.value = true;
}

/**
 * 容器在「没有数据」时是 v-if 掉的，所以不能只在 mounted 时初始化：
 * 数据从无到有时容器才刚被挂上，必须等 nextTick 之后 echarts 才量得到尺寸。
 */
async function activateCharts() {
  if (!hasTrendData.value && !hasComparisonData.value) return;
  await nextTick();
  await draw();
}

function resize() {
  trendChart?.resize();
  comparisonChart?.resize();
  // 窄屏/宽屏切换时坐标轴配置不同，需要整张重画
  draw();
}

function watchChartTheme() {
  if (typeof window === "undefined") return;
  themeObserver = new MutationObserver(() => draw());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
  systemThemeQuery?.addEventListener?.("change", draw);
}

onMounted(() => {
  if ("IntersectionObserver" in window && rootRef.value) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          observer = null;
          activateCharts();
        }
      },
      { rootMargin: "180px" }
    );
    observer.observe(rootRef.value);
  } else {
    activateCharts();
  }

  if ("ResizeObserver" in window && rootRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (isChartReady.value) resize();
    });
    resizeObserver.observe(rootRef.value);
  } else {
    window.addEventListener("resize", resize);
  }

  watchChartTheme();
});

/**
 * 容器被 v-if 掉之后，echarts 实例还指着已经脱离文档的元素。
 * 数据回来时拿到的是新元素，必须先把旧实例销毁，否则会画在空气里。
 */
function disposeOrphanCharts() {
  if (!hasTrendData.value && trendChart) {
    trendChart.dispose();
    trendChart = null;
  }
  if (!hasComparisonData.value && comparisonChart) {
    comparisonChart.dispose();
    comparisonChart = null;
  }
}

watch(
  () => [store.records.length, props.subjectId, props.paperVariant, props.rangeDays],
  async () => {
    disposeOrphanCharts();
    await nextTick();
    if (!hasTrendData.value && !hasComparisonData.value) return;
    await activateCharts();
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  observer?.disconnect();
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  systemThemeQuery?.removeEventListener?.("change", draw);
  trendChart?.dispose();
  comparisonChart?.dispose();
  trendChart = null;
  comparisonChart = null;
});
</script>

<template>
  <div ref="rootRef" class="chart-grid">
    <section class="ds-section">
      <div class="ds-section-head">
        <div>
          <h2>分数趋势</h2>
          <span class="ds-section-meta">
            {{ rangeDays ? `最近 ${rangeDays} 天` : "全部记录" }} · {{ scopedRecords.length }} 次成绩
          </span>
        </div>
      </div>
      <div v-if="hasTrendData" ref="trendRef" class="chart-box" />
      <DsEmptyState
        v-else
        :icon="ChartLine"
        title="这个范围内还没有成绩"
        description="换个时间范围，或者先记录一次练习。"
      />
    </section>

    <section class="ds-section">
      <div class="ds-section-head">
        <div>
          <h2>{{ subjectId ? "该科目最近成绩" : "各科最近成绩" }}</h2>
          <span class="ds-section-meta">{{ subjectId ? "最近 6 次" : "按最新一次得分对比" }}</span>
        </div>
      </div>
      <div v-if="hasComparisonData" ref="comparisonRef" class="chart-box" />
      <DsEmptyState
        v-else
        :icon="ChartLine"
        title="还没有可对比的成绩"
        description="至少记录一次成绩后，这里会显示各科对比。"
      />
    </section>
  </div>
</template>
