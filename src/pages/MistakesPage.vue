<script setup>
/**
 * 错题库：按「连续复习」的思路重排。
 *
 * 和旧版的差别：
 * - 筛选即时生效，不再需要点「搜索」按钮；筛选条件写进 URL query，刷新后还在。
 * - 顶部是带数量的状态 chip，一眼看出还剩多少没掌握，点一下就是筛选。
 * - 每行可以直接切掌握状态，不用进详情页；主按钮是「复习」而不是「详情」。
 * - 排序默认按创建时间，符合「一题一题往下过」的习惯。
 */
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { BookOpenCheck, Image, Inbox, Plus, Trash2 } from "@lucide/vue";
import ImageSyncQueue from "../components/ImageSyncQueue.vue";
import MistakeForm from "../components/MistakeForm.vue";
import DsEmptyState from "../components/ds/DsEmptyState.vue";
import DsFilterBar from "../components/ds/DsFilterBar.vue";
import DsLoadingState from "../components/ds/DsLoadingState.vue";
import DsPageHeader from "../components/ds/DsPageHeader.vue";
import DsSection from "../components/ds/DsSection.vue";
import { useConfirm } from "../composables/useConfirm";
import { useTrackerStore } from "../stores/tracker";
import {
  MISTAKE_DIFFICULTY_OPTIONS,
  MISTAKE_SORT_OPTIONS,
  MISTAKE_STATUS_OPTIONS,
  filterAndSortMistakes,
  hasActiveMistakeFilters,
  readMistakeFilters,
  toMistakeQuery
} from "../utils/mistakeQueue";

const store = useTrackerStore();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const STATUS_OPTIONS = MISTAKE_STATUS_OPTIONS;
const DIFFICULTY_OPTIONS = MISTAKE_DIFFICULTY_OPTIONS;
const SORT_OPTIONS = MISTAKE_SORT_OPTIONS;

const filters = reactive(readMistakeFilters(route.query));
const showForm = ref(false);
const savingId = ref("");

