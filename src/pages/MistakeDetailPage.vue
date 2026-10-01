<script setup>
/**
 * 错题详情 = 连续复习界面。
 *
 * 设计目标：一题一题往下过，尽量不离开键盘、不来回跳页。
 * - 上一题 / 下一题沿用列表页的筛选与排序（条件通过 URL query 带过来），
 *   所以「筛出 5 道不熟的题」就能顺着这 5 道翻完。
 * - 状态可以就地切换，不用进编辑表单。
 * - 桌面端支持快捷键：← → 翻题，1–5 切换状态。
 * - 复习日志只写 localStorage，不改动 IndexedDB 里错题的数据结构。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ArrowLeft, BookOpenCheck, Check, ChevronLeft, ChevronRight, Edit3, RotateCcw, Trash2 } from "@lucide/vue";
import MistakeForm from "../components/MistakeForm.vue";
import DsEmptyState from "../components/ds/DsEmptyState.vue";
import DsPageHeader from "../components/ds/DsPageHeader.vue";
import { useConfirm } from "../composables/useConfirm";
import { useTrackerStore } from "../stores/tracker";
import { MISTAKE_STATUS_OPTIONS, filterAndSortMistakes, readMistakeFilters, toMistakeQuery } from "../utils/mistakeQueue";

const route = useRoute();
const router = useRouter();
const store = useTrackerStore();
const { confirm } = useConfirm();

const isEditing = ref(false);
const savingStatus = ref("");
const reviewLog = ref([]);

const mistake = computed(() => store.mistakes.find((item) => item.id === route.params.id));
const images = computed(() =>
  mistake.value ? store.images.filter((item) => item.ownerType === "mistake" && item.ownerId === mistake.value.id) : []
);

/** 当前复习队列：和列表页用同一套筛选/排序，条件来自地址栏 */
const reviewQueue = computed(() =>
  filterAndSortMistakes(store.mistakes, readMistakeFilters(route.query), store.subjectName)
);
const currentIndex = computed(() => reviewQueue.value.findIndex((item) => item.id === route.params.id));
const previousMistake = computed(() => (currentIndex.value > 0 ? reviewQueue.value[currentIndex.value - 1] : null));
const nextMistake = computed(() =>
  currentIndex.value > -1 && currentIndex.value < reviewQueue.value.length - 1 ? reviewQueue.value[currentIndex.value + 1] : null
);
const queueSize = computed(() => reviewQueue.value.length);

const listQuery = computed(() => toMistakeQuery(readMistakeFilters(route.query)));

// 图片地址统一在 JS 里算好。
// 之前写成模板里的 `URL.createObjectURL(...)`，模板表达式会被编译成 `_ctx.URL`，
// 实例上没有这个属性，只要图片是 blob 且没有 url 就会直接抛错；而且每次重渲染都会
// 新建一个 object URL 造成泄漏。这里改成 computed + 显式回收。
const imageSources = ref({});
let objectUrls = [];

function rebuildImageSources(list) {
  releaseImageSources();
  const next = {};
  list.forEach((image) => {
    if (image.url) {
      next[image.id] = image.url;
      return;
    }
    if (image.blob) {
      const url = URL.createObjectURL(image.blob);
      objectUrls.push(url);
      next[image.id] = url;
    }
  });
  imageSources.value = next;
}

function releaseImageSources() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function imageSrc(image) {
  return imageSources.value[image.id] || "";
}

const reviewCount = computed(() => reviewLog.value.length);

const nextReviewText = computed(() => {
  const value = mistake.value?.nextReviewAt;
  if (!value) return "未安排";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN");
});

const mistakeMetaLine = computed(() => {
  if (!mistake.value) return "";
  return [
    mistake.value.difficulty || "难度未填",
    `已复习 ${reviewCount.value} 次`,
    `下次复习：${nextReviewText.value}`,
    mistake.value.sourceRecordId ? "已关联成绩" : ""
  ]
    .filter(Boolean)
    .join(" · ");
});

function logKey(id) {
  return `exam-tracker-review-log-${id}`;
}

