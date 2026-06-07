<script setup>
import { computed, reactive, ref } from "vue";
import { Palette, Plus, Save, Trash2 } from "@lucide/vue";
import { defaultSubjects, isDefaultSubject } from "../services/storage";
import { useTrackerStore } from "../stores/tracker";

const store = useTrackerStore();
const message = ref("");
const error = ref("");

const form = reactive({
  name: "",
  fullScore: 100,
  color: "#177ddc"
});

const defaultIds = new Set(defaultSubjects.map((subject) => subject.id));

const rows = computed(() =>
  store.subjects.map((subject) => ({
    ...subject,
    locked: defaultIds.has(subject.id),
    recordCount: store.records.filter((record) => record.subjectId === subject.id).length,
    mistakeCount: store.mistakes.filter((mistake) => mistake.subjectId === subject.id).length
  }))
);

async function add() {
  error.value = "";
  message.value = "";
  if (!form.name.trim()) return;
  await store.addSubject({ ...form });
  message.value = "科目已新增。";
  form.name = "";
  form.fullScore = 100;
  form.color = "#177ddc";
}

async function save(subject) {
  error.value = "";
  message.value = "";
  await store.updateSubject(subject.id, {
    name: subject.name,
    fullScore: subject.fullScore,
    color: subject.color
  });
  message.value = "科目已保存。";
}

async function remove(subject) {
  error.value = "";
  message.value = "";
  if (isDefaultSubject(subject.id)) {
    error.value = "默认科目不能删除。";
    return;
  }
  try {
    await store.removeSubject(subject.id);
    message.value = "科目已删除。";
  } catch (err) {
    error.value = err.message || "删除失败。";
  }
}
</script>

<template>
  <div class="page-stack">
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">Subjects</p>
        <h2>管理你的考试科目。</h2>
        <p>默认科目按当前备考配置固定排序：数一、408、英一、政治。自定义科目会排在默认科目之后。</p>
      </div>
    </section>

    <section class="content-grid">
      <div class="panel">
        <div class="section-head">
          <h2>新增科目</h2>
          <span class="section-meta">自定义扩展</span>
        </div>
        <form class="form-grid" @submit.prevent="add">
          <label>
            科目名称
            <input v-model.trim="form.name" required placeholder="例如：西综 / 333 教育综合" />
          </label>
          <div class="form-row two">
            <label>
              满分
              <input v-model="form.fullScore" type="number" min="1" step="1" required />
            </label>
            <label>
              颜色
              <span class="color-field">
                <input v-model="form.color" type="color" />
                <input v-model.trim="form.color" required />
              </span>
            </label>
          </div>
          <button class="primary-button" type="submit">
            <Plus :size="17" />
            新增科目
          </button>
        </form>
      </div>

      <div class="panel panel-wide">
        <div class="section-head">
          <h2>科目列表</h2>
          <span class="section-meta">{{ rows.length }} 个科目</span>
        </div>
        <div v-if="message || error" class="inline-alert" :class="{ danger: error }">
          {{ error || message }}
        </div>
        <div class="subject-manager">
          <article v-for="subject in rows" :key="subject.id" class="subject-editor">
            <span class="subject-swatch" :style="{ background: subject.color }"></span>
            <label>
              名称
              <input v-model.trim="subject.name" :disabled="subject.locked" />
            </label>
            <label>
              满分
              <input v-model="subject.fullScore" type="number" min="1" step="1" :disabled="subject.locked" />
            </label>
            <label>
              颜色
              <span class="color-field">
                <input v-model="subject.color" type="color" />
                <input v-model.trim="subject.color" />
              </span>
            </label>
            <div class="subject-editor-meta">
              <i>{{ subject.locked ? "默认" : "自定义" }}</i>
              <span>{{ subject.recordCount }} 条成绩 / {{ subject.mistakeCount }} 条错题</span>
            </div>
            <div class="subject-editor-actions">
              <button class="secondary-button compact" type="button" @click="save(subject)">
                <Save :size="15" />
                保存
              </button>
              <button
                class="icon-button danger"
                type="button"
                :disabled="subject.locked || subject.recordCount + subject.mistakeCount > 0"
                :title="subject.locked ? '默认科目不能删除' : '删除科目'"
                @click="remove(subject)"
              >
                <Trash2 :size="15" />
              </button>
            </div>
          </article>
        </div>
        <p class="form-tip">
          <Palette :size="16" />
          删除仅允许用于没有成绩和错题记录的自定义科目，避免历史数据找不到归属。
        </p>
      </div>
    </section>
  </div>
</template>
