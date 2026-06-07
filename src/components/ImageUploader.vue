<script setup>
import { computed, ref, watch } from "vue";
import { ImagePlus, Trash2 } from "@lucide/vue";

const props = defineProps({
  images: { type: Array, default: () => [] },
  resetKey: { type: [String, Number], default: 0 }
});

const emit = defineEmits(["files", "remove"]);
const pending = ref([]);

const previews = computed(() => [
  ...props.images.map((image) => ({
    id: image.id,
    name: image.name,
    url: URL.createObjectURL(image.blob),
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
        <img :src="image.url" :alt="image.name" />
        <figcaption>
          <span>{{ image.name }}</span>
          <button v-if="image.persisted" type="button" @click="emit('remove', image.id)" title="删除图片">
            <Trash2 :size="15" />
          </button>
        </figcaption>
      </figure>
    </div>
  </div>
</template>
