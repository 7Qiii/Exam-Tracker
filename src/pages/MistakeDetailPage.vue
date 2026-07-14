<script setup>
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ArrowLeft } from "@lucide/vue";
import MistakeForm from "../components/MistakeForm.vue";
import { useTrackerStore } from "../stores/tracker";

const route = useRoute();
const store = useTrackerStore();
const mistake = computed(() => store.mistakes.find((item) => item.id === route.params.id));
</script>

<template>
  <div class="page-stack">
    <RouterLink class="text-link" to="/mistakes"><ArrowLeft :size="16" />返回错题库</RouterLink>
    <section v-if="mistake" class="detail-panel">
      <div class="detail-head">
        <div class="detail-copy">
          <p class="eyebrow">{{ store.subjectName(mistake.subjectId) }}</p>
          <h2>{{ mistake.title }}</h2>
          <div class="detail-meta-row">
            <span class="detail-pill">{{ mistake.knowledgePoint || "未填写知识点" }}</span>
            <span class="detail-pill">{{ mistake.status }}</span>
          </div>
        </div>
      </div>
      <MistakeForm :mistake="mistake" />
    </section>
    <p v-else class="empty">没有找到这条错题。</p>
  </div>
</template>
