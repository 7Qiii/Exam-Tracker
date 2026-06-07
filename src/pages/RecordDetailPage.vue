<script setup>
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ArrowLeft, Trash2 } from "@lucide/vue";
import { useTrackerStore } from "../stores/tracker";

const route = useRoute();
const router = useRouter();
const store = useTrackerStore();

const record = computed(() => store.records.find((item) => item.id === route.params.id));
const relatedMistakes = computed(() => store.mistakes.filter((item) => item.sourceRecordId === route.params.id));

async function remove() {
  if (!record.value) return;
  await store.removeRecord(record.value.id);
  router.push("/records");
}
</script>

<template>
  <div class="page-stack">
    <RouterLink class="text-link" to="/records"><ArrowLeft :size="16" />返回成绩列表</RouterLink>
    <section v-if="record" class="detail-panel">
      <div class="detail-head">
        <div>
          <p class="eyebrow">{{ store.subjectName(record.subjectId) }}</p>
          <h2>{{ record.paperName }}</h2>
          <span>{{ record.date }}</span>
        </div>
        <button class="secondary-button danger-text" type="button" @click="remove"><Trash2 :size="16" />删除</button>
      </div>
      <div class="detail-metrics">
        <article><span>得分</span><strong>{{ record.score }} / {{ record.fullScore }}</strong></article>
        <article><span>得分率</span><strong>{{ Math.round((record.score / record.fullScore) * 1000) / 10 }}%</strong></article>
      </div>
      <div class="note-block">
        <h3>复盘备注</h3>
        <p>{{ record.note || "还没有填写复盘备注。" }}</p>
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>关联错题</h2>
        <RouterLink class="text-link" to="/mistakes">新增错题</RouterLink>
      </div>
      <div class="card-list">
        <RouterLink v-for="item in relatedMistakes" :key="item.id" class="list-card" :to="`/mistakes/${item.id}`">
          <strong>{{ item.title }}</strong>
          <span>{{ item.knowledgePoint || "未填写知识点" }} / {{ item.status }}</span>
        </RouterLink>
        <p v-if="!relatedMistakes.length" class="empty">这条成绩还没有关联错题。</p>
      </div>
    </section>
  </div>
</template>
