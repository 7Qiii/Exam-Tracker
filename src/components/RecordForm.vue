<script setup>
import { computed, reactive, ref, useId, watch } from "vue";
import { Save } from "@lucide/vue";
import { composeDuration, normalizeDurationMinutes, splitDurationMinutes } from "../utils/recordDisplay";
import { useUnsavedFields } from "../composables/useUnsavedChanges";
import { useTrackerStore } from "../stores/tracker";

const props = defineProps({
  record: { type: Object, default: null }
});
const emit = defineEmits(["saved"]);
const store = useTrackerStore();
const isSaving = ref(false);
const formError = ref("");

const paperVariantOptions = [
  { value: "true", label: "真题", hint: "历年真题、成套回顾" },
  { value: "mock", label: "模拟卷", hint: "模考、套卷训练" }
];

const form = reactive({
  subjectId: "",
  recordType: "paper",
  paperVariant: "",
  paperName: "",
  exerciseBookName: "",
  exercisePage: "",
  exerciseQuestion: "",
  score: "",
  fullScore: "",
  durationMinutes: "",
  date: new Date().toISOString().slice(0, 10),
  note: ""
});

/* ------------------------------------------------------------------ *
 * 「填了一半」保护
 *
 * 这个表单出现在三个地方（首页内联、成绩列表内联面板、成绩详情编辑），
 * 每一处都能在没保存的情况下被关掉 —— 点「收起录入」、点面板的关闭按钮、
 * 点「科目」换页。实测过三条路径都是**静默丢弃**，填过的内容一声不响就没了。
 *
 * 只列用户真正会输入的字段。科目、满分、卷型、日期都是自动填的
 * （科目取第一个可见科目、满分跟着科目、日期默认今天），算进去的话
 * 表单一打开就是「脏」的 —— 见 composables/useUnsavedChanges.js 里的说明。
 * ------------------------------------------------------------------ */
const { markPrefill, resetDirty } = useUnsavedFields(form, [
  "paperName",
  "exerciseBookName",
  "exercisePage",
  "exerciseQuestion",
  "score",
  "durationMinutes",
  "note"
]);

/* ------------------------------------------------------------------ *
 * 用时：拆成「小时 + 分钟」
 *
 * 原来是一个「用时（分钟）」的数字框，但全站都把这个值显示成
 * 「1 小时 30 分钟」（仪表盘、记录详情、导出、热力图都是）。
 * 也就是同一件事在界面上有两套单位：看到的是小时，要填的是分钟。
 * 用户每录一条都得在脑子里换算一次；这个字段又是选填的，
 * 换算的麻烦就直接变成了「算了不填」。
 *
 * 拆成两个框之后不用换算了，而且进位是自动的：分钟填 90 会折成 1 小时 30 分。
 *
 * 存储格式没有变 —— 仍然是 form.durationMinutes 的整数分钟。
 * 所以 store、导出、统计口径、以及别处读这个字段的地方全都不用动。
 * 拆分/合成的规则放在 utils/recordDisplay.js，和显示用的 formatDuration 同一处，
 * 免得「输入怎么理解」和「显示怎么理解」哪天走岔。
 * ------------------------------------------------------------------ */

const durationPresets = [
  { minutes: 45, label: "45 分" },
  { minutes: 60, label: "1 时" },
  { minutes: 90, label: "1.5 时" },
  { minutes: 120, label: "2 时" },
  { minutes: 150, label: "2.5 时" },
  { minutes: 180, label: "3 时" }
];

const durationHours = computed({
  get: () => splitDurationMinutes(form.durationMinutes).hours,
  set: (value) => {
    form.durationMinutes = composeDuration(value, durationMinutesPart.value);
  }
});

const durationMinutesPart = computed({
  get: () => splitDurationMinutes(form.durationMinutes).minutes,
  set: (value) => {
    form.durationMinutes = composeDuration(durationHours.value, value);
  }
});

function isDurationPresetActive(minutes) {
  return normalizeDurationMinutes(form.durationMinutes) === minutes;
}

