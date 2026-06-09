<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
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
const router = useRouter();
const isSidebarOpen = ref(false);
const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const globalSearch = ref("");
const isGlobalSearchOpen = ref(false);

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
  if (store.lastSyncedAt) return `${store.deviceName} · ${store.autoSyncState} · 最后同步：${new Date(store.lastSyncedAt).toLocaleString("zh-CN")}`;
  return store.user ? "可手动同步云端数据" : "登录后开启多设备同步";
});
const globalSearchResults = computed(() => {
  const keyword = normalizeSearch(globalSearch.value);
  if (!keyword) return [];
  const recordResults = store.records
    .filter((record) => {
      const haystack = normalizeSearch([record.paperName, record.note, store.subjectName(record.subjectId), record.score, record.fullScore, record.date].join(" "));
      return haystack.includes(keyword);
    })
    .slice(0, 4)
    .map((record) => ({
      id: `record-${record.id}`,
      type: "成绩",
      title: record.paperName,
      meta: `${store.subjectName(record.subjectId)} · ${record.score}/${record.fullScore}`,
      to: `/records/${record.id}`
    }));
  const mistakeResults = store.mistakes
    .filter((mistake) => {
      const haystack = normalizeSearch([mistake.title, mistake.knowledgePoint, mistake.analysis, store.subjectName(mistake.subjectId)].join(" "));
      return haystack.includes(keyword);
    })
    .slice(0, 4)
    .map((mistake) => ({
      id: `mistake-${mistake.id}`,
      type: "错题",
      title: mistake.title,
      meta: `${store.subjectName(mistake.subjectId)} · ${mistake.knowledgePoint || "未分类"}`,
      to: `/mistakes/${mistake.id}`
    }));
  return [...recordResults, ...mistakeResults].slice(0, 6);
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

function normalizeSearch(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function openGlobalResult(item = globalSearchResults.value[0]) {
  if (!item) return;
  router.push(item.to);
  globalSearch.value = "";
  isGlobalSearchOpen.value = false;
}

watch(
  () => route.fullPath,
  () => {
    closeSidebar();
    isGlobalSearchOpen.value = false;
  }
);

function updateOnlineState() {
  isOnline.value = navigator.onLine;
  store.notify(isOnline.value ? "网络已恢复。" : "当前离线，操作会先保存在本地。", isOnline.value ? "success" : "info");
}

onMounted(() => {
  store.load();
  window.addEventListener("online", updateOnlineState);
  window.addEventListener("offline", updateOnlineState);
});

onBeforeUnmount(() => {
  window.removeEventListener("online", updateOnlineState);
  window.removeEventListener("offline", updateOnlineState);
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
      <div v-if="!isOnline" class="offline-banner">当前离线，新增内容会先保存在本地。</div>
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
          <form class="search-box global-search" @submit.prevent="openGlobalResult()">
            <Search :size="17" />
            <input
              v-model="globalSearch"
              type="search"
              @focus="isGlobalSearchOpen = true"
              @input="isGlobalSearchOpen = true"
            />
            <div v-if="isGlobalSearchOpen && globalSearch" class="global-search-popover">
              <button
                v-for="item in globalSearchResults"
                :key="item.id"
                type="button"
                class="global-search-result"
                @mousedown.prevent="openGlobalResult(item)"
              >
                <strong>{{ item.title }}</strong>
                <span>{{ item.type }} · {{ item.meta }}</span>
              </button>
              <div v-if="!globalSearchResults.length" class="global-search-empty">没有匹配结果</div>
            </div>
          </form>
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

    <nav class="bottom-nav" aria-label="移动端导航">
      <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="bottom-nav-item">
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="toast-stack" aria-live="polite">
      <button
        v-for="item in store.notifications"
        :key="item.id"
        class="toast"
        :class="item.type"
        :style="{ '--toast-duration': `${item.timeout || 3200}ms` }"
        type="button"
        @click="store.removeNotification(item.id)"
      >
        {{ item.message }}
      </button>
    </div>
  </div>
</template>
