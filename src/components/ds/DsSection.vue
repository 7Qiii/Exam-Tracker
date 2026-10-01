<script setup>
/**
 * 区块卡片：统一「标题 + 说明 + 右侧操作 + 内容」的节奏。
 * flush 模式下标题带下边框、内容自带内边距，适合直接放表格。
 */
import { X } from "@lucide/vue";

defineProps({
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  flush: { type: Boolean, default: false },
  closable: { type: Boolean, default: false }
});

defineEmits(["close"]);
</script>

<template>
  <section class="ds-section" :class="{ 'is-flush': flush }">
    <div v-if="title || $slots.actions || $slots.meta" class="ds-section-head">
      <div>
        <h2>{{ title }}</h2>
        <span v-if="description" class="ds-section-meta">{{ description }}</span>
      </div>
      <div class="ds-section-tools">
        <slot name="meta" />
        <slot name="actions" />
        <button v-if="closable" class="icon-button" type="button" aria-label="关闭" @click="$emit('close')">
          <X :size="15" />
        </button>
      </div>
    </div>
    <div :class="flush ? 'ds-section-body' : ''">
      <slot />
    </div>
  </section>
</template>
