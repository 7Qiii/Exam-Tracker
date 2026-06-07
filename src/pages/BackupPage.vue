<script setup>
import { computed, ref } from "vue";
import { Database, Download, ShieldCheck, Trash2, Upload } from "@lucide/vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const importFile = ref(null);
const importMode = ref("merge");
const confirmText = ref("");
const message = ref("");
const error = ref("");

const totals = computed(() => [
  { label: "科目", value: store.subjects.length },
  { label: "成绩", value: store.records.length },
  { label: "错题", value: store.mistakes.length },
  { label: "图片", value: `${store.imageStorageStats.count} / ${store.imageStorageStats.label}` }
]);

async function exportData() {
  const data = await store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `exam-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  message.value = "备份文件已生成。";
  error.value = "";
}

function chooseImport(mode) {
  importMode.value = mode;
  importFile.value?.click();
}

async function onImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  message.value = "";
  error.value = "";
  try {
    const payload = JSON.parse(await file.text());
    await store.importData(payload, importMode.value === "merge");
    message.value = importMode.value === "merge" ? "数据已合并导入。" : "数据已覆盖恢复。";
  } catch (err) {
    error.value = err.message || "导入失败，请检查备份文件。";
  } finally {
    event.target.value = "";
  }
}

async function clearData() {
  message.value = "";
  error.value = "";
  if (confirmText.value !== "清空") {
    error.value = "请输入“清空”后再执行。";
    return;
  }
  await store.clearAll();
  confirmText.value = "";
  message.value = "成绩、错题和图片记录已清空，科目配置已保留。";
}
</script>

<template>
  <div class="page-stack">
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">Backup</p>
        <h2>备份中心。</h2>
        <p>长期学习数据建议定期导出。导入支持合并和覆盖两种方式，清空操作需要二次确认。</p>
      </div>
      <button class="primary-button" type="button" @click="exportData">
        <Download :size="17" />
        导出备份
      </button>
    </section>

    <section class="summary-grid">
      <article v-for="item in totals" :key="item.label" class="metric-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>当前本地档案</small>
      </article>
    </section>

    <section class="content-grid">
      <div class="panel">
        <div class="section-head">
          <h2>导入恢复</h2>
          <span class="section-meta">JSON 备份文件</span>
        </div>
        <div class="action-stack">
          <button class="secondary-button" type="button" @click="chooseImport('merge')">
            <Upload :size="17" />
            合并导入
          </button>
          <button class="secondary-button" type="button" @click="chooseImport('replace')">
            <Database :size="17" />
            覆盖恢复
          </button>
          <input ref="importFile" class="visually-hidden" type="file" accept=".json,application/json" @change="onImport" />
          <p class="form-tip">
            <ShieldCheck :size="16" />
            合并导入会保留现有数据；覆盖恢复会先替换当前成绩、错题、图片和科目配置。
          </p>
        </div>
      </div>

      <div class="panel">
        <div class="section-head">
          <h2>危险操作</h2>
          <span class="section-meta">保留科目配置</span>
        </div>
        <div class="form-grid">
          <label>
            输入“清空”确认
            <input v-model.trim="confirmText" placeholder="清空" />
          </label>
          <button class="secondary-button danger-text" type="button" @click="clearData">
            <Trash2 :size="17" />
            清空成绩、错题和图片
          </button>
        </div>
      </div>
    </section>

    <div v-if="message || error" class="inline-alert" :class="{ danger: error }">
      {{ error || message }}
    </div>
  </div>
</template>
