<script setup>
import { computed, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { Image, Search, Trash2, X } from "@lucide/vue";
import ImageSyncQueue from "../components/ImageSyncQueue.vue";
import MistakeForm from "../components/MistakeForm.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const filters = reactive({ keyword: "", subjectId: "" });
const draftFilters = reactive({ keyword: "", subjectId: "" });
const showForm = ref(true);

const filteredMistakes = computed(() => {
  const keyword = normalizeSearch(filters.keyword);
  return store.mistakes
    .filter((item) => {
      const subject = store.subjectName(item.subjectId);
      const haystack = normalizeSearch([item.title, item.knowledgePoint, item.analysis, subject].join(" "));
      return (
        (!keyword || haystack.includes(keyword)) &&
        (!filters.subjectId || item.subjectId === filters.subjectId)
      );
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
});

function imageCount(id) {
  return store.images.filter((image) => image.ownerType === "mistake" && image.ownerId === id).length;
}

function applyFilters() {
  filters.keyword = draftFilters.keyword;
  filters.subjectId = draftFilters.subjectId;
}

function clearFilters() {
  draftFilters.keyword = "";
  draftFilters.subjectId = "";
  applyFilters();
}

function normalizeSearch(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}
</script>

<template>
  <div class="page-stack">
    <section class="panel">
      <div class="section-head">
        <h2>错题检索</h2>
        <div class="topbar-tools">
          <span class="section-meta">{{ store.imageStorageStats.count }} 张图 / {{ store.imageStorageStats.label }}</span>
          <button class="secondary-button compact" type="button" @click="showForm = !showForm">{{ showForm ? "收起表单" : "新增错题" }}</button>
        </div>
      </div>
      <form class="filter-bar with-actions" @submit.prevent="applyFilters">
        <input v-model="draftFilters.keyword" />
        <select v-model="draftFilters.subjectId">
          <option value="">全部科目</option>
          <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
        <button class="primary-button" type="submit">
          <Search :size="16" />
          搜索
        </button>
        <button class="secondary-button" type="button" @click="clearFilters">
          <X :size="16" />
          清空
        </button>
      </form>
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
              <i>{{ item.analysis ? "已写解析" : "待补解析" }}</i>
              <i><Image :size="14" />{{ imageCount(item.id) }} 张图</i>
            </div>
            <button class="icon-button danger" type="button" @click="store.removeMistake(item.id)">
              <Trash2 :size="15" />
            </button>
          </article>
          <p v-if="!filteredMistakes.length" class="empty">还没有符合条件的错题。</p>
        </div>
      </div>
    </section>
  </div>
</template>
