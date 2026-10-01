<script setup>
import { computed, ref } from "vue";
import { BookOpenCheck, ClipboardList, Database, Download, FolderCog, HardDrive, ShieldCheck, Trash2, Upload } from "@lucide/vue";
import { useTrackerStore } from "../stores/tracker";
import DsPageHeader from "../components/ds/DsPageHeader.vue";
import DsSection from "../components/ds/DsSection.vue";
import DsStatCard from "../components/ds/DsStatCard.vue";

const store = useTrackerStore();
const importFile = ref(null);
const importMode = ref("merge");
const confirmText = ref("");
const message = ref("");
const error = ref("");

const totals = computed(() => [
  { label: "科目", value: store.subjects.length, unit: "个", icon: FolderCog },
  { label: "成绩", value: store.records.length, unit: "条", icon: ClipboardList },
  { label: "错题", value: store.mistakes.length, unit: "条", icon: BookOpenCheck },
  { label: "图片", value: store.imageStorageStats.count, unit: "张", icon: HardDrive }
]);
const hasData = computed(() => Boolean(store.records.length || store.mistakes.length || store.images.length));
const backupAgeDays = computed(() => {
  if (!store.lastBackupAt) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(store.lastBackupAt).getTime()) / 86400000);
});
const backupHint = computed(() => {
  if (!hasData.value) return "当前还没有需要备份的数据。";
  if (!store.lastBackupAt) return "还没有导出过备份，建议先生成一份。";
  if (backupAgeDays.value >= 7) return `上次备份是 ${backupAgeDays.value} 天前，建议更新。`;
  return `上次备份：${new Date(store.lastBackupAt).toLocaleString("zh-CN")}`;
});
const shouldBackup = computed(() => hasData.value && (backupAgeDays.value >= 7 || !store.lastBackupAt));

async function exportData() {
  const data = await store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `exam-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  store.markBackupExported();
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
  message.value = "成绩、错题和图片已清空，科目配置保留。";
}
</script>

<template>
  <div class="page-stack">
    <DsPageHeader title="备份与恢复" :description="backupHint">
      <template #actions>
        <button class="primary-button" type="button" @click="exportData">
          <Download :size="17" />
          导出备份
        </button>
      </template>
    </DsPageHeader>

    <div class="backup-mini-actions">
      <span class="detail-pill">{{ hasData ? "可导出当前本地档案" : "当前没有可备份内容" }}</span>
      <span class="detail-pill">{{ store.imageStorageStats.count }} 张图片 · {{ store.imageStorageStats.label }}</span>
    </div>

    <div v-if="shouldBackup" class="inline-alert">
      数据越多越值得定期备份。建议每周导出一份 JSON，尤其是错题图片较多时。
    </div>

    <section class="ds-stats">
      <DsStatCard
        v-for="item in totals"
        :key="item.label"
        :label="item.label"
        :value="item.value"
        :unit="item.unit"
        :icon="item.icon"
        hint="当前本地档案"
      />
    </section>

    <section class="content-grid">
      <DsSection title="导入恢复" description="支持合并或覆盖恢复">
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
            合并导入会保留现有数据；覆盖恢复会替换当前成绩、错题、图片和科目配置。
          </p>
        </div>
      </DsSection>

      <DsSection title="危险操作" description="清空时会保留科目配置">
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
      </DsSection>
    </section>

    <div v-if="message || error" class="inline-alert" :class="{ danger: error }">
      {{ error || message }}
    </div>
  </div>
</template>
