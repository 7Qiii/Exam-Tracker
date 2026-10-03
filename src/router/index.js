import { createRouter, createWebHashHistory } from "vue-router";
import DashboardPage from "../pages/DashboardPage.vue";
import RecordsPage from "../pages/RecordsPage.vue";
import RecordDetailPage from "../pages/RecordDetailPage.vue";
import MistakesPage from "../pages/MistakesPage.vue";
import MistakeDetailPage from "../pages/MistakeDetailPage.vue";
import LoginPage from "../pages/LoginPage.vue";
import SubjectsPage from "../pages/SubjectsPage.vue";
import BackupPage from "../pages/BackupPage.vue";

const router = createRouter({
  history: createWebHashHistory(),
  /**
   * 切页面时的滚动位置。
   *
   * 不写这一段的话，vue-router 不会动滚动位置，而 hash 路由又不会触发浏览器
   * 的默认置顶 —— 结果是新页面「继承」上一页的滚动位置：在成绩列表翻到一半
   * 点「科目」，会直接落在科目页的中段，看着像页面坏了。
   *
   * savedPosition 是浏览器前进/后退时 vue-router 记下的位置：返回列表时要
   * 恢复它，否则用户翻到一半点进详情、退回来又得重新翻。
   * 两种情况必须分开处理，只写 return { top: 0 } 会把「返回」也一并重置掉。
   *
   * 第一行的「同一个 fullPath」是给弹窗用的：弹窗打开时会往历史里压一条同地址
   * 的记录，好让手机的返回手势去关弹窗（见 composables/useDialogA11y.js）。
   * 那条记录被弹掉时地址没变，但 vue-router 仍可能来问滚动位置。
   *
   * 实测过：Chrome 里不写这一行也不会跳（浏览器的 scrollRestoration 默认会把这
   * 条同地址记录的滚动位置还原回来）。留着是为了**不依赖浏览器的默认行为** ——
   * iOS Safari 在这块的做法和 Chrome 不一样，而 iPad 正是目标设备之一。
   * 语义上也更准确：没换页就别动滚动。
   */
  scrollBehavior(to, from, savedPosition) {
    if (to.fullPath === from.fullPath) return false;
    if (savedPosition) return savedPosition;
    return { top: 0, left: 0 };
  },
  routes: [
    { path: "/", name: "dashboard", component: DashboardPage },
    { path: "/login", name: "login", component: LoginPage },
    { path: "/records", name: "records", component: RecordsPage },
    { path: "/records/:id", name: "record-detail", component: RecordDetailPage },
    { path: "/mistakes", name: "mistakes", component: MistakesPage },
    { path: "/mistakes/:id", name: "mistake-detail", component: MistakeDetailPage },
    { path: "/subjects", name: "subjects", component: SubjectsPage },
    { path: "/backup", name: "backup", component: BackupPage }
  ]
});

export default router;
