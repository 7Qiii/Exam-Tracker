<script setup>
import { computed, reactive, ref, watch } from "vue";
import { Save } from "@lucide/vue";
import { useTrackerStore } from "../stores/tracker";

const emit = defineEmits(["saved"]);
const store = useTrackerStore();
const isSaving = ref(false);

const form = reactive({
  subjectId: "",
  paperName: "",
  score: "",
  fullScore: "",
  durationMinutes: "",
  date: new Date().toISOString().slice(0, 10),
  note: ""
});

const selectedSubject = computed(() => store.visibleSubjects.find((subject) => subject.id === form.subjectId));

watch(
  () => store.visibleSubjects,
  () => {
    if ((!form.subjectId || !selectedSubject.value) && store.visibleSubjects.length) {
      form.subjectId = store.visibleSubjects[0].id;
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
  if (form.durationMinutes !== "" && Number(form.durationMinutes) < 0) return;
  isSaving.value = true;
  try {
    await store.addRecord({ ...form });
    form.paperName = "";
    form.score = "";
    form.durationMinutes = "";
    form.note = "";
    form.date = new Date().toISOString().slice(0, 10);
    form.fullScore = selectedSubject.value?.fullScore || "";
    emit("saved");
  } catch (error) {
    store.notify(error.message || "成绩保存失败。", "error", 6000);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <form class="form-grid" @submit.prevent="submit">
    <label>
      科目
      <select v-model="form.subjectId" required>
        <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
      </select>
    </label>
    <label>
      试卷名称
      <input v-model.trim="form.paperName" required />
    </label>
    <div class="form-row two">
      <label>
        得分
        <input v-model="form.score" type="number" min="0" step="0.5" required />
      </label>
      <label>
        满分
        <input v-model="form.fullScore" type="number" min="1" step="1" required />
      </label>
    </div>
    <div class="form-row two">
      <label>
        用时（分钟）
        <input v-model="form.durationMinutes" type="number" min="0" step="1" />
      </label>
      <label>
        日期
        <input v-model="form.date" type="date" required />
      </label>
    </div>
    <label>
      复盘备注
      <textarea v-model.trim="form.note" rows="3"></textarea>
    </label>
    <button class="primary-button" type="submit" :disabled="isSaving">
      <Save :size="17" />
      {{ isSaving ? "保存中..." : "保存成绩" }}
    </button>
  </form>
</template>
