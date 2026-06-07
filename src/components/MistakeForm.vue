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

const reasonOptions = [
  { value: "concept", label: "概念不清" },
  { value: "method", label: "方法不熟" },
  { value: "careless", label: "审题/计算失误" },
  { value: "time", label: "时间不足" }
];

const statusOptions = ["待复盘", "已整理", "复盘中", "已掌握"];
const relatedImages = computed(() => (props.mistake ? store.images.filter((image) => image.ownerType === "mistake" && image.ownerId === props.mistake.id) : []));

watch(
  () => [store.subjects, props.mistake],
  () => {
    const source = props.mistake || {};
    form.subjectId = source.subjectId || store.subjects[0]?.id || "";
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
}
</script>

<template>
  <form class="form-grid" @submit.prevent="submit">
    <div class="form-row">
      <label>
        科目
        <select v-model="form.subjectId" required>
          <option v-for="subject in store.subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
      </label>
      <label>
        关联成绩
        <select v-model="form.sourceRecordId">
          <option value="">不关联</option>
          <option v-for="record in store.records" :key="record.id" :value="record.id">
            {{ record.paperName }} / {{ record.date }}
          </option>
        </select>
      </label>
    </div>

    <label>
      错题标题
      <input v-model.trim="form.title" required placeholder="例如：进程调度周转时间计算" />
    </label>

    <div class="form-row">
      <label>
        知识点
        <input v-model.trim="form.knowledgePoint" placeholder="例如：操作系统 / 调度算法" />
      </label>
      <label>
        错因
        <select v-model="form.reason">
          <option v-for="item in reasonOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>
      <label>
        状态
        <select v-model="form.status">
          <option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
    </div>

    <label>
      题干摘录
      <textarea v-model.trim="form.questionText" rows="3" placeholder="可以先贴关键条件，图片留给完整题面。"></textarea>
    </label>
    <label>
      解析与复盘
      <textarea v-model.trim="form.analysis" rows="4" placeholder="写清楚错在哪里、正确路径、下次识别信号。"></textarea>
    </label>
    <label>
      下次复盘日期
      <input v-model="form.nextReviewAt" type="date" />
    </label>

    <ImageUploader
      :images="relatedImages"
      :reset-key="uploaderResetKey"
      @files="files.push(...$event)"
      @remove="store.removeImage"
    />

    <button class="primary-button" type="submit">
      <Save :size="17" />
      {{ props.mistake ? "保存错题" : "新增错题" }}
    </button>
    <p class="form-tip">
      <BookOpenCheck :size="16" />
      {{ store.user ? "图片会压缩后上传到 Cloudflare R2，并在本地保留索引缓存。" : "未登录时图片只会离线保存到当前设备。" }}
    </p>
  </form>
</template>
