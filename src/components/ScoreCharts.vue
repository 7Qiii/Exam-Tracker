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
  trendChart.setOption({
    grid: { left: 42, right: 18, top: 28, bottom: 42 },
    tooltip: {
      trigger: "axis",
      formatter(params) {
        const point = params[0];
        const record = records[point.dataIndex];
        if (!record) return "";
        return `${record.paperName}<br/>${store.subjectName(record.subjectId)} · ${record.date}<br/>得分 ${record.score}/${record.fullScore}`;
      }
    },
    xAxis: { type: "category", data: records.map((item) => item.date), axisLabel: { color: "#667085" } },
    yAxis: { type: "value", axisLabel: { color: "#667085" }, splitLine: { lineStyle: { color: "#edf1f7" } } },
    series: [
      {
        name: "得分",
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: "#177ddc" },
        itemStyle: { color: "#177ddc" },
        areaStyle: { color: "rgba(23, 125, 220, 0.08)" },
        data: records.map((item) => item.score)
      }
    ]
  });

  const latestBySubject = store.visibleSubjects
    .map((subject) => {
      const latest = [...records]
        .filter((record) => record.subjectId === subject.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
      return latest ? { subject, record: latest } : null;
    })
    .filter(Boolean);

  distributionChart.setOption({
    grid: { left: 42, right: 14, top: 24, bottom: 42 },
    tooltip: {
      trigger: "axis",
      formatter(params) {
        const point = params[0];
        const item = latestBySubject[point.dataIndex];
        if (!item) return "";
        return `${item.subject.name}<br/>${item.record.paperName}<br/>得分 ${item.record.score}/${item.record.fullScore}`;
      }
    },
    xAxis: { type: "category", data: latestBySubject.map((item) => item.subject.name), axisLabel: { color: "#667085" } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#edf1f7" } }, axisLabel: { color: "#667085" } },
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
  });
}

function resize() {
  trendChart?.resize();
  distributionChart?.resize();
}

function activateCharts() {
  if (isChartReady.value) return;
  draw();
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
  window.addEventListener("resize", resize);
});

watch(() => [store.records.length, props.subjectId], () => {
  if (isChartReady.value) draw();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  observer?.disconnect();
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
