<script setup>
import { computed, ref, watch } from "vue";
import { ImagePlus, Maximize2, Trash2, X } from "@lucide/vue";

const props = defineProps({
  images: { type: Array, default: () => [] },
  resetKey: { type: [String, Number], default: 0 }
});

const emit = defineEmits(["files", "remove"]);
const pending = ref([]);
const activeImage = ref(null);

const previews = computed(() => [
  ...props.images.map((image) => ({
    id: image.id,
    name: image.name,
    url: image.url || URL.createObjectURL(image.blob),
    persisted: true
  })),
  ...pending.value
]);

watch(
  () => props.resetKey,
  () => {
    pending.value.forEach((item) => URL.revokeObjectURL(item.url));
    pending.value = [];
  }
);

function onPick(event) {
  const files = [...event.target.files || []].filter((file) => file.type.startsWith("image/"));
  pending.value.push(...files.map((file) => ({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file), file })));
  emit("files", files);
  event.target.value = "";
}

function openPreview(image) {
  activeImage.value = image;
}

function closePreview() {
  activeImage.value = null;
}
</script>

<template>
  <div class="uploader">
    <label class="upload-drop">
      <ImagePlus :size="24" />
      <span>上传题目截图、解析图或草稿图</span>
      <small>支持多张图片，优先保存在本地 IndexedDB</small>
      <input type="file" accept="image/*" multiple @change="onPick" />
    </label>

    <div v-if="previews.length" class="image-grid">
      <figure v-for="image in previews" :key="image.id" class="image-tile">
        <button class="image-preview-button" type="button" @click="openPreview(image)" :title="`查看 ${image.name}`">
          <img :src="image.url" :alt="image.name" />
          <span><Maximize2 :size="14" />查看大图</span>
        </button>
        <figcaption>
          <span>{{ image.name }}</span>
          <button v-if="image.persisted" type="button" @click="emit('remove', image.id)" title="删除图片">
            <Trash2 :size="15" />
          </button>
        </figcaption>
      </figure>
    </div>

    <div v-if="activeImage" class="lightbox" role="dialog" aria-modal="true" @click.self="closePreview">
      <div class="lightbox-card">
        <div class="lightbox-head">
          <strong>{{ activeImage.name }}</strong>
          <button type="button" @click="closePreview" title="关闭预览"><X :size="18" /></button>
        </div>
        <img :src="activeImage.url" :alt="activeImage.name" />
      </div>
    </div>
  </div>
</template>
