<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { Cloud, Database, KeyRound, LogOut, Mail, UserPlus } from "@lucide/vue";
import { useTrackerStore } from "../stores/tracker";
import { isSupabaseConfigured } from "../services/supabase";

const store = useTrackerStore();
const mode = ref("login");
const isBusy = ref(false);
const message = ref("");
const form = reactive({
  email: "",
  password: ""
});

onMounted(() => {
  const url = new URL(window.location.href);
  if (url.searchParams.get("confirmed") === "1") {
    message.value = "邮箱已确认，现在可以登录并开启同步。";
    window.history.replaceState({}, "", "/login");
  }
});

const statusText = computed(() => {
  if (!isSupabaseConfigured) return "还没有配置 Supabase 环境变量";
  if (store.user) return `已登录：${store.user.email}`;
  return "可登录 / 注册后开启多设备同步";
});

async function submit() {
  isBusy.value = true;
  message.value = "";
  try {
    if (mode.value === "login") {
      await store.login(form.email, form.password);
      message.value = "已登录并同步云端数据";
    } else {
      await store.register(form.email, form.password);
      message.value = "注册完成。如果 Supabase 开启邮件确认，请先查收验证邮件。";
    }
  } catch (error) {
    message.value = error.message || "账号操作失败";
  } finally {
    isBusy.value = false;
  }
}

async function logout() {
  await store.logout();
  message.value = "已退出登录，当前回到本地缓存模式";
}
</script>

<template>
  <div class="login-layout">
    <section class="login-panel">
      <div class="brand-row">
        <span class="brand-mark">ET</span>
        <strong>Exam Tracker Console</strong>
      </div>
      <h2>账号同步</h2>
      <p>Supabase 负责账号和成绩/错题数据，Cloudflare R2 负责错题图片。登录后手机、平板、电脑会读取同一份云端数据。</p>

      <div class="sync-state" :class="{ online: store.user }">
        <Database :size="18" />
        <span>{{ statusText }}</span>
      </div>

      <form v-if="!store.user" class="form-grid" @submit.prevent="submit">
        <label>
          邮箱
          <div class="input-with-icon">
            <Mail :size="17" />
            <input v-model.trim="form.email" type="email" required placeholder="you@example.com" />
          </div>
        </label>
        <label>
          密码
          <div class="input-with-icon">
            <KeyRound :size="17" />
            <input v-model="form.password" type="password" minlength="6" required placeholder="至少 6 位" />
          </div>
        </label>
        <div class="segmented">
          <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
          <button type="button" :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
        </div>
        <button class="primary-button" type="submit" :disabled="isBusy || !isSupabaseConfigured">
          <component :is="mode === 'login' ? Cloud : UserPlus" :size="17" />
          {{ mode === "login" ? "登录并同步" : "创建账号" }}
        </button>
      </form>

      <button v-else class="secondary-button" type="button" @click="logout">
        <LogOut :size="17" />
        退出登录
      </button>

      <p v-if="message" class="dialog-hint">{{ message }}</p>
      <div class="login-note">
        <Database :size="17" />
        <span>需要在 Vercel 配置 Supabase 和 R2 环境变量；未配置时应用会继续使用本地 IndexedDB。</span>
      </div>
    </section>
  </div>
</template>
