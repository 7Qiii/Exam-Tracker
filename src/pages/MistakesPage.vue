<script setup>
import { computed, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { ArrowUpRight, Image, Search, SlidersHorizontal, Trash2, X } from "@lucide/vue";
import ImageSyncQueue from "../components/ImageSyncQueue.vue";
import MistakeForm from "../components/MistakeForm.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const filters = reactive({ keyword: "", subjectId: "", status: "", difficulty: "", sort: "updated-desc" });
const draftFilters = reactive({ keyword: "", subjectId: "", status: "", difficulty: "", sort: "updated-desc" });
const showForm = ref(false);
const showAdvancedFilters = ref(false);

const statusOptions = ["待复盘", "不熟", "不会", "已整理", "已掌握"];
const difficultyOptions = ["简单", "中等", "困难"];

const filteredMistakes = computed(() => {
  const keyword = normalizeSearch(filters.keyword);
  return store.mistakes
    .filter((item) => {
      const subject = store.subjectName(item.subjectId);
      const haystack = normalizeSearch([item.title, item.knowledgePoint, item.analysis, subject].join(" "));
      return (
        (!keyword || haystack.includes(keyword)) &&
        (!filters.subjectId || item.subjectId === filters.subjectId) &&
        (!filters.status || (item.status || "待复盘") === filters.status) &&
        (!filters.difficulty || (item.difficulty || "") === filters.difficulty)
      );
    })
    .sort((a, b) => {
      if (filters.sort === "created-asc") return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      if (filters.sort === "status") return String(a.status || "").localeCompare(String(b.status || ""));
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
});

function imageCount(id) {
  return store.images.filter((image) => image.ownerType === "mistake" && image.ownerId === id).length;
}

function applyFilters() {
  filters.keyword = draftFilters.keyword;
  filters.subjectId = draftFilters.subjectId;
  filters.status = draftFilters.status;
  filters.difficulty = draftFilters.difficulty;
  filters.sort = draftFilters.sort;
}

function clearFilters() {
  draftFilters.keyword = "";
  draftFilters.subjectId = "";
  draftFilters.status = "";
  draftFilters.difficulty = "";
  draftFilters.sort = "updated-desc";
  applyFilters();
}

async function removeMistake(item) {
  if (!window.confirm(`确定删除“${item.title}”吗？`)) return;
  await store.removeMistake(item.id);
}

function normalizeSearch(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}
</script>

<template>
  <div class="page-stack">
    <section class="panel">
      <div class="section-head">
        <div>
          <h2>错题复习</h2>
          <span class="section-meta">{{ filteredMistakes.length }} 条结果 · 点击题目进入连续复习</span>
        </div>
        <div class="topbar-tools">
          <span class="section-meta">{{ store.imageStorageStats.count }} 张图 / {{ store.imageStorageStats.label }}</span>
          <button class="secondary-button compact" type="button" @click="showForm = !showForm">{{ showForm ? "收起表单" : "新增错题" }}</button>
        </div>
      </div>
      <form class="filter-bar with-actions" @submit.prevent="applyFilters">
        <input v-model="draftFilters.keyword" placeholder="搜索题目、知识点或解析" />
        <select v-model="draftFilters.subjectId">
          <option value="">全部科目</option>
          <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
        <button class="secondary-button" type="button" @click="showAdvancedFilters = !showAdvancedFilters">
          <SlidersHorizontal :size="16" />
          筛选
        </button>
        <button class="primary-button" type="submit">
          <Search :size="16" />
          搜索
        </button>
        <button class="secondary-button" type="button" @click="clearFilters">
          <X :size="16" />
          清空
        </button>
      </form>
      <div v-if="showAdvancedFilters" class="mistake-advanced-filters">
        <label>
          掌握状态
          <select v-model="draftFilters.status">
            <option value="">全部状态</option>
            <option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          难度
          <select v-model="draftFilters.difficulty">
            <option value="">全部难度</option>
            <option v-for="item in difficultyOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          排序
          <select v-model="draftFilters.sort">
            <option value="updated-desc">最近更新</option>
            <option value="created-asc">最早创建</option>
            <option value="status">按掌握状态</option>
          </select>
        </label>
      </div>
    </section>

    <ImageSyncQueue />

    <section class="content-grid">
      <div v-if="showForm" class="panel">
        <div class="section-head">
          <h2>新增错题</h2>
          <span class="section-meta">支持图片上传</span>
        </div>
        <MistakeForm />
      </div>

      <div class="panel panel-wide">
        <div class="section-head">
          <h2>错题库</h2>
          <span class="section-meta">{{ filteredMistakes.length }} 条</span>
        </div>
        <div class="card-list">
          <article v-for="item in filteredMistakes" :key="item.id" class="mistake-card">
            <RouterLink :to="`/mistakes/${item.id}`">
              <strong>{{ item.title }}</strong>
              <span>{{ store.subjectName(item.subjectId) }} / {{ item.knowledgePoint || "未分类知识点" }}</span>
            </RouterLink>
            <div class="tag-row">
              <i class="mistake-status-tag">{{ item.status || "待复盘" }}</i>
              <i v-if="item.difficulty">{{ item.difficulty }}</i>
              <i>{{ item.analysis ? "已写解析" : "待补解析" }}</i>
              <i><Image :size="14" />{{ imageCount(item.id) }} 张图</i>
            </div>
            <RouterLink class="mistake-open-link" :to="`/mistakes/${item.id}`" title="打开错题详情" aria-label="打开错题详情"><ArrowUpRight :size="16" /></RouterLink>
            <button class="icon-button danger" type="button" title="删除错题" aria-label="删除错题" @click="removeMistake(item)">
              <Trash2 :size="15" />
            </button>
          </article>
          <p v-if="!filteredMistakes.length" class="empty">还没有符合条件的错题。</p>
        </div>
      </div>
    </section>
  </div>
</template>
