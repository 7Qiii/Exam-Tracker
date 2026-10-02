<script setup>
/**
 * 通用弹窗：遮罩 + Escape 关闭 + 焦点圈 + 打开时锁滚动。
 *
 * 键盘行为统一交给 useDialogA11y。以前这里自己写了一份 Escape 监听，
 * 但没做焦点圈 —— 而焦点圈恰恰是手写弹窗最容易漏、又最容易被忽略的一项。
 */
import { ref, toRef } from "vue";
import { X } from "@lucide/vue";
import { useDialogA11y } from "../../composables/useDialogA11y";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  wide: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: true }
});

const emit = defineEmits(["update:modelValue", "close"]);

const dialogRef = ref(null);

function close() {
  emit("update:modelValue", false);
  emit("close");
}

useDialogA11y(toRef(props, "modelValue"), dialogRef, { onClose: close });
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="ds-modal-backdrop" @mousedown.self="closeOnBackdrop && close()">
      <section
        ref="dialogRef"
        class="ds-modal"
        :class="{ 'is-wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-label="title || undefined"
      >
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