/** 再点一次已选中的预设就取消，避免选错了还得手动清空两个框。 */
function applyDurationPreset(minutes) {
  form.durationMinutes = isDurationPresetActive(minutes) ? "" : minutes;
}

/** 给「用时」这一组控件的标题用，避免同一页出现重复 id。 */
const durationLabelId = useId();

const selectedSubject = computed(() => store.visibleSubjects.find((subject) => subject.id === form.subjectId));
const isEditing = computed(() => Boolean(props.record));
const isComposite = computed(() => form.recordType === "composite");
const isMathSubject = computed(() => selectedSubject.value?.id === "math1");
const isMathPaper = computed(() => isMathSubject.value && form.recordType === "paper" && !isComposite.value);
const exerciseBooks = computed(() => {
  const books = store.records
    .filter((record) => record.subjectId === "math1" && record.recordType === "exercise" && record.exerciseBookName)
    .map((record) => record.exerciseBookName.trim())
    .filter(Boolean);
  return [...new Set(books)].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
});

watch(
  () => [store.visibleSubjects, props.record],
  () => {
    if (props.record) {
      form.subjectId = props.record.subjectId || "";
      form.recordType = props.record.recordType || "paper";
      form.paperVariant = normalizePaperVariant(props.record.paperVariant, props.record.paperName);
      form.paperName = props.record.paperName || "";
      form.exerciseBookName = props.record.exerciseBookName || "";
      form.exercisePage = props.record.exercisePage || "";
      form.exerciseQuestion = props.record.exerciseQuestion || "";
      form.score = props.record.score ?? "";
      form.fullScore = props.record.fullScore ?? "";
      form.durationMinutes = props.record.durationMinutes ?? "";
      form.date = props.record.date || new Date().toISOString().slice(0, 10);
      form.note = store.displayRecordNote(props.record) || "";
      ensurePaperVariant();
    } else {
      if ((!form.subjectId || !selectedSubject.value) && store.visibleSubjects.length) {
        form.subjectId = store.visibleSubjects[0].id;
      }
      ensurePaperVariant();
    }
    // 自动填充结束 —— 此刻的样子就是「用户还没动过」的基线。
    // 科目表是异步来的，这个 watcher 之后还会再跑一次；markPrefill 内部
    // 只在表单还没脏的时候才挪基线，所以不会盖掉用户已经输入的内容。
    markPrefill();
  },
  { immediate: true }
);

watch(
  () => form.subjectId,
  () => {
    if (selectedSubject.value && !props.record) {
      form.fullScore = selectedSubject.value.fullScore;
    }
    if (!isMathSubject.value && form.recordType === "exercise") {
      form.recordType = "paper";
      form.exerciseBookName = "";
      form.exercisePage = "";
      form.exerciseQuestion = "";
    }
    ensurePaperVariant();
  },
  { immediate: true }
);

watch(
  () => form.recordType,
  () => {
    if (form.recordType !== "exercise") {
      form.exerciseBookName = "";
      form.exercisePage = "";
      form.exerciseQuestion = "";
    }
    ensurePaperVariant();
  }
);

async function submit() {
  formError.value = "";
  if (Number(form.score) > Number(form.fullScore)) {
    formError.value = "得分不能高于满分。";
    return;
  }
  if (form.durationMinutes !== "" && Number(form.durationMinutes) < 0) {
    formError.value = "用时不能小于 0 分钟。";
    return;
  }
  if (form.recordType === "exercise" && !form.exerciseBookName.trim()) {
    formError.value = "请填写习题册名称。";
    return;
  }
  ensurePaperVariant();
  isSaving.value = true;
  try {
    if (props.record) {
      await store.updateRecord(props.record.id, {
        ...form,
        compositeSourceIds: props.record.compositeSourceIds || [],
        compositeSources: props.record.compositeSources || []
      });
    } else {
      await store.addRecord({ ...form });
      form.recordType = isMathSubject.value ? form.recordType : "paper";
      form.paperName = "";
      form.exercisePage = "";
      form.exerciseQuestion = "";
      form.score = "";
      form.durationMinutes = "";
      form.note = "";
      form.date = new Date().toISOString().slice(0, 10);
      form.fullScore = selectedSubject.value?.fullScore || "";
      ensurePaperVariant();
    }
    // 存完了就不算「未保存」了。父组件接下来会同步地把表单关掉并问一句
    // confirmDiscardChanges()，所以必须在 emit 之前重置（见 useUnsavedForm 里
    // flush: "sync" 那段说明）。
    resetDirty();
    emit("saved");
  } catch (error) {
    store.notify(error.message || "成绩保存失败。", "error", 6000);
  } finally {
    isSaving.value = false;
  }
}

