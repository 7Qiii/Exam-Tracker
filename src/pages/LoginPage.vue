<script setup>
import { Cloud, Database, KeyRound } from "@lucide/vue";
</script>

<template>
  <div class="login-layout">
    <section class="login-panel">
      <div class="brand-row">
        <span class="brand-mark">ET</span>
        <strong>Exam Tracker Console</strong>
      </div>
      <h2>同步入口预留</h2>
      <p>当前版本以本地 IndexedDB 为主，成绩、错题和图片都能离线保存。后续可在这里接入 Vercel Blob 或账号体系。</p>
      <label>
        同步密码
        <div class="input-with-icon">
          <KeyRound :size="17" />
          <input placeholder="输入后开启云端同步" />
        </div>
      </label>
      <button class="primary-button" type="button"><Cloud :size="17" />连接云端</button>
      <div class="login-note">
        <Database :size="17" />
        <span>图片跨设备同步建议单独接 Blob 上传 API，避免把大图塞进状态 JSON。</span>
      </div>
    </section>
  </div>
</template>
