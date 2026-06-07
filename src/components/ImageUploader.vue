<script setup>
import { computed, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, ImagePlus, Maximize2, Trash2, X } from "@lucide/vue";

const props = defineProps({
  images: { type: Array, default: () => [] },
  resetKey: { type: [String, Number], default: 0 }
});

const emit = defineEmits(["files", "remove"]);
const pending = ref([]);
const activeIndex = ref(-1);
const warning = ref("");
const isDragging = ref(false);

const previews = computed(() => [
  ...props.images.map((image) => ({
    id: image.id,
    name: image.name,
    url: image.url || URL.createObjectURL(image.blob),
    size: image.size || image.blob?.size || 0,
    persisted: true
  })),
  ...pending.value
]);
const activeImage = computed(() => previews.value[activeIndex.value] || null);
const totalSize = computed(() => previews.value.reduce((sum, image) => sum + Number(image.size || 0), 0));
const summary = computed(() => `${previews.value.length} 张 / ${formatBytes(totalSize.value)}`);

watch(
  () => props.resetKey,
  () => {
    pending.value.forEach((item) => URL.revokeObjectURL(item.url));
    pending.value = [];
    activeIndex.value = -1;
    warning.value = "";
  }
);

function onPick(event) {
  const picked = [...event.target.files || []];
  addPickedFiles(picked);
  event.target.value = "";
}

function onDrop(event) {
  isDragging.value = false;
  const picked = [...event.dataTransfer?.files || []];
  addPickedFiles(picked);
}

function onDragEnter() {
  isDragging.value = true;
}

function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    isDragging.value = false;
  }
}

function addPickedFiles(picked) {
  const files = picked.filter((file) => file.type.startsWith("image/"));
  const ignored = picked.length - files.length;
  warning.value = ignored ? `${ignored} 个非图片文件已忽略。` : "";
  if (!files.length) return;
  pending.value.push(...files.map((file) => ({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file), size: file.size, file })));
  emitPendingFiles();
}

function openPreview(index) {
  activeIndex.value = index;
}

function removePreview(image, index) {
  if (image.persisted) {
    emit("remove", image.id);
    return;
  }

  const persistedCount = props.images.length;
  const pendingIndex = index - persistedCount;
  const [removed] = pending.value.splice(pendingIndex, 1);
  if (removed?.url) URL.revokeObjectURL(removed.url);
  if (activeIndex.value >= previews.value.length) activeIndex.value = previews.value.length - 1;
  emitPendingFiles();
}

function emitPendingFiles() {
  emit("files", pending.value.map((item) => item.file));
}

function closePreview() {
  activeIndex.value = -1;
}

function stepPreview(offset) {
  if (!previews.value.length) return;
  activeIndex.value = (activeIndex.value + offset + previews.value.length) % previews.value.length;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}
</script>

<template>
  <div class="uploader">
    <label
      class="upload-drop"
      :class="{ dragging: isDragging }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <ImagePlus :size="24" />
      <span>上传题目截图、解析图或草稿图</span>
      <small>{{ previews.length ? summary : "点击选择，或在 PC 端拖拽图片到这里" }}</small>
      <input type="file" accept="image/*" multiple @change="onPick" />
    </label>
    <p v-if="warning" class="form-tip danger-text">{{ warning }}</p>

    <div v-if="previews.length" class="image-grid">
      <figure v-for="(image, index) in previews" :key="image.id" class="image-tile">
        <button class="image-preview-button" type="button" @click="openPreview(index)" :title="`查看 ${image.name}`">
          <img :src="image.url" :alt="image.name" />
          <span><Maximize2 :size="14" />查看大图</span>
        </button>
        <figcaption>
          <span>{{ image.name }}</span>
          <small>{{ formatBytes(image.size) }}</small>
          <button type="button" @click="removePreview(image, index)" :title="image.persisted ? '删除图片' : '取消上传'">
            <Trash2 :size="15" />
          </button>
        </figcaption>
      </figure>
    </div>

    <div v-if="activeImage" class="lightbox" role="dialog" aria-modal="true" @click.self="closePreview">
      <div class="lightbox-card">
        <div class="lightbox-head">
          <strong>{{ activeImage.name }}</strong>
          <span>{{ activeIndex + 1 }} / {{ previews.length }}</span>
          <button type="button" @click="closePreview" title="关闭预览"><X :size="18" /></button>
        </div>
        <button class="lightbox-nav prev" type="button" title="上一张" @click="stepPreview(-1)">
          <ChevronLeft :size="22" />
        </button>
        <img :src="activeImage.url" :alt="activeImage.name" />
        <button class="lightbox-nav next" type="button" title="下一张" @click="stepPreview(1)">
          <ChevronRight :size="22" />
        </button>
      </div>
    </div>
  </div>
</template>
