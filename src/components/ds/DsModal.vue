<script setup>
/**
 * 通用弹窗：遮罩 + Esc 关闭 + 打开时锁滚动。
 * 关闭动画交给外层控制（本组件在关闭时直接卸载），避免残留节点挡住点击。
 */
import { onBeforeUnmount, watch } from "vue";
import { X } from "@lucide/vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  wide: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: true }
});

const emit = defineEmits(["update:modelValue", "close"]);

function close() {
  emit("update:modelValue", false);
  emit("close");
}

function onKeydown(event) {
  if (event.key === "Escape") close();
}

let previousOverflow = "";

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === "undefined") return;
    if (open) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKeydown);
    } else {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

onBeforeUnmount(() => {
  if (typeof document !== "undefined") document.body.style.overflow = previousOverflow;
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="ds-modal-backdrop" @mousedown.self="closeOnBackdrop && close()">
      <section class="ds-modal" :class="{ 'is-wide': wide }" role="dialog" aria-modal="true">
        <div class="ds-modal-head">
          <div>
            <h2>{{ title }}</h2>
            <p v-if="description">{{ description }}</p>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" @click="close">
            <X :size="16" />
          </button>
        </div>
        <div class="ds-modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="ds-modal-foot">
          <slot name="footer" />
        </div>
      </section>
    </div>
  </Teleport>
</template>
