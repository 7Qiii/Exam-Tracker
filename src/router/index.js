import { createRouter, createWebHistory } from "vue-router";
import DashboardPage from "../pages/DashboardPage.vue";
import RecordsPage from "../pages/RecordsPage.vue";
import RecordDetailPage from "../pages/RecordDetailPage.vue";
import MistakesPage from "../pages/MistakesPage.vue";
import MistakeDetailPage from "../pages/MistakeDetailPage.vue";
import LoginPage from "../pages/LoginPage.vue";
import SubjectsPage from "../pages/SubjectsPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "dashboard", component: DashboardPage },
    { path: "/login", name: "login", component: LoginPage },
    { path: "/records", name: "records", component: RecordsPage },
    { path: "/records/:id", name: "record-detail", component: RecordDetailPage },
    { path: "/mistakes", name: "mistakes", component: MistakesPage },
    { path: "/mistakes/:id", name: "mistake-detail", component: MistakeDetailPage },
    { path: "/subjects", name: "subjects", component: SubjectsPage }
  ]
});

export default router;