/** 知识点在现有数据里承担「章节」的角色，直接从已有错题里归纳 */
const knowledgePoints = computed(() => {
  const seen = new Map();
  store.mistakes.forEach((item) => {
    const value = String(item.knowledgePoint || "").trim();
    if (!value) return;
    seen.set(value, (seen.get(value) || 0) + 1);
  });
  return [...seen.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-Hans-CN"));
});

const statusCounts = computed(() => {
  const counts = new Map(STATUS_OPTIONS.map((status) => [status, 0]));
  store.mistakes.forEach((item) => {
    const key = item.status || "待复盘";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
});

const filteredMistakes = computed(() => filterAndSortMistakes(store.mistakes, filters, store.subjectName));

const activeFilterCount = computed(
  () =>
    [filters.keyword, filters.subjectId, filters.knowledgePoint, filters.status, filters.difficulty].filter(Boolean).length
);

const hasFilter = computed(() => hasActiveMistakeFilters(filters));

// 筛选条件同步到地址栏：刷新、分享、前进后退都不会丢
watch(
  () => ({ ...filters }),
  (value) => {
    router.replace({ path: "/mistakes", query: toMistakeQuery(value) });
  },
  { deep: true }
);

/** 详情页带着同一套筛选条件打开，上一题/下一题才不会跑出当前队列 */
function reviewLink(id) {
  return { path: `/mistakes/${id}`, query: toMistakeQuery(filters) };
}

function clearFilters() {
  filters.keyword = "";
  filters.subjectId = "";
  filters.knowledgePoint = "";
  filters.status = "";
  filters.difficulty = "";
  filters.sort = "created-desc";
}

function toggleStatus(status) {
  filters.status = filters.status === status ? "" : status;
}

function imageCount(id) {
  return store.images.filter((image) => image.ownerType === "mistake" && image.ownerId === id).length;
}

async function setStatus(item, status) {
  const current = item.status || "待复盘";
  if (current === status || savingId.value) return;
  savingId.value = item.id;
  try {
    await store.updateMistake(item.id, { status, reviewedAt: new Date().toISOString() });
    if (status === "已掌握") recordReview(item.id, status);
    store.notify(`已标记为「${status}」`, "success");
  } finally {
    savingId.value = "";
  }
}

/** 复习日志只存在本地，不改动 IndexedDB 里的错题结构 */
function recordReview(id, status) {
  try {
    const key = `exam-tracker-review-log-${id}`;
    const log = JSON.parse(localStorage.getItem(key) || "[]");
    log.unshift({ at: new Date().toISOString(), status });
    localStorage.setItem(key, JSON.stringify(log.slice(0, 50)));
  } catch {
    /* 存不进去也不影响主流程 */
  }
}

async function removeMistake(item) {
  const ok = await confirm({
    title: "删除这道错题？",
    message: `「${item.title}」及其图片会一起删除，此操作不可恢复。`,
    confirmText: "删除"
  });
  if (!ok) return;
  await store.removeMistake(item.id);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
</script>

<template>
  <div class="page-stack">
    <DsPageHeader title="错题库" :description="`共 ${store.mistakes.length} 道 · 点状态直接筛选，点「复习」进入连续复习`">
      <template #actions>
        <button class="secondary-button" type="button" @click="showForm = !showForm">
          <Plus :size="16" />
          {{ showForm ? "收起表单" : "新增错题" }}
        </button>
      </template>
    </DsPageHeader>

    <!-- 状态 chip：一眼看出还剩多少没掌握，点一下就是筛选 -->
    <DsSection title="掌握状态" description="点一下按状态筛选">
      <div class="review-status-chips">
        <button type="button" :class="{ active: !filters.status }" @click="filters.status = ''">
          全部 <b>{{ store.mistakes.length }}</b>
        </button>
        <button
          v-for="status in STATUS_OPTIONS"
          :key="status"
          type="button"
          :class="{ active: filters.status === status }"
          @click="toggleStatus(status)"
        >
          {{ status }} <b>{{ statusCounts.get(status) || 0 }}</b>
        </button>
      </div>
    </DsSection>

    <!-- 筛选栏：改完立即生效 -->
    <DsFilterBar :min-field-width="140">
      <label class="ds-field">
        <span class="ds-field-label">搜索</span>
        <input v-model.trim="filters.keyword" type="search" placeholder="题目、知识点或解析" />
      </label>
      <label class="ds-field">
        <span class="ds-field-label">科目</span>
        <select v-model="filters.subjectId">
          <option value="">全部科目</option>
          <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
      </label>
      <label class="ds-field">
        <span class="ds-field-label">章节 / 知识点</span>
        <select v-model="filters.knowledgePoint">
          <option value="">全部章节</option>
          <option v-for="item in knowledgePoints" :key="item.value" :value="item.value">{{ item.value }}（{{ item.count }}）</option>
        </select>
      </label>
      <label class="ds-field">
        <span class="ds-field-label">难度</span>
        <select v-model="filters.difficulty">
          <option value="">全部难度</option>
          <option v-for="item in DIFFICULTY_OPTIONS" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label class="ds-field">
        <span class="ds-field-label">排序</span>
        <select v-model="filters.sort">
          <option v-for="item in SORT_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>

      <template #actions>
        <button v-if="hasFilter" class="secondary-button" type="button" @click="clearFilters">清空筛选</button>
      </template>

      <template #meta>
        <span v-if="!store.isReady">正在读取…</span>
        <span v-else>{{ filteredMistakes.length }} 条结果{{ activeFilterCount ? ` · 已应用 ${activeFilterCount} 个筛选` : "" }}</span>
        <span>{{ store.imageStorageStats.count }} 张图 / {{ store.imageStorageStats.label }}</span>
      </template>
    </DsFilterBar>

    <ImageSyncQueue />

    <DsSection v-if="showForm" title="新增错题" description="支持图片上传与 AI 解析">
      <MistakeForm @saved="showForm = false" />
    </DsSection>

    <!-- 复习列表 -->
    <!-- 数据来自本地 IndexedDB，通常是瞬时读完，但首次打开仍可能有一帧空白，
         这里用骨架屏顶上，避免先闪一下「错题库还是空的」再跳出内容。 -->
    <DsLoadingState v-if="!store.isReady" variant="cards" :rows="4" label="正在读取错题库…" />
    <div v-else-if="filteredMistakes.length" class="ds-card-list">
      <article v-for="item in filteredMistakes" :key="item.id" class="review-card">
        <RouterLink class="review-card-main" :to="reviewLink(item.id)">
          <span class="review-card-title">{{ item.title }}</span>
          <span class="review-card-meta">
            <span>{{ store.subjectName(item.subjectId) }}</span>
            <span>{{ item.knowledgePoint || "未分类知识点" }}</span>
            <span>{{ item.difficulty || "难度未填" }}</span>
            <span>{{ formatDate(item.createdAt) }} 创建</span>
            <span v-if="imageCount(item.id)"><Image :size="13" /> {{ imageCount(item.id) }} 张图</span>
            <span v-if="item.analysis">已写解析</span>
            <span v-else>待补解析</span>
          </span>
        </RouterLink>

        <div class="review-card-side">
          <div class="review-status-switch" role="group" aria-label="掌握状态">
            <button
              v-for="status in STATUS_OPTIONS"
              :key="status"
              type="button"
              :class="{ active: (item.status || '待复盘') === status }"
              :disabled="Boolean(savingId)"
              @click="setStatus(item, status)"
            >
              {{ status }}
            </button>
          </div>
          <RouterLink class="secondary-button compact" :to="reviewLink(item.id)">复习</RouterLink>
          <button class="icon-button danger" type="button" title="删除错题" aria-label="删除错题" @click="removeMistake(item)">
            <Trash2 :size="15" />
          </button>
        </div>
      </article>
    </div>

    <DsEmptyState
      v-else
      :icon="store.mistakes.length ? Inbox : BookOpenCheck"
      :title="store.mistakes.length ? '没有符合条件的错题' : '错题库还是空的'"
      :description="
        store.mistakes.length ? '换个状态或清空筛选看看。' : '记录错题后，可以在这里按科目和章节连续复习。'
      "
    >
      <template #action>
        <button v-if="store.mistakes.length" class="secondary-button" type="button" @click="clearFilters">清空筛选</button>
        <button v-else class="primary-button" type="button" @click="showForm = true"><Plus :size="16" />新增错题</button>
      </template>
    </DsEmptyState>
  </div>
</template>
