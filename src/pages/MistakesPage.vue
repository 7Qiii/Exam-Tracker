<script setup>
import { computed, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { Image, Trash2 } from "@lucide/vue";
import MistakeForm from "../components/MistakeForm.vue";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const filters = reactive({ keyword: "", subjectId: "", status: "" });
const showForm = ref(true);

const filteredMistakes = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase();
  return store.mistakes
    .filter((item) => {
      const subject = store.subjectName(item.subjectId);
      return (
        (!keyword || `${item.title} ${item.knowledgePoint} ${item.analysis} ${subject}`.toLowerCase().includes(keyword)) &&
        (!filters.subjectId || item.subjectId === filters.subjectId) &&
        (!filters.status || item.status === filters.status)
      );
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
});

function imageCount(id) {
  return store.images.filter((image) => image.ownerType === "mistake" && image.ownerId === id).length;
}
</script>

<template>
  <div class="page-stack">
    <section class="panel">
      <div class="section-head">
        <h2>错题检索</h2>
        <button class="secondary-button compact" type="button" @click="showForm = !showForm">{{ showForm ? "收起表单" : "新增错题" }}</button>
      </div>
      <div class="filter-bar">
        <input v-model="filters.keyword" placeholder="搜索标题、知识点、解析" />
        <select v-model="filters.subjectId">
          <option value="">全部科目</option>
          <option v-for="subject in store.subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option>待复盘</option>
          <option>已整理</option>
          <option>复盘中</option>
          <option>已掌握</option>
        </select>
      </div>
    </section>

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
              <i>{{ item.status }}</i>
              <i>{{ item.reason }}</i>
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