function loadReviewLog() {
  const id = route.params.id;
  if (!id || typeof localStorage === "undefined") {
    reviewLog.value = [];
    return;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(logKey(id)) || "[]");
    reviewLog.value = Array.isArray(parsed) ? parsed : [];
  } catch {
    reviewLog.value = [];
  }
}

function appendReviewLog(status) {
  const id = route.params.id;
  if (!id || typeof localStorage === "undefined") return;
  const next = [{ at: new Date().toISOString(), status }, ...reviewLog.value].slice(0, 50);
  reviewLog.value = next;
  localStorage.setItem(logKey(id), JSON.stringify(next));
}

async function setStatus(status) {
  const current = mistake.value?.status || "待复盘";
  if (!mistake.value || current === status || savingStatus.value) return;
  savingStatus.value = status;
  try {
    await store.updateMistake(mistake.value.id, { status, reviewedAt: new Date().toISOString() });
    appendReviewLog(status);
    store.notify(`已标记为「${status}」`, "success");
  } finally {
    savingStatus.value = "";
  }
}

/**
 * 完成本次复习：记为一次复习，并默认标为已掌握。
 *
 * 这里不能直接复用 setStatus("已掌握")：setStatus 遇到「状态没变化」会直接 return，
 * 于是「已经掌握的题再复习一遍」——间隔重复里最常见的场景——点按钮毫无反馈，
 * 不计复习次数、不更新复习时间、连 toast 都没有。
 * 所以无论状态变不变，都记一次复习。
 */
async function markReviewed() {
  if (!mistake.value || savingStatus.value) return;
  const wasMastered = (mistake.value.status || "待复盘") === "已掌握";
  savingStatus.value = "review";
  try {
    await store.updateMistake(mistake.value.id, { status: "已掌握", reviewedAt: new Date().toISOString() });
    appendReviewLog("已掌握");
    store.notify(wasMastered ? "已记录本次复习" : "已标记为「已掌握」", "success");
  } finally {
    savingStatus.value = "";
  }
}

function goTo(target) {
  if (!target) return;
  router.push({ path: `/mistakes/${target.id}`, query: listQuery.value });
}

async function remove() {
  if (!mistake.value) return;
  const ok = await confirm({
    title: "删除这道错题？",
    message: `「${mistake.value.title}」及其图片会一起删除，此操作不可恢复。`,
    confirmText: "删除"
  });
  if (!ok) return;
  await store.removeMistake(mistake.value.id);
  router.push({ path: "/mistakes", query: listQuery.value });
}

function onSaved() {
  isEditing.value = false;
}

function onKeydown(event) {
  if (isEditing.value) return;
  const tag = event.target?.tagName;
  // 正在输入框里打字就不要抢快捷键
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    goTo(previousMistake.value);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    goTo(nextMistake.value);
    return;
  }
  const index = Number(event.key) - 1;
  if (index >= 0 && index < MISTAKE_STATUS_OPTIONS.length) {
    event.preventDefault();
    setStatus(MISTAKE_STATUS_OPTIONS[index]);
  }
}

