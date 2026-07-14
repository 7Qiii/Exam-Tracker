<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTrackerStore } from "../stores/tracker";

const props = defineProps({
  subjectId: { type: String, default: "" }
});

const store = useTrackerStore();
const rootRef = ref(null);
const trendRef = ref(null);
const distributionRef = ref(null);
const isChartReady = ref(false);
let trendChart = null;
let distributionChart = null;
let echarts = null;
let observer = null;
let themeObserver = null;
let systemThemeQuery = null;

const scopedRecords = computed(() => {
  const list = props.subjectId ? store.records.filter((record) => record.subjectId === props.subjectId) : store.records;
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
});

async function draw() {
  if (!trendRef.value || !distributionRef.value) return;
  isChartReady.value = true;
  echarts ||= await import("echarts");
  trendChart ||= echarts.init(trendRef.value);
  distributionChart ||= echarts.init(distributionRef.value);

  const records = scopedRecords.value;
  const theme = getChartTheme();
  trendChart.setOption({
    backgroundColor: "transparent",
    grid: { left: 42, right: 18, top: 28, bottom: 42 },
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.text },
      extraCssText: "border-radius: 10px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);",
      formatter(params) {
        const point = params[0];
        const record = records[point.dataIndex];
        if (!record) return "";
        return `${record.paperName}<br/>${store.subjectName(record.subjectId)} · ${record.date}<br/>得分 ${record.score}/${record.fullScore}`;
      }
    },
    xAxis: {
      type: "category",
      data: records.map((item) => item.date),
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: theme.muted },
      splitLine: { lineStyle: { color: theme.grid } }
    },
    series: [
      {
        name: "得分",
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: theme.blue },
        itemStyle: { color: theme.blue, borderColor: theme.pointBorder, borderWidth: 2 },
        areaStyle: { color: theme.area },
        data: records.map((item) => item.score)
      }
    ]
  }, true);

  const latestBySubject = store.visibleSubjects
    .map((subject) => {
      const latest = [...records]
        .filter((record) => record.subjectId === subject.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
      return latest ? { subject, record: latest } : null;
    })
    .filter(Boolean);

  distributionChart.setOption({
    backgroundColor: "transparent",
    grid: { left: 42, right: 14, top: 24, bottom: 42 },
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.text },
      extraCssText: "border-radius: 10px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);",
      formatter(params) {
        const point = params[0];
        const item = latestBySubject[point.dataIndex];
        if (!item) return "";
        return `${item.subject.name}<br/>${item.record.paperName}<br/>得分 ${item.record.score}/${item.record.fullScore}`;
      }
    },
    xAxis: {
      type: "category",
      data: latestBySubject.map((item) => item.subject.name),
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted }
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: { color: theme.muted }
    },
    series: [
      {
        name: "得分",
        type: "bar",
        barWidth: 30,
        data: latestBySubject.map((item) => ({
          value: item.record.score,
          itemStyle: { color: item.subject.color || "#12b76a", borderRadius: [6, 6, 0, 0] }
        }))
      }
    ]
  }, true);
}

function getChartTheme() {
  const isDark = isDarkMode();
  return isDark
    ? {
        axis: "rgba(244, 247, 251, 0.36)",
        grid: "rgba(244, 247, 251, 0.09)",
        muted: "rgba(213, 221, 232, 0.76)",
        text: "#f4f7fb",
        blue: "#5aa7ff",
        area: "rgba(90, 167, 255, 0.16)",
        pointBorder: "#15202b",
        tooltipBg: "rgba(24, 31, 41, 0.94)",
        tooltipBorder: "rgba(255, 255, 255, 0.12)"
      }
    : {
        axis: "rgba(73, 88, 108, 0.35)",
        grid: "rgba(73, 88, 108, 0.12)",
        muted: "#64748b",
        text: "#1f2329",
        blue: "#007aff",
        area: "rgba(0, 122, 255, 0.1)",
        pointBorder: "#eef4fb",
        tooltipBg: "rgba(246, 249, 252, 0.96)",
        tooltipBorder: "rgba(73, 88, 108, 0.12)"
      };
}

function isDarkMode() {
  if (typeof window === "undefined") return false;
  const explicitTheme = document.documentElement.dataset.theme;
  if (explicitTheme === "dark") return true;
  if (explicitTheme === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resize() {
  trendChart?.resize();
  distributionChart?.resize();
}

function activateCharts() {
  if (isChartReady.value) return;
  draw();
}

function watchChartTheme() {
  if (typeof window === "undefined") return;
  themeObserver = new MutationObserver(() => {
    if (isChartReady.value) draw();
  });
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
  watchChartTheme();
  window.addEventListener("resize", resize);
});

watch(() => [store.records.length, props.subjectId], () => {
  if (isChartReady.value) draw();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  observer?.disconnect();
  themeObserver?.disconnect();
  systemThemeQuery?.removeEventListener?.("change", draw);
  trendChart?.dispose();
  distributionChart?.dispose();
});
</script>

<template>
  <div ref="rootRef" class="chart-grid">
    <section class="panel">
      <div class="section-head">
        <h2>历次考试趋势</h2>
        <span class="section-meta">悬停查看试卷与分数</span>
      </div>
      <div ref="trendRef" class="chart-box">
        <span v-if="!isChartReady" class="chart-loading">图表准备中</span>
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>各科最近成绩</h2>
        <span class="section-meta">按得分展示</span>
      </div>
      <div ref="distributionRef" class="chart-box">
        <span v-if="!isChartReady" class="chart-loading">图表准备中</span>
      </div>
    </section>
  </div>
</template>
