<script setup>
import { computed, reactive, ref } from "vue";
import { BookOpenCheck, ClipboardList, Eye, Layers, GripVertical, Palette, Plus, Save, Trash2 } from "@lucide/vue";
import { defaultSubjects, isDefaultSubject } from "../services/storage";
import { useConfirm } from "../composables/useConfirm";
import { useTrackerStore } from "../stores/tracker";
import DsEmptyState from "../components/ds/DsEmptyState.vue";
import DsPageHeader from "../components/ds/DsPageHeader.vue";
import DsSection from "../components/ds/DsSection.vue";
import DsStatCard from "../components/ds/DsStatCard.vue";

const store = useTrackerStore();
const { confirm } = useConfirm();
const message = ref("");
const error = ref("");
const draggingId = ref("");

const form = reactive({ name: "", fullScore: 100, color: "#177ddc" });
const defaultIds = new Set(defaultSubjects.map((subject) => subject.id));

const rows = computed(() =>
  store.subjects.map((subject) => ({
    ...subject,
    locked: defaultIds.has(subject.id),
    recordCount: store.records.filter((record) => record.subjectId === subject.id).length,
    mistakeCount: store.mistakes.filter((mistake) => mistake.subjectId === subject.id).length
  }))
);
const visibleCount = computed(() => rows.value.filter((subject) => !subject.hidden).length);

/* ------------------------------------------------------------------ *
 * 掌握概览
 * 原先放在首页，但首页太长、又和「看成绩」的主线抢位置，所以整体搬到这里。
 * 口径：全部记录（本页没有时间范围筛选），按练习次数排序。
 * ------------------------------------------------------------------ */

// 错题状态沿用数据里的取值，不重新定义枚举
const MISTAKE_STATES = [
  { key: "已掌握", label: "已掌握", color: "var(--state-mastered)" },
  { key: "已整理", label: "已整理", color: "var(--state-organized)" },
  { key: "不熟", label: "不熟", color: "var(--state-fuzzy)" },
  { key: "不会", label: "不会", color: "var(--state-unknown)" },
  { key: "待复盘", label: "待复盘", color: "var(--state-todo)" }
];

function countStates(list) {
  const result = MISTAKE_STATES.map((state) => ({ ...state, count: 0 }));
  const index = new Map(result.map((state) => [state.key, state]));
  list.forEach((mistake) => {
    const key = mistake.status || "待复盘";
    (index.get(key) || index.get("待复盘")).count += 1;
  });
  return result;
}

const masteryStats = computed(() =>
  rows.value
    .map((subject) => {
      const records = store.records.filter((record) => record.subjectId === subject.id);
      const mistakes = store.mistakes.filter((mistake) => mistake.subjectId === subject.id);
      const score = records.reduce((sum, record) => sum + Number(record.score || 0), 0);
      const fullScore = records.reduce((sum, record) => sum + Number(record.fullScore || 0), 0);
      const latest = [...records].sort(
        (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))
      )[0];
      return {
        ...subject,
        recordCount: records.length,
        mistakeCount: mistakes.length,
        pending: mistakes.filter((mistake) => (mistake.status || "待复盘") !== "已掌握").length,
        rate: fullScore ? Math.round((score / fullScore) * 100) : 0,
        average: records.length ? Math.round((score / records.length) * 10) / 10 : 0,
        latest,
        states: countStates(mistakes),
        total: mistakes.length
      };
    })
    .sort((a, b) => b.recordCount - a.recordCount || a.name.localeCompare(b.name, "zh-Hans-CN"))
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
    color: subject.color,
    hidden: subject.hidden
  });
  message.value = "科目已保存。";
}

async function moveSubject(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const ids = rows.value.map((subject) => subject.id);
  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, item);
  await store.reorderSubjects(ids);
  message.value = "科目顺序已更新。";
}

function onDragStart(subject) {
  draggingId.value = subject.id;
}

async function onDrop(subject) {
  await moveSubject(draggingId.value, subject.id);
  draggingId.value = "";
}

