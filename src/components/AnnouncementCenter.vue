<script setup>
import { computed, ref } from "vue";
import { Bell, Megaphone, Sparkles, Timeline, X } from "@lucide/vue";

const isOpen = ref(false);
const activeTab = ref("timeline");

const updates = [
  {
    id: "paper-variant-sync",
    type: "feature",
    title: "数一卷型已支持跨设备同步",
    summary: "真题 / 模拟卷会写入云端字段，并带隐藏备注兜底，旧表结构也能还原。",
    time: "2026-08-13 23:20"
  },
  {
    id: "dark-record-form",
    type: "polish",
    title: "新增成绩暗色模式增强",
    summary: "重做分段按钮、输入框和字段标题对比度，跟随系统暗色也会生效。",
    time: "2026-08-13 23:18"
  },
  {
    id: "average-paper-filter",
    type: "feature",
    title: "首页均分支持数一真题 / 模拟卷切换",
    summary: "选择数一后，均分、最近成绩和图表会按卷型同步更新。",
    time: "2026-08-13 22:40"
  },
  {
    id: "restore-records",
    type: "feature",
    title: "成绩删除后 24 小时内可恢复",
    summary: "记录页新增最近删除入口，误删后可以在一天内找回。",
    time: "2026-08-13 21:30"
  }
];

const notices = [
  {
    id: "schema-paper-variant",
    title: "建议确认 Supabase 字段",
    summary: "如果新设备仍看不到卷型，请在 Supabase SQL Editor 执行 records.paper_variant 的 add column 语句。",
    time: "重要"
  },
  {
    id: "refresh-deploy",
    title: "部署后请刷新缓存",
    summary: "Vercel 部署完成后，iPad 上可下拉刷新或重新打开网页，确保载入最新 JS/CSS。",
    time: "提示"
  }
];

const currentItems = computed(() => (activeTab.value === "timeline" ? updates : notices));
const unreadCount = computed(() => updates.length);

function toggleOpen() {
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <div class="announcement-center">
    <button class="ghost-button icon-only announcement-trigger" type="button" title="系统公告" aria-label="系统公告" @click="toggleOpen">
      <Bell :size="18" />
      <span v-if="unreadCount" class="notification-dot">{{ unreadCount }}</span>
    </button>

    <div v-if="isOpen" class="announcement-popover">
      <div class="announcement-head">
        <div>
          <p>系统公告</p>
          <span>最新平台更新和通知</span>
        </div>
        <button class="icon-button compact" type="button" aria-label="关闭公告" @click="isOpen = false">
          <X :size="15" />
        </button>
      </div>

      <div class="announcement-tabs" role="tablist" aria-label="公告分类">
        <button type="button" :class="{ active: activeTab === 'notices' }" @click="activeTab = 'notices'">
          <Megaphone :size="15" />
          通知
        </button>
        <button type="button" :class="{ active: activeTab === 'timeline' }" @click="activeTab = 'timeline'">
          <Timeline :size="15" />
          时间线
        </button>
      </div>

      <div class="announcement-list">
        <article v-for="item in currentItems" :key="item.id" class="announcement-item" :class="item.type">
          <i></i>
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.summary }}</p>
            <span>{{ item.time }}</span>
          </div>
        </article>
      </div>

      <div class="announcement-foot">
        <Sparkles :size="14" />
        <span>以后每次功能更新都会放在这里。</span>
      </div>
    </div>
  </div>
</template>
