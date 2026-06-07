<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as echarts from "echarts";
import { useTrackerStore } from "../stores/tracker";

const props = defineProps({
  subjectId: { type: String, default: "" }
});

const store = useTrackerStore();
const trendRef = ref(null);
const distributionRef = ref(null);
let trendChart = null;
let distributionChart = null;

const scopedRecords = computed(() => {
  const list = props.subjectId ? store.records.filter((record) => record.subjectId === props.subjectId) : store.records;
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
});

function draw() {
  if (!trendRef.value || !distributionRef.value) return;
  trendChart ||= echarts.init(trendRef.value);
  distributionChart ||= echarts.init(distributionRef.value);

  const records = scopedRecords.value;
  trendChart.setOption({
    grid: { left: 42, right: 18, top: 28, bottom: 42 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: records.map((item) => item.date), axisLabel: { color: "#667085" } },
    yAxis: { type: "value", axisLabel: { color: "#667085" }, splitLine: { lineStyle: { color: "#edf1f7" } } },
    series: [
      {
        name: "得分率",
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: "#177ddc" },
        itemStyle: { color: "#177ddc" },
        areaStyle: { color: "rgba(23, 125, 220, 0.08)" },
        data: records.map((item) => Math.round((item.score / item.fullScore) * 1000) / 10)
      }
    ]
  });

  const buckets = [
    { name: "60 以下", min: 0, max: 60 },
    { name: "60-70", min: 60, max: 70 },
    { name: "70-80", min: 70, max: 80 },
    { name: "80-90", min: 80, max: 90 },
    { name: "90+", min: 90, max: 101 }
  ];
  const data = buckets.map((bucket) =>
    records.filter((item) => {
      const rate = (item.score / item.fullScore) * 100;
      return rate >= bucket.min && rate < bucket.max;
    }).length
  );

  distributionChart.setOption({
    grid: { left: 34, right: 12, top: 24, bottom: 38 },
    tooltip: {},
    xAxis: { type: "category", data: buckets.map((item) => item.name), axisLabel: { color: "#667085" } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#edf1f7" } }, axisLabel: { color: "#667085" } },
    series: [
      {
        type: "bar",
        barWidth: 28,
        data,
        itemStyle: { color: "#12b76a", borderRadius: [6, 6, 0, 0] }
      }
    ]
  });
}

function resize() {
  trendChart?.resize();
  distributionChart?.resize();
}

onMounted(() => {
  draw();
  window.addEventListener("resize", resize);
});

watch(() => [store.records.length, props.subjectId], draw);

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  trendChart?.dispose();
  distributionChart?.dispose();
});
</script>

<template>
  <div class="chart-grid">
    <section class="panel">
      <div class="section-head">
        <h2>历次考试趋势</h2>
        <span class="section-meta">按得分率展示</span>
      </div>
      <div ref="trendRef" class="chart-box"></div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>分数分布</h2>
        <span class="section-meta">{{ scopedRecords.length }} 条记录</span>
      </div>
      <div ref="distributionRef" class="chart-box"></div>
    </section>
  </div>
</template>
