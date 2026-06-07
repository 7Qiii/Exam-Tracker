<script setup>
import { computed, onMounted } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Cloud,
  Database,
  Home,
  LogIn,
  RefreshCw,
  Search,
  Settings,
  Upload
} from "@lucide/vue";
import { useTrackerStore } from "./stores/tracker";

const store = useTrackerStore();
const route = useRoute();

const navItems = [
  { to: "/", label: "Overview", icon: Home },
  { to: "/records", label: "Scores", icon: ClipboardList },
  { to: "/mistakes", label: "Review Bank", icon: BookOpenCheck },
  { to: "/login", label: "Sync", icon: LogIn },
  { to: "/subjects", label: "Subjects", icon: Settings },
  { to: "/backup", label: "Vault", icon: Database }
];

const pageTitle = computed(() => {
  const matched = navItems.find((item) => item.to === route.path);
  return matched?.label || "Detail";
});

const latestRecord = computed(() =>
  [...store.records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0]
);
const sidebarScore = computed(() => (latestRecord.value ? `${latestRecord.value.score}/${latestRecord.value.fullScore}` : "--"));
const sidebarHint = computed(() => (latestRecord.value ? latestRecord.value.paperName : "还没有成绩记录"));
const userInitial = computed(() => (store.user?.email || "未").slice(0, 1).toUpperCase());
const syncLabel = computed(() => (store.user ? store.user.email : "未登录"));
const syncStateText = computed(() => {
  if (store.syncError) return "同步失败";
  if (store.user) return store.lastSyncedAt ? "已同步" : "已登录";
  return store.syncMode === "local" ? "本地模式" : "未登录";
});
const syncStateTitle = computed(() => {
  if (store.syncError) return store.syncError;
  if (store.lastSyncedAt) return `最后同步：${new Date(store.lastSyncedAt).toLocaleString("zh-CN")}`;
  return store.user ? "可手动同步云端数据" : "登录后开启多设备同步";
});

async function syncNow() {
  try {
    await store.syncNow();
  } catch (error) {
    store.syncError = error.message || "同步失败";
  }
}

onMounted(() => {
  store.load();
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">ET</span>
        <span>
          <strong>Exam Tracker</strong>
        </span>
      </RouterLink>

      <nav class="nav-list" aria-label="主导航">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-item" :aria-label="item.label">
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-card">
        <div class="mini-icon"><BarChart3 :size="18" /></div>
        <strong>{{ sidebarScore }}</strong>
        <span>{{ sidebarHint }}</span>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">Exam Intelligence Console</p>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="topbar-tools">
          <div class="search-box">
            <Search :size="17" />
            <span>按科目、知识点、卷名检索</span>
          </div>
          <RouterLink class="account-pill" to="/login" :title="store.user ? '账号与同步' : '登录同步'">
            <span class="avatar-dot" :class="{ online: store.user }">{{ userInitial }}</span>
            <span>{{ syncLabel }}</span>
            <Cloud :size="17" />
          </RouterLink>
          <button
            class="sync-pill"
            :class="{ online: store.user && !store.syncError, danger: store.syncError }"
            type="button"
            :title="syncStateTitle"
            :disabled="store.isSyncing || !store.user"
            @click="syncNow"
          >
            <RefreshCw :size="15" :class="{ spinning: store.isSyncing }" />
            <span>{{ syncStateText }}</span>
          </button>
          <RouterLink class="ghost-button icon-only" to="/subjects" title="科目管理">
            <Settings :size="18" />
          </RouterLink>
        </div>
      </header>

      <main>
        <div v-if="!store.isReady" class="loading-panel">
          <Upload :size="22" />
          <span>正在加载本地学习档案...</span>
        </div>
        <RouterView v-else />
      </main>
    </div>
  </div>
</template>
