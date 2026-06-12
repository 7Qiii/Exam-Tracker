<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { BookOpenCheck, Save } from "@lucide/vue";
import ImageUploader from "./ImageUploader.vue";
import { useTrackerStore } from "../stores/tracker";

const props = defineProps({
  mistake: { type: Object, default: null }
});

const emit = defineEmits(["saved"]);
const store = useTrackerStore();
const route = useRoute();
const files = ref([]);
const uploaderResetKey = ref(0);
const isSaving = ref(false);
const focusedField = ref("");

const form = reactive({
  subjectId: "",
  title: "",
  knowledgePoint: "",
  reason: "concept",
  status: "待复盘",
  sourceRecordId: "",
  questionText: "",
  analysis: "",
  nextReviewAt: ""
});

const relatedImages = computed(() => (props.mistake ? store.images.filter((image) => image.ownerType === "mistake" && image.ownerId === props.mistake.id) : []));
const sourceRecord = computed(() => {
  const id = props.mistake?.sourceRecordId || route.query.recordId || form.sourceRecordId;
  return store.records.find((record) => record.id === id) || null;
});
const titleHistory = computed(() => uniqueHistory(store.mistakes.map((mistake) => mistake.title)));
const knowledgeHistory = computed(() => uniqueHistory(store.mistakes.map((mistake) => mistake.knowledgePoint)));
const analysisHistory = computed(() => uniqueHistory(store.mistakes.map((mistake) => mistake.analysis), 5));

function setFiles(nextFiles) {
  files.value = nextFiles;
}

function uniqueHistory(values, limit = 8) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function setSuggestion(field, value) {
  form[field] = value;
  focusedField.value = "";
}

watch(
  () => [store.visibleSubjects, props.mistake, route.query.recordId, store.records.length],
  () => {
    const source = props.mistake || {};
    const queryRecord = !props.mistake && route.query.recordId ? store.records.find((record) => record.id === route.query.recordId) : null;
    form.subjectId = source.subjectId || store.visibleSubjects[0]?.id || "";
    form.title = source.title || "";
    form.knowledgePoint = source.knowledgePoint || "";
    form.reason = source.reason || "concept";
    form.status = source.status || "待复盘";
    form.sourceRecordId = source.sourceRecordId || queryRecord?.id || "";
    form.questionText = source.questionText || "";
    form.analysis = source.analysis || "";
    form.nextReviewAt = source.nextReviewAt || "";
    if (queryRecord) {
      form.subjectId = queryRecord.subjectId;
      form.title = queryRecord.paperName ? `${queryRecord.paperName} 错题` : form.title;
    }
  },
  { immediate: true, deep: true }
);

async function submit() {
  isSaving.value = true;
  try {
    if (props.mistake) {
      await store.updateMistake(props.mistake.id, { ...form }, files.value);
    } else {
      await store.addMistake({ ...form }, files.value);
      form.title = "";
      form.knowledgePoint = "";
      form.questionText = "";
      form.analysis = "";
      form.nextReviewAt = "";
    }
    files.value = [];
    uploaderResetKey.value += 1;
    emit("saved");
  } catch (error) {
    store.notify(error.message || "错题保存失败。", "error", 6000);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <form class="form-grid" @submit.prevent="submit">
    <div class="form-row two">
      <label>
        科目
        <select v-model="form.subjectId" required>
          <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
      </label>
      <label>
        知识点
        <input v-model.trim="form.knowledgePoint" @focus="focusedField = 'knowledgePoint'" @blur="focusedField = ''" />
        <div v-if="focusedField === 'knowledgePoint' && knowledgeHistory.length" class="field-suggestions">
          <button v-for="item in knowledgeHistory" :key="item" type="button" @mousedown.prevent="setSuggestion('knowledgePoint', item)">
            {{ item }}
          </button>
        </div>
      </label>
    </div>

    <label>
      错题标题
      <input v-model.trim="form.title" required @focus="focusedField = 'title'" @blur="focusedField = ''" />
      <div v-if="focusedField === 'title' && titleHistory.length" class="field-suggestions">
        <button v-for="item in titleHistory" :key="item" type="button" @mousedown.prevent="setSuggestion('title', item)">
          {{ item }}
        </button>
      </div>
    </label>

    <p v-if="sourceRecord" class="form-tip">
      <BookOpenCheck :size="16" />
      关联成绩：{{ sourceRecord.paperName }} · {{ sourceRecord.score }} / {{ sourceRecord.fullScore }}
    </p>

    <label>
      解析与复盘
      <textarea v-model.trim="form.analysis" rows="4" @focus="focusedField = 'analysis'" @blur="focusedField = ''"></textarea>
      <div v-if="focusedField === 'analysis' && analysisHistory.length" class="field-suggestions">
        <button v-for="item in analysisHistory" :key="item" type="button" @mousedown.prevent="setSuggestion('analysis', item)">
          {{ item }}
        </button>
      </div>
    </label>

    <ImageUploader
      :images="relatedImages"
      :reset-key="uploaderResetKey"
      @files="setFiles"
      @remove="store.removeImage"
    />

    <button class="primary-button" type="submit" :disabled="isSaving">
      <Save :size="17" />
      {{ isSaving ? "保存中..." : props.mistake ? "保存错题" : "新增错题" }}
    </button>
    <p class="form-tip">
      <BookOpenCheck :size="16" />
      {{ store.user ? "图片会压缩后上传到 Cloudflare R2，并在本地保留索引缓存。" : "未登录时图片只会离线保存到当前设备。" }}
    </p>
  </form>
</template>