async function remove(subject) {
  error.value = "";
  message.value = "";
  if (isDefaultSubject(subject.id)) {
    error.value = "默认科目不能删除。";
    return;
  }
  const ok = await confirm({
    title: "删除这个科目？",
    message: `「${subject.name}」将从科目列表移除。已记录的成绩和错题会保留，但不再出现在筛选里。`,
    confirmText: "删除"
  });
  if (!ok) return;
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
    <DsPageHeader title="科目管理" description="默认科目按备考顺序排列，可拖拽、隐藏和编辑" />

    <!-- 掌握概览：原首页「科目掌握度」整块搬过来 -->
    <DsSection title="掌握概览" description="全部记录 · 按练习次数排序">
      <div v-if="masteryStats.length" class="ds-subject-grid">
        <article
          v-for="subject in masteryStats"
          :key="subject.id"
          class="ds-subject-card"
          :style="{ '--subject-color': subject.color || 'var(--blue)' }"
        >
          <div class="ds-subject-head">
            <p class="ds-subject-name"><i aria-hidden="true"></i>{{ subject.name }}</p>
            <span class="ds-subject-count">{{ subject.recordCount }} 次练习</span>
          </div>

          <div class="ds-meter">
            <div class="ds-meter-head">
              <strong>{{ subject.rate }}%</strong>
              <span>平均得分率</span>
            </div>
            <div class="ds-meter-track">
              <i :style="{ width: `${subject.rate}%`, background: subject.color || 'var(--blue)' }"></i>
            </div>
          </div>

          <div class="ds-subject-metrics">
            <div class="ds-subject-metric">
              <span>平均分</span>
              <strong>{{ subject.recordCount ? subject.average : "--" }}</strong>
            </div>
            <div class="ds-subject-metric">
              <span>最近一次</span>
              <strong>{{ subject.latest ? `${subject.latest.score}/${subject.latest.fullScore}` : "--" }}</strong>
            </div>
            <div class="ds-subject-metric">
              <span>错题</span>
              <strong>{{ subject.mistakeCount }}</strong>
            </div>
            <div class="ds-subject-metric">
              <span>待复盘</span>
              <strong>{{ subject.pending }}</strong>
            </div>
          </div>

          <div v-if="subject.total" class="ds-state-bar">
            <i
              v-for="state in subject.states"
              :key="state.key"
              :style="{ width: `${(state.count / subject.total) * 100}%`, background: state.color }"
              :title="`${state.label} ${state.count}`"
            ></i>
          </div>
          <div v-if="subject.total" class="ds-state-legend">
            <span v-for="state in subject.states" :key="state.key">
              <em :style="{ background: state.color }"></em>{{ state.label }} <b>{{ state.count }}</b>
            </span>
          </div>
          <p v-else class="ds-muted">还没有这个科目的错题记录。</p>
        </article>
      </div>

      <DsEmptyState
        v-else
        :icon="Layers"
        title="还没有可统计的科目"
        description="先在下面新增科目，成绩和错题才能归类统计。"
      />
    </DsSection>

    <section class="ds-stats">
      <DsStatCard label="总科目" :value="rows.length" unit="个" hint="当前全部配置" :icon="Layers" />
      <DsStatCard label="可见科目" :value="visibleCount" unit="个" hint="可用于新增与筛选" :icon="Eye" />
      <DsStatCard label="成绩关联" :value="store.records.length" unit="条" hint="历史成绩不会丢失" :icon="ClipboardList" />
      <DsStatCard label="错题关联" :value="store.mistakes.length" unit="条" hint="错题也会保留" :icon="BookOpenCheck" />
    </section>

    <section class="subjects-layout">
      <DsSection class="subject-create-panel" title="新增科目" description="支持自定义满分和颜色">
        <form class="subject-create-form" @submit.prevent="add">
          <label>
            科目名称
            <input v-model.trim="form.name" required />
          </label>
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
          <button class="primary-button" type="submit">
            <Plus :size="17" />
            新增科目
          </button>
        </form>
      </DsSection>

      <DsSection
        class="panel-wide"
        title="科目列表"
        :description="`${visibleCount} / ${rows.length} 个可见 · 拖拽可调整顺序`"
      >
        <div v-if="message || error" class="inline-alert" :class="{ danger: error }">
          {{ error || message }}
        </div>
        <div class="subject-manager">
          <article
            v-for="subject in rows"
            :key="subject.id"
            class="subject-editor"
            draggable="true"
            @dragstart="onDragStart(subject)"
            @dragover.prevent
            @drop.prevent="onDrop(subject)"
          >
            <span class="drag-handle" title="拖拽排序"><GripVertical :size="16" /></span>
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
            <label class="switch-row">
              <input v-model="subject.hidden" type="checkbox" />
              隐藏
            </label>
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
          拖拽可以调整所有科目的显示顺序；隐藏只影响新增和筛选入口，不会删除历史记录。
        </p>
      </DsSection>
    </section>
  </div>
</template>
