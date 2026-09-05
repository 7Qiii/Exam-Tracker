<script setup>
import { computed } from "vue";

const props = defineProps({
  records: { type: Array, default: () => [] },
  mistakes: { type: Array, default: () => [] },
  days: { type: Number, default: 90 }
});

const today = new Date();
today.setHours(0, 0, 0, 0);

const dateKey = (date) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
};

const activity = computed(() => {
  const result = new Map();
  props.records.forEach((item) => {
    const key = dateKey(item.date);
    if (key) result.set(key, (result.get(key) || 0) + 1);
  });
  props.mistakes.forEach((item) => {
    const key = dateKey(item.createdAt);
    if (key) result.set(key, (result.get(key) || 0) + 1);
  });
  return result;
});

const cells = computed(() => {
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - props.days + 1);
  start.setDate(start.getDate() - start.getDay() + 1);
  const list = [];
  for (let index = 0; index < props.days + 14; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    if (date > end) break;
    const key = dateKey(date);
    const count = activity.value.get(key) || 0;
    list.push({
      key,
      date,
      count,
      level: count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count >= 4 ? 4 : 3
    });
  }
  return list;
});

const columns = computed(() => {
  const result = [];
  cells.value.forEach((cell, index) => {
    const column = Math.floor(index / 7);
    if (!result[column]) result[column] = [];
    result[column].push(cell);
  });
  return result;
});

const activeDays = computed(() => cells.value.filter((cell) => cell.count > 0).length);
const streak = computed(() => {
  let count = 0;
  const cursor = new Date(today);
  while (activity.value.has(dateKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
});

function formatDate(date) {
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
</script>

<template>
  <section class="panel contribution-panel">
    <div class="section-head">
      <div>
        <h2>学习贡献</h2>
        <span class="section-meta">最近 90 天 · 成绩与错题都会计入</span>
      </div>
      <div class="contribution-summary">
        <span><strong>{{ activeDays }}</strong> 活跃日</span>
        <span><strong>{{ streak }}</strong> 连续日</span>
      </div>
    </div>

    <div class="heatmap-scroll">
      <div class="heatmap">
        <div class="heatmap-weekdays" aria-hidden="true">
          <span></span>
          <span>一</span>
          <span></span>
          <span>三</span>
          <span></span>
          <span>五</span>
          <span></span>
        </div>
        <div class="heatmap-columns">
          <div v-for="(column, index) in columns" :key="index" class="heatmap-column">
            <span
              v-for="cell in column"
              :key="cell.key"
              class="heatmap-cell"
              :class="`level-${cell.level}`"
              :title="`${formatDate(cell.date)} · ${cell.count} 项学习记录`"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="heatmap-legend">
      <span>少</span>
      <i class="heatmap-cell level-0"></i>
      <i class="heatmap-cell level-1"></i>
      <i class="heatmap-cell level-2"></i>
      <i class="heatmap-cell level-3"></i>
      <i class="heatmap-cell level-4"></i>
      <span>多</span>
    </div>
  </section>
</template>