function ensurePaperVariant() {
  if (isMathPaper.value) {
    form.paperVariant = normalizePaperVariant(form.paperVariant, form.paperName) || "true";
  } else {
    form.paperVariant = "";
  }
}

function normalizePaperVariant(value, paperName = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "true" || raw === "mock") return raw;
  const name = String(paperName || "").trim().toLowerCase();
  if (/mock|模拟|模考/.test(name)) return "mock";
  if (/真题|历年|历届/.test(name)) return "true";
  return "";
}
</script>

<template>
  <form class="form-grid record-form" @submit.prevent="submit">
    <div v-if="formError" class="inline-alert danger">{{ formError }}</div>
    <label>
      科目
      <select v-model="form.subjectId" required>
        <option v-for="subject in store.visibleSubjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
      </select>
    </label>
    <div v-if="isMathSubject && !isComposite" class="field-group">
      <span>记录类型</span>
      <div class="segmented">
        <button type="button" :class="{ active: form.recordType === 'paper' }" @click="form.recordType = 'paper'">试卷</button>
        <button type="button" :class="{ active: form.recordType === 'exercise' }" @click="form.recordType = 'exercise'">习题</button>
      </div>
    </div>
    <div v-if="isMathPaper" class="field-group paper-kind-field">
      <span>数一卷型</span>
      <div class="segmented paper-kind-segmented">
        <button
          v-for="option in paperVariantOptions"
          :key="option.value"
          type="button"
          :class="{ active: form.paperVariant === option.value }"
          :title="option.hint"
          @click="form.paperVariant = option.value"
        >
          {{ option.label }}
          <small>{{ option.hint }}</small>
        </button>
      </div>
    </div>
    <label v-if="form.recordType !== 'exercise'">
      {{ isComposite ? "合成成绩名称" : "试卷名称" }}
      <input v-model.trim="form.paperName" required />
    </label>
    <template v-else>
      <label>
        习题册名称
        <input v-model.trim="form.exerciseBookName" list="exercise-book-options" required />
        <datalist id="exercise-book-options">
          <option v-for="book in exerciseBooks" :key="book" :value="book" />
        </datalist>
      </label>
      <div class="form-row two">
        <label>
          页码
          <input v-model.trim="form.exercisePage" inputmode="numeric" />
        </label>
        <label>
          题号
          <input v-model.trim="form.exerciseQuestion" />
        </label>
      </div>
    </template>
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
      <div class="ds-field duration-field">
        <span :id="durationLabelId" class="ds-field-label">用时</span>
        <div class="duration-inputs" role="group" :aria-labelledby="durationLabelId">
          <span class="duration-part">
            <input v-model="durationHours" type="number" min="0" max="23" step="1" inputmode="numeric" placeholder="0" aria-label="用时（小时）" />
            <span class="duration-unit">小时</span>
          </span>
          <span class="duration-part">
            <input v-model="durationMinutesPart" type="number" min="0" max="59" step="5" inputmode="numeric" placeholder="0" aria-label="用时（分钟）" />
            <span class="duration-unit">分钟</span>
          </span>
        </div>
        <div class="segmented duration-presets" role="group" :aria-labelledby="durationLabelId">
          <button
            v-for="preset in durationPresets"
            :key="preset.minutes"
            type="button"
            :class="{ active: isDurationPresetActive(preset.minutes) }"
            :aria-pressed="isDurationPresetActive(preset.minutes)"
            @click="applyDurationPreset(preset.minutes)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>
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
      {{ isSaving ? "保存中..." : isEditing ? "保存修改" : "保存成绩" }}
    </button>
  </form>
</template>
