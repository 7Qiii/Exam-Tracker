<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Edit3, RotateCcw, Trash2 } from "@lucide/vue";
import MistakeForm from "../components/MistakeForm.vue";
import { useTrackerStore } from "../stores/tracker";

const route = useRoute();
const router = useRouter();
const store = useTrackerStore();
const isEditing = ref(false);
const isReviewing = ref(false);

const mistake = computed(() => store.mistakes.find((item) => item.id === route.params.id));
const orderedMistakes = computed(() => [...store.mistakes].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))));
const currentIndex = computed(() => orderedMistakes.value.findIndex((item) => item.id === route.params.id));
const previousMistake = computed(() => orderedMistakes.value[currentIndex.value + 1] || null);
const nextMistake = computed(() => orderedMistakes.value[currentIndex.value - 1] || null);
const images = computed(() => mistake.value ? store.images.filter((item) => item.ownerType === "mistake" && item.ownerId === mistake.value.id) : []);
const reviewKey = computed(() => `exam-tracker-reviews-${mistake.value?.id || ""}`);
const reviewCount = ref(0);

function loadReviewCount() {
  reviewCount.value = Number(localStorage.getItem(reviewKey.value) || 0);
}

async function markReviewed() {
  if (!mistake.value || isReviewing.value) return;
  isReviewing.value = true;
  try {
    await store.updateMistake(mistake.value.id, { status: "已掌握", reviewedAt: new Date().toISOString() });
    reviewCount.value += 1;
    localStorage.setItem(reviewKey.value, String(reviewCount.value));
  } finally {
    isReviewing.value = false;
  }
}

async function remove() {
  if (!mistake.value) return;
  if (!window.confirm(`确定删除“${mistake.value.title}”吗？`)) return;
  await store.removeMistake(mistake.value.id);
  router.push("/mistakes");
}

function onSaved() {
  isEditing.value = false;
}

watch(() => route.params.id, loadReviewCount, { immediate: true });
</script>

<template>
  <div class="page-stack">
    <div class="detail-toolbar">
      <RouterLink class="text-link" to="/mistakes"><ArrowLeft :size="16" />返回错题库</RouterLink>
      <div class="detail-nav">
        <RouterLink v-if="previousMistake" class="secondary-button compact" :to="`/mistakes/${previousMistake.id}`" title="上一题"><ChevronLeft :size="16" />上一题</RouterLink>
        <RouterLink v-if="nextMistake" class="secondary-button compact" :to="`/mistakes/${nextMistake.id}`" title="下一题">下一题<ChevronRight :size="16" /></RouterLink>
      </div>
    </div>

    <section v-if="mistake" class="detail-panel mistake-detail-panel">
      <div class="detail-head">
        <div class="detail-copy">
          <p class="eyebrow">{{ store.subjectName(mistake.subjectId) }} · {{ mistake.knowledgePoint || "未分类知识点" }}</p>
          <h2>{{ mistake.title }}</h2>
          <div class="detail-meta-row">
            <span class="detail-pill">{{ mistake.status || "待复盘" }}</span>
            <span class="detail-pill">{{ mistake.difficulty || "中等" }}</span>
            <span class="detail-pill">{{ reviewCount }} 次复习</span>
            <span v-if="mistake.nextReviewAt" class="detail-pill">下次：{{ mistake.nextReviewAt }}</span>
          </div>
        </div>
        <div class="detail-actions">
          <button v-if="!isEditing" class="secondary-button" type="button" @click="isEditing = true"><Edit3 :size="16" />编辑</button>
          <button class="secondary-button" type="button" :disabled="isReviewing" @click="markReviewed"><Check :size="16" />{{ isReviewing ? "保存中" : "标记已掌握" }}</button>
          <button class="secondary-button danger-text" type="button" @click="remove"><Trash2 :size="16" />删除</button>
        </div>
      </div>

      <MistakeForm v-if="isEditing" :mistake="mistake" @saved="onSaved" />
      <div v-else class="mistake-reading-layout">
        <div class="mistake-reading-main">
          <article class="reading-block">
            <div class="reading-block-head"><h3>题目内容</h3><span v-if="mistake.sourceRecordId">关联成绩已建立</span></div>
            <p>{{ mistake.questionText || "还没有补充题目内容，可在编辑中粘贴题目、公式或图片说明。" }}</p>
          </article>
          <article class="reading-block">
            <div class="reading-block-head"><h3>我的答案与解析</h3><span>{{ mistake.analysis ? "已完成" : "待补充" }}</span></div>
            <p>{{ mistake.analysis || "还没有写下复盘过程。建议记录错误原因、正确思路和下次遇到同类题的判断方法。" }}</p>
          </article>
          <article v-if="images.length" class="mistake-image-grid">
            <img v-for="image in images" :key="image.id" :src="image.url || (image.blob ? URL.createObjectURL(image.blob) : '')" :alt="image.name" />
          </article>
        </div>
        <aside class="mistake-review-aside">
          <div class="review-status-card">
            <RotateCcw :size="18" />
            <strong>复习进度</strong>
            <span>{{ reviewCount }} 次复习记录</span>
            <button class="primary-button" type="button" @click="markReviewed"><Check :size="16" />完成本次复习</button>
          </div>
          <div class="review-tip">
            <strong>复盘提示</strong>
            <span>先遮住解析，尝试重新作答，再补充真正卡住的知识点。</span>
          </div>
        </aside>
      </div>
    </section>
    <div v-else class="empty-state panel">没有找到这道错题。</div>
  </div>
</template>
