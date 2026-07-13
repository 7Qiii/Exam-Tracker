<script setup>
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ArrowLeft, Edit3, Trash2, X } from "@lucide/vue";
import RecordForm from "../components/RecordForm.vue";
import { useTrackerStore } from "../stores/tracker";

const route = useRoute();
const router = useRouter();
const store = useTrackerStore();
const isEditing = ref(false);

const record = computed(() => store.records.find((item) => item.id === route.params.id));
const relatedMistakes = computed(() => store.mistakes.filter((item) => item.sourceRecordId === route.params.id));
const recordTitle = computed(() => {
  if (!record.value) return "";
  if (record.value.recordType !== "exercise") return record.value.paperName;
  return [
    record.value.exerciseBookName || record.value.paperName,
    record.value.exercisePage ? `P${record.value.exercisePage}` : "",
    record.value.exerciseQuestion ? `第 ${record.value.exerciseQuestion} 题` : ""
  ]
    .filter(Boolean)
    .join(" · ");
});
const recordTypeText = computed(() => {
  if (record.value?.recordType === "composite") return "合成";
  return record.value?.recordType === "exercise" ? "习题" : "试卷";
});

async function remove() {
  if (!record.value) return;
  await store.removeRecord(record.value.id);
  router.push("/records");
}

function startEdit() {
  isEditing.value = true;
}

function closeEdit() {
  isEditing.value = false;
}

function onSaved() {
  closeEdit();
}

function formatDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "未记录";
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${value} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}
</script>

<template>
  <div class="page-stack">
    <RouterLink class="text-link" to="/records"><ArrowLeft :size="16" />返回成绩列表</RouterLink>
    <section v-if="record" class="detail-panel">
      <div class="detail-head">
        <div>
          <p class="eyebrow">{{ store.subjectName(record.subjectId) }}</p>
          <h2>{{ recordTitle }}</h2>
          <span>{{ record.date }}</span>
        </div>
        <div class="detail-actions">
          <button v-if="!isEditing" class="secondary-button" type="button" @click="startEdit"><Edit3 :size="16" />编辑</button>
          <button v-else class="secondary-button" type="button" @click="closeEdit"><X :size="16" />关闭</button>
          <button class="secondary-button danger-text" type="button" @click="remove"><Trash2 :size="16" />删除</button>
        </div>
      </div>
      <RecordForm v-if="isEditing" :record="record" @saved="onSaved" />
      <template v-else>
        <div class="detail-metrics">
          <article><span>得分</span><strong>{{ record.score }} / {{ record.fullScore }}</strong></article>
          <article><span>用时</span><strong>{{ formatDuration(record.durationMinutes) }}</strong></article>
          <article><span>类型</span><strong>{{ recordTypeText }}</strong></article>
          <article v-if="record.recordType === 'exercise'"><span>习题册</span><strong>{{ record.exerciseBookName || "未填写" }}</strong></article>
          <article v-if="record.recordType === 'exercise'"><span>页码 / 题号</span><strong>{{ record.exercisePage || "--" }} / {{ record.exerciseQuestion || "--" }}</strong></article>
        </div>
        <div class="note-block">
          <h3>复盘备注</h3>
          <p>{{ record.note || "还没有填写复盘备注。" }}</p>
        </div>
      </template>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>关联错题</h2>
        <RouterLink class="text-link" to="/mistakes">新增错题</RouterLink>
      </div>
      <div class="card-list">
        <RouterLink v-for="item in relatedMistakes" :key="item.id" class="list-card" :to="`/mistakes/${item.id}`">
          <strong>{{ item.title }}</strong>
          <span>{{ item.knowledgePoint || "未填写知识点" }}</span>
        </RouterLink>
        <p v-if="!relatedMistakes.length" class="empty">这条成绩还没有关联错题。</p>
      </div>
    </section>
  </div>
</template>
