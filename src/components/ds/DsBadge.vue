<script setup>
/**
 * 状态徽标。tone: neutral / blue / green / orange / red / purple
 */
defineProps({
  tone: { type: String, default: "neutral" },
  icon: { type: [Object, Function], default: null }
});
</script>

<template>
  <span class="ds-badge" :class="tone !== 'neutral' ? `is-${tone}` : ''">
    <component :is="icon" v-if="icon" />
    <slot />
  </span>
</template>
