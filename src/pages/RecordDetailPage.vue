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
const isRemoving = ref(false);

const record = computed(() => store.records.find((item) => item.id === route.params.id));
const relatedMistakes = computed(() => store.mistakes.filter((item) => item.sourceRecordId === route.params.id));
const recordTitle = computed(() => {
  if (!record.value) return "";
  if (record.value.recordType !== "exercise") return record.value.paperName;
  return [record.value.exerciseBookName || record.value.paperName, record.value.exercisePage ? `P${record.value.exercisePage}` : "", record.value.exerciseQuestion ? `第 ${record.value.exerciseQuestion} 题` : ""]
    .filter(Boolean)
    .join(" · ");
});
const recordVariantText = computed(() => recordVariantLabel(record.value));
const recordTypeText = computed(() => {
  if (record.value?.recordType === "composite") return "合成";
  if (record.value?.recordType === "exercise") return "习题";
  return recordVariantText.value ? `试卷 · ${recordVariantText.value}` : "试卷";
});
const compositeSources = computed(() => store.compositeSourcesForRecord(record.value));
const scoreRate = computed(() => {
  if (!record.value || !Number(record.value.fullScore)) return 0;
  return Math.round((Number(record.value.score || 0) / Number(record.value.fullScore)) * 100);
});
const compositeSourceTotal = computed(() =>
  compositeSources.value.reduce(
    (total, item) => ({
      score: total.score + normalizeScoreValue(item.score),
      fullScore: total.fullScore + normalizeScoreValue(item.fullScore),
      durationMinutes:
        total.durationMinutes === "" || normalizeDuration(item.durationMinutes) === ""
          ? ""
          : Number(total.durationMinutes) + Number(normalizeDuration(item.durationMinutes))
    }),
    { score: 0, fullScore: 0, durationMinutes: 0 }
  )
);

async function remove() {
  if (!record.value) return;
  const ok = typeof window === "undefined" || window.confirm(`确定删除「${recordTitle.value}」吗？24 小时内可以恢复。`);
  if (!ok || isRemoving.value) return;
  isRemoving.value = true;
  try {
    await store.removeRecord(record.value.id);
    router.push("/records");
  } finally {
    isRemoving.value = false;
  }
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

function normalizeDuration(value) {
  if (value === "" || value === null || value === undefined) return "";
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : "";
}

function normalizeScoreValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function subjectAccentStyle() {
  return record.value ? { "--subject-color": store.subjectColor(record.value.subjectId) } : {};
}

function sourceTypeText(source) {
  if (source.recordType === "composite") return "合成";
  if (source.recordType === "exercise") return "习题";
  const variant = recordVariantLabel(source);
  return variant ? `试卷 · ${variant}` : "试卷";
}

function recordVariantLabel(item) {
  if (!item || item.subjectId !== "math1" || (item.recordType || "paper") !== "paper") return "";
  const value = normalizePaperVariant(item);
  if (value === "true") return "真题";
  if (value === "mock") return "模拟卷";
  return "未分类";
}

function normalizePaperVariant(item) {
  const raw = String(item?.paperVariant || "").trim().toLowerCase();
  if (raw === "true" || raw === "mock") return raw;
  const name = String(item?.paperName || "").trim().toLowerCase();
  if (/mock|模拟|模考/.test(name)) return "mock";
  if (/真题|历年|历届/.test(name)) return "true";
  return "";
}

function sourceChanged(source) {
  return (
    Number(source.score) !== Number(source.originalScore) ||
    Number(source.fullScore) !== Number(source.originalFullScore) ||
    String(normalizeDuration(source.durationMinutes)) !== String(normalizeDuration(source.originalDurationMinutes))
  );
}
</script>

<template>
  <div class="page-stack">
    <RouterLink class="text-link" to="/records"><ArrowLeft :size="16" />返回成绩列表</RouterLink>
    <section v-if="record" class="detail-panel subject-detail-panel" :style="subjectAccentStyle()">
      <div class="detail-head">
        <div class="detail-copy">
          <p class="eyebrow subject-eyebrow">
            <span class="subject-chip compact">
              <span class="subject-dot"></span>
              {{ store.subjectName(record.subjectId) }}
            </span>
          </p>
          <h2>{{ recordTitle }}</h2>
          <div class="detail-meta-row">
            <span class="detail-pill">{{ record.date }}</span>
            <span class="detail-pill">{{ recordTypeText }}</span>
            <span class="detail-pill">{{ record.pendingSync ? "待同步" : "已同步" }}</span>
          </div>
        </div>
        <div class="detail-actions">
          <button v-if="!isEditing" class="secondary-button" type="button" @click="startEdit"><Edit3 :size="16" />编辑</button>
          <button v-else class="secondary-button" type="button" @click="closeEdit"><X :size="16" />关闭</button>
          <button class="secondary-button danger-text" type="button" :disabled="isRemoving" @click="remove"><Trash2 :size="16" />{{ isRemoving ? '\u5220\u9664\u4e2d...' : '\u5220\u9664' }}</button>
        </div>
      </div>
      <RecordForm v-if="isEditing" :record="record" @saved="onSaved" />
      <template v-else>
        <div class="detail-metrics">
          <article><span>得分率</span><strong>{{ scoreRate }}%</strong></article>
          <article><span>得分</span><strong>{{ record.score }} / {{ record.fullScore }}</strong></article>
          <article><span>用时</span><strong>{{ formatDuration(record.durationMinutes) }}</strong></article>
          <article><span>类型</span><strong>{{ recordTypeText }}</strong></article>
          <article v-if="record.recordType === 'exercise'"><span>习题册</span><strong>{{ record.exerciseBookName || "未填写" }}</strong></article>
          <article v-if="record.recordType === 'exercise'"><span>页码 / 题号</span><strong>{{ record.exercisePage || "--" }} / {{ record.exerciseQuestion || "--" }}</strong></article>
        </div>
        <div v-if="record.recordType === 'composite'" class="note-block composite-breakdown">
          <div class="composite-breakdown-head">
            <div>
              <h3>分项构成</h3>
              <p>{{ compositeSources.length ? `共 ${compositeSources.length} 条来源记录` : "没有找到来源记录。" }}</p>
            </div>
            <strong v-if="compositeSources.length">{{ compositeSourceTotal.score }} / {{ compositeSourceTotal.fullScore }}</strong>
          </div>
          <div v-if="compositeSources.length" class="composite-source-list detail-source-list">
            <article v-for="source in compositeSources" :key="source.id" class="detail-source-item">
              <div class="detail-source-main">
                <strong>{{ source.paperName }}</strong>
                <span>{{ store.subjectName(source.subjectId) }} · {{ sourceTypeText(source) }} · {{ source.date || "未记录日期" }}</span>
              </div>
              <div class="detail-source-score">
                <strong>{{ source.score }} / {{ source.fullScore }}</strong>
                <span>{{ formatDuration(source.durationMinutes) }}</span>
              </div>
              <i v-if="sourceChanged(source)">已自定义计入</i>
            </article>
          </div>
        </div>
        <div class="note-block">
          <h3>复盘备注</h3>
          <p>{{ store.displayRecordNote(record) || "还没有填写复盘备注。" }}</p>
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