watch(
  () => route.params.id,
  () => {
    loadReviewLog();
    // 换题时退出编辑态并回到顶部，避免翻页后停在半空
    isEditing.value = false;
    window.scrollTo({ top: 0, behavior: "auto" });
  },
  { immediate: true }
);
watch(images, rebuildImageSources, { immediate: true });

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  releaseImageSources();
});

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="page-stack">
    <div class="review-toolbar">
      <RouterLink class="text-link" :to="{ path: '/mistakes', query: listQuery }">
        <ArrowLeft :size="16" />返回错题库
      </RouterLink>
      <div class="review-toolbar-nav">
        <span v-if="queueSize" class="review-position">{{ currentIndex + 1 }} / {{ queueSize }}</span>
        <button class="secondary-button compact" type="button" :disabled="!previousMistake" @click="goTo(previousMistake)">
          <ChevronLeft :size="16" />上一题
        </button>
        <button class="secondary-button compact" type="button" :disabled="!nextMistake" @click="goTo(nextMistake)">
          下一题<ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <DsPageHeader
      v-if="mistake"
      :eyebrow="`${store.subjectName(mistake.subjectId)} · ${mistake.knowledgePoint || '未分类知识点'}`"
      :title="mistake.title"
      :description="mistakeMetaLine"
    >
      <template #actions>
        <button v-if="!isEditing" class="secondary-button" type="button" @click="isEditing = true">
          <Edit3 :size="16" />编辑
        </button>
        <button v-else class="secondary-button" type="button" @click="isEditing = false">取消编辑</button>
        <button class="secondary-button danger-text" type="button" @click="remove">
          <Trash2 :size="16" />删除
        </button>
      </template>
    </DsPageHeader>

    <section v-if="mistake" class="detail-panel mistake-detail-panel">
      <!-- 掌握状态就地切换：复习时最常用的动作放最前面 -->
      <div class="review-status-row">
        <span class="review-status-label">掌握状态</span>
        <div class="review-status-switch" role="group" aria-label="切换掌握状态">
          <button
            v-for="status in MISTAKE_STATUS_OPTIONS"
            :key="status"
            type="button"
            :class="{ active: (mistake.status || '待复盘') === status }"
            :disabled="Boolean(savingStatus)"
            @click="setStatus(status)"
          >
            {{ status }}
          </button>
        </div>
        <span class="review-kbd">
          快捷键 <kbd>←</kbd><kbd>→</kbd> 翻题 · <kbd>1</kbd>–<kbd>5</kbd> 切状态
        </span>
      </div>

      <MistakeForm v-if="isEditing" :mistake="mistake" @saved="onSaved" />

      <div v-else class="mistake-reading-layout">
        <div class="mistake-reading-main">
          <article class="reading-block">
            <div class="reading-block-head">
              <h3>题目内容</h3>
              <span>{{ mistake.questionText ? "已填写" : "待补充" }}</span>
            </div>
            <p v-if="mistake.questionText">{{ mistake.questionText }}</p>
            <p v-else class="ds-muted">还没有补充题目内容。可以在编辑里粘贴题干、公式或图片说明。</p>
          </article>

          <article class="reading-block">
            <div class="reading-block-head">
              <h3>解析与复盘</h3>
              <span>{{ mistake.analysis ? "已写解析" : "待补充" }}</span>
            </div>
            <p v-if="mistake.analysis">{{ mistake.analysis }}</p>
            <p v-else class="ds-muted">建议写下错误原因、正确思路，以及下次遇到同类题的判断方法。</p>
          </article>

          <article v-if="images.length" class="mistake-image-grid">
            <img v-for="image in images" :key="image.id" :src="imageSrc(image)" :alt="image.name" loading="lazy" />
          </article>
        </div>

        <aside class="mistake-review-aside">
          <div class="review-status-card">
            <RotateCcw :size="18" />
            <strong>复习进度</strong>
            <span>已复习 {{ reviewCount }} 次 · 下次 {{ nextReviewText }}</span>
            <button class="primary-button" type="button" :disabled="Boolean(savingStatus)" @click="markReviewed">
              <Check :size="16" />{{ savingStatus ? "保存中" : "完成本次复习" }}
            </button>
          </div>

          <div class="review-tip">
            <strong>复盘提示</strong>
            <span>先遮住解析，尝试重新作答；真的卡住了，再把卡点补进解析里。</span>
          </div>

          <div v-if="reviewLog.length" class="review-history">
            <strong>复习历史</strong>
            <div class="review-history-list">
              <div v-for="(entry, index) in reviewLog.slice(0, 5)" :key="index" class="review-history-item">
                <strong>{{ entry.status || "已复习" }}</strong>
                <span>{{ formatDateTime(entry.at) }}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <DsEmptyState
      v-else
      :icon="BookOpenCheck"
      title="没有找到这道错题"
      description="它可能已经被删除，或者链接已经失效。"
    >
      <template #action>
        <RouterLink class="secondary-button" :to="{ path: '/mistakes', query: listQuery }">
          <BookOpenCheck :size="16" />回到错题库
        </RouterLink>
      </template>
    </DsEmptyState>
  </div>
</template>
