<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Cloud,
  Database,
  Home,
  LogIn,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Upload,
  X
} from "@lucide/vue";
import { useTrackerStore } from "./stores/tracker";

const store = useTrackerStore();
const route = useRoute();
const isSidebarOpen = ref(false);

const navItems = [
  { to: "/", label: "总览", title: "Overview", icon: Home },
  { to: "/records", label: "成绩", title: "Scores", icon: ClipboardList },
  { to: "/mistakes", label: "错题", title: "Review Bank", icon: BookOpenCheck },
  { to: "/login", label: "同步", title: "Sync", icon: LogIn },
  { to: "/subjects", label: "科目", title: "Subjects", icon: Settings },
  { to: "/backup", label: "备份", title: "Vault", icon: Database }
];

const pageTitle = computed(() => {
  const matched = navItems.find((item) => item.to === route.path);
  return matched?.title || "Detail";
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
    store.notify(store.syncError, "error", 6000);
  }
}

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value;
}

function closeSidebar() {
  isSidebarOpen.value = false;
}

watch(
  () => route.fullPath,
  () => {
    closeSidebar();
  }
);

onMounted(() => {
  store.load();
});
</script>

<template>
  <div class="app-shell">
    <button
      v-if="isSidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航"
      @click="closeSidebar"
    />

    <aside class="sidebar" :class="{ open: isSidebarOpen }">
      <div class="sidebar-head">
        <RouterLink class="brand" to="/" @click="closeSidebar">
          <span class="brand-mark">ET</span>
          <span>
            <strong>Exam Tracker</strong>
          </span>
        </RouterLink>
        <button class="drawer-close" type="button" aria-label="关闭导航" @click="closeSidebar">
          <X :size="18" />
        </button>
      </div>

      <RouterLink class="brand desktop-brand" to="/">
        <span class="brand-mark">ET</span>
        <span>
          <strong>Exam Tracker</strong>
        </span>
      </RouterLink>

      <nav class="nav-list" aria-label="主导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :aria-label="item.label"
          @click="closeSidebar"
        >
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
        <div class="topbar-title">
          <button class="menu-button" type="button" aria-label="打开导航" @click="toggleSidebar">
            <Menu :size="20" />
          </button>
          <div>
            <p class="eyebrow">Exam Intelligence Console</p>
            <h1>{{ pageTitle }}</h1>
          </div>
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

    <div class="toast-stack" aria-live="polite">
      <button
        v-for="item in store.notifications"
        :key="item.id"
        class="toast"
        :class="item.type"
        type="button"
        @click="store.removeNotification(item.id)"
      >
        {{ item.message }}
      </button>
    </div>
  </div>
</template>
