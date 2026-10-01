# 提示词：精简首页 + 修好导出入口 + 全按钮功能验证

> 直接复制下面「=== 提示词开始 ===」到「=== 提示词结束 ===」之间的全部内容。

---

=== 提示词开始 ===

## 项目背景

- 路径：`G:\11408App`，Vue 3 + Vite，本地优先（Dexie/IndexedDB），Supabase 可选云同步
- 线上：https://exam-tracker-gray.vercel.app/#/ （Vercel 已接 GitHub 自动部署，push 后约 2 分钟生效）
- 已有设计系统，**必须复用，不要另写一套样式**：
  - `src/styles/design-system.css`（token + 基础组件覆盖，在 `main.js` 最后加载）
  - `src/components/ds/`：`DsPageHeader` `DsStatCard` `DsSection` `DsFilterBar` `DsEmptyState` `DsLoadingState` `DsRecordCard` `DsModal` `DsBadge` `DsConfirmHost`
- 路由：`/` `/records` `/records/:id` `/mistakes` `/mistakes/:id` `/subjects` `/backup` `/login`

## 任务一：精简首页（`src/pages/DashboardPage.vue`）

首页现在有 10 个区块，太长。当前顺序：

1. `ds-welcome` 欢迎区（问候语 + 「记录成绩 / 复习错题」按钮）
2. `ds-task-list` 今日待办（到期错题 / 今天是否已记录 / 备份时效）
3. `dashboard-filter-row` 科目 + 时间范围筛选（作用于整页）
4. `ds-stats` 四张指标卡（成绩记录 / 平均得分率 / 错题待复盘 / 连续学习）
5. 快速录入（可折叠的 `RecordForm`）
6. **`DsSection` 科目掌握度**（四张科目卡，每张含得分率进度条 + 五态分布条）
7. `ContributionHeatmap` 学习贡献热力图（最近 90 天彩色方格）
8. `DsSection` 提醒 + `DsSection` 快捷入口
9. `ScoreCharts`（分数趋势 + 各科最近成绩）
10. `DsSection` 最近成绩
11. 底部 footnote

要求：

1. **把第 6 块「科目掌握度」整块从首页移走**，落到 `/subjects`（科目管理页）顶部，标题改为「掌握概览」，复用现有的 `subjectStats` 计算逻辑（`countStates` / `MISTAKE_STATES` 一起搬过去）。
   首页原位置只留一句轻量入口，例如「各科掌握情况见 科目管理 →」，用 `.text-link` 样式，不要占一块卡片。
2. 首页整体压缩到 **6 块以内**，建议保留顺序：欢迎区（与今日待办合并为一块）→ 顶部筛选 → 四张指标卡 → 最近成绩 → 分数趋势 → 提醒 + 快捷入口。
   「最近成绩」是用户的主线（成绩记录是主要用途），要提到「分数趋势」前面。
3. 第 7 块「学习贡献热力图」占用屏高很大且与「看成绩」主线关系较弱：改成**默认折叠**，标题行可点开，展开状态记到 `localStorage`。
4. 不要为了"看起来满"而堆砌。删掉的模块如果还有价值，就移动到二级页（如 `/records`），不要直接丢弃数据逻辑。

## 任务二：把成绩导出放到首页

现状：成绩导出（Excel）**只**在 `src/pages/RecordsPage.vue` 顶部 `DsPageHeader` 的 actions 里，按钮文案是「导出 Excel」。
而首页「快捷入口」里只有「导出 JSON」和「合并导入」——那是**整站数据备份**（在 `/backup` 页），和成绩导出不是一回事，名字又接近，用户会找不到成绩导出。

要求：

1. 在首页「快捷入口」里**新增**一个「导出成绩 Excel」入口，点击后直接导出当前全部成绩（复用 `src/services/excelExport.js` 的 `exportRecordsToExcel`，与成绩页保持一致的口径）。
2. 同时把原有两个入口的文案改清楚，避免混淆：`导出 JSON` → `备份全部数据`，`合并导入` → `恢复备份`。
3. 首页新增的导出按钮要给出成功/失败反馈（用 `store.notify`，与成绩页一致）。
4. 保持成绩页顶部的导出按钮不变（两处都能到达）。

