<script setup>
import { computed } from "vue";
import { AlertTriangle, CheckCircle2, Cloud, Image, RefreshCw } from "@lucide/vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();

const cloudCount = computed(() => store.images.filter((image) => image.url || image.storageKey).length);
const pendingCount = computed(() => store.pendingImages.length);
const failedCount = computed(() => store.failedImages.length);
const hasQueue = computed(() => pendingCount.value || failedCount.value);

function retry() {
  store.retryPendingImageUploads();
}
</script>

<template>
  <section class="panel sync-panel">
    <div class="section-head">
      <div>
        <h2>图片同步</h2>
        <span class="section-meta">R2 云端图片状态</span>
      </div>
      <button class="secondary-button compact" type="button" :disabled="!failedCount && !pendingCount" @click="retry">
        <RefreshCw :size="15" />
        重试
      </button>
    </div>

    <div class="sync-stats">
      <article>
        <CheckCircle2 :size="17" />
        <strong>{{ cloudCount }}</strong>
        <span>已云端</span>
      </article>
      <article>
        <Cloud :size="17" />
        <strong>{{ pendingCount }}</strong>
        <span>同步中</span>
      </article>
      <article :class="{ danger: failedCount }">
        <AlertTriangle :size="17" />
        <strong>{{ failedCount }}</strong>
        <span>失败</span>
      </article>
    </div>

    <div v-if="hasQueue" class="queue-list">
      <div v-for="image in [...store.failedImages, ...store.pendingImages].slice(0, 4)" :key="image.id" class="queue-row">
        <Image :size="15" />
        <span>{{ image.name }}</span>
        <small>{{ image.uploadError || "正在上传到 R2" }}</small>
      </div>
    </div>
  </section>
</template>
