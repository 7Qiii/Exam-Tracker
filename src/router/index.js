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