## 任务三：逐页点击验证每个按钮

已核查：全站 **138 个 `<button>` 全部绑定了事件处理**，也没有「敬请期待 / 开发中 / 暂不支持」这类空壳文案。
所以**不要**再去找"没绑事件的按钮"，重点验证「点了之后行为是否正确」。

要求：

1. 写一个自动化点击脚本（参考 `scripts/verify-ui.mjs`：它已用托管工作区的 `playwright-core` + 本机 Chrome/Edge，起静态服务器逐页检查，截图写到 `.verify/`）。
   新脚本逐页遍历 `/`、`/records`、`/records/:id`、`/mistakes`、`/mistakes/:id`、`/subjects`、`/backup`、`/login`，
   **点击页面上每一个可见且未被禁用的按钮**，每次点击后记录：
   - 是否抛出 console error / pageerror
   - 是否产生了可见变化（DOM 变化、Toast 出现、路由变化、弹窗打开）
   - 点击后是否让页面进入异常状态（元素消失、布局溢出、按钮永久禁用）
2. 每点完一个按钮要**恢复初始状态**（关闭弹窗、清空输入、返回原路由），避免污染后续用例。
3. 输出一份清单：`按钮位置 | 文案 | 点击结果（正常 / 无反应 / 报错 / 状态异常）`。
4. 对「无反应」和「报错」的逐条定位原因并修复；对「危险操作」（删除、清空）跳过真实点击，只验证确认弹窗能正常打开与取消。
5. 不要伪造结论。测不了的要明说测不了。

## 任务四：成绩记录是主线，优先照顾

用户明确表示「成绩记录是我使用的主要部分」。据此：

1. 首页「最近成绩」要更靠前、条数给足（现在 6 条），并保留「查看全部」入口。
2. `/records` 页的首屏要能直接看到：筛选栏 + 成绩列表，不要让统计卡把列表挤到首屏之外。
3. 桌面端表格、移动端卡片两种形态都要能顺畅扫读。

## 约束

- 不要改动数据模型（`subject` / `record` / `mistake` / `image` 的字段与 Dexie 版本）
- 不要删除任何现有功能，只做移动与精简
- 新增 UI 一律复用 `ds/` 组件，不要新增硬编码样式
- 视觉保持现状：浅灰底 + 白色模块 + 轻边框，圆角不超过 `--r-lg`，不做大渐变、发光、装饰性圆球

## 验收标准

```bash
npm run build                    # 必须通过
node scripts/check-bindings.mjs  # 模板绑定静态检查，必须全绿
node scripts/verify-ui.mjs       # 8 路由 × 6 尺寸 = 48 组合，必须 0 问题
```

尺寸覆盖：1440×900、1280×720、1024×768、768×1024、390×844、375×667。
另外附上按钮点击清单，以及首页精简前后的区块数量对比。

完成后提交并 push 到 `origin/main`（Vercel 会自动部署，约 2 分钟后线上生效，请自行确认）。

=== 提示词结束 ===

---

## 附：我这次已经查证过的事实（写进提示词是为了让执行方不用重复踩坑）

| 结论 | 依据 |
| --- | --- |
| 全站 138 个 `<button>` 都有事件处理 | 正则扫描所有 `.vue` 模板，逐个检查是否含 `@click` / `@submit` 等 |
| 没有占位空壳文案 | 全库搜 `敬请期待 / 开发中 / 暂未开放 / 即将上线 / TODO / 暂不支持`，只命中「待复盘」（这是错题状态枚举，不是占位） |
| 导出成绩只存在于成绩页 | `grep -rn "导出" src` → `RecordsPage.vue:1086` 是唯一的成绩导出按钮 |
| 首页快捷入口会误导 | `DashboardPage.vue:666` 是「导出 JSON」（整站备份），与成绩导出同名混淆 |
| 首页有 10 个区块 | 读 `DashboardPage.vue` 模板统计 |
| 已有的验证基建 | `scripts/verify-ui.mjs`（48 组合）、`check-bindings.mjs`、`probe-overflow.mjs`、`prune-css.mjs` |
