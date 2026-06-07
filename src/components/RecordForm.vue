<script setup>
import { computed, reactive, watch } from "vue";
import { Save } from "@lucide/vue";
import { useTrackerStore } from "../stores/tracker";

const emit = defineEmits(["saved"]);
const store = useTrackerStore();

const form = reactive({
  subjectId: "",
  paperName: "",
  score: "",
  fullScore: "",
  date: new Date().toISOString().slice(0, 10),
  note: ""
});

const selectedSubject = computed(() => store.subjects.find((subject) => subject.id === form.subjectId));

watch(
  () => store.subjects,
  () => {
    if (!form.subjectId && store.subjects.length) {
      form.subjectId = store.subjects[0].id;
    }
  },
  { immediate: true }
);

watch(
  () => form.subjectId,
  () => {
    if (selectedSubject.value) {
      form.fullScore = selectedSubject.value.fullScore;
    }
  },
  { immediate: true }
);

async function submit() {
  if (Number(form.score) > Number(form.fullScore)) return;
  await store.addRecord({ ...form });
  form.paperName = "";
  form.score = "";
  form.note = "";
  form.date = new Date().toISOString().slice(0, 10);
  form.fullScore = selectedSubject.value?.fullScore || "";
  emit("saved");
}
</script>

<template>
  <form class="form-grid" @submit.prevent="submit">
    <label>
      科目
      <select v-model="form.subjectId" required>
        <option v-for="subject in store.subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
      </select>
    </label>
    <label>
      试卷名称
      <input v-model.trim="form.paperName" required placeholder="例如：408 真题模拟 01" />
    </label>
    <div class="form-row">
      <label>
        得分
        <input v-model="form.score" type="number" min="0" step="0.5" required />
      </label>
      <label>
        满分
        <input v-model="form.fullScore" type="number" min="1" step="1" required />
      </label>
      <label>
        日期
        <input v-model="form.date" type="date" required />
      </label>
    </div>
    <label>
      复盘备注
      <textarea v-model.trim="form.note" rows="3" placeholder="这套卷暴露了什么？下次先补哪里？"></textarea>
    </label>
    <button class="primary-button" type="submit">
      <Save :size="17" />
      保存成绩
    </button>
  </form>
</template>
