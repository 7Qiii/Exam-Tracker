import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./styles/main.css";
import "./styles/mistakes-refresh.css";
import "./styles/tablet.css";
// design-system.css 必须最后加载：它定义全局 token，并用同一批类名覆盖前面的样式，
// 是整站视觉的最终裁决层（详见文件头注释）。
import "./styles/design-system.css";

createApp(App).use(createPinia()).use(router).mount("#app");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
