<script setup>
import { computed, reactive, ref, watch } from "vue";
import { BookOpenCheck, Save } from "@lucide/vue";
import ImageUploader from "./ImageUploader.vue";
import { useTrackerStore } from "../stores/tracker";

const props = defineProps({
  mistake: { type: Object, default: null }
});

const emit = defineEmits(["saved"]);
const store = useTrackerStore();
const files = ref([]);
const uploaderResetKey = ref(0);
const isSaving = ref(false);

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

function setFiles(nextFiles) {
  files.value = nextFiles;
}

watch(
  () => [store.visibleSubjects, props.mistake],
  () => {
    const source = props.mistake || {};
    form.subjectId = source.subjectId || store.visibleSubjects[0]?.id || "";
    form.title = source.title || "";
    form.knowledgePoint = source.knowledgePoint || "";
    form.reason = source.reason || "concept";
    form.status = source.status || "待复盘";
    form.sourceRecordId = source.sourceRecordId || "";
    form.questionText = source.questionText || "";
    form.analysis = source.analysis || "";
    form.nextReviewAt = source.nextReviewAt || "";
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
        <input v-model.trim="form.knowledgePoint" placeholder="例如：操作系统 / 调度算法" />
      </label>
    </div>

    <label>
      错题标题
      <input v-model.trim="form.title" required placeholder="例如：进程调度周转时间计算" />
    </label>

    <label>
      解析与复盘
      <textarea v-model.trim="form.analysis" rows="4" placeholder="写清楚错在哪里、正确路径、下次识别信号。"></textarea>
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
