# 产品改造方案：Exam Tracker → 学习数据面板

> 参考站 `www.408os.cn` 仅用于**信息架构、布局逻辑与交互模式**参考。
> 不复制其品牌、Logo、文案、图片、源码，不做像素级复刻。

---

## 一、现状盘点

### 1.1 技术栈

| 项 | 现状 |
| --- | --- |
| 框架 | Vue 3.5（`<script setup>`）+ Vite 8 |
| 路由 | vue-router 4，**hash 模式**，8 条路由 |
| 状态 | Pinia（单 store `tracker`，1354 行） |
| 存储 | Dexie/IndexedDB 本地优先；Supabase 可选云同步 |
| 图表 | ECharts 6（按需 `import("echarts")`，IntersectionObserver 懒加载） |
| 图标 | `@lucide/vue` |
| 导出 | ExcelJS（动态 import） |
| 样式 | 纯 CSS，无预处理器。`main.css` 7682 行 + `tablet.css` 579 行 + `mistakes-refresh.css` 148 行 |

### 1.2 页面与路由清单

| 路由 | 文件 | 行数 | 现有功能 |
| --- | --- | --- | --- |
| `/` | DashboardPage | 333 | 欢迎区、4 统计卡、快速录入、贡献热力图、科目掌握进度、今日焦点、提醒、快捷入口、2 个图表、最近成绩 |
| `/records` | RecordsPage | 1769 | 查询/科目/卷型筛选、排序、分页、桌面表格 + 移动卡片、多选、批量改科目、合成成绩弹窗、导出弹窗（含实时预览）、恢复面板、数据健康检查 |
| `/records/:id` | RecordDetailPage | 249 | 详情指标、分项构成、关联错题、编辑、删除 |
| `/mistakes` | MistakesPage | 165 | 关键词/科目/状态/难度/排序筛选、新增表单、卡片列表、删除 |
| `/mistakes/:id` | MistakeDetailPage | 113 | 题目内容、解析、图片、复习计数、上下题、标记已掌握、编辑、删除 |
| `/subjects` | SubjectsPage | 221 | 4 统计卡、新增科目、拖拽排序、行内编辑、隐藏开关、删除 |
| `/backup` | BackupPage | 161 | 导出 JSON、合并导入、覆盖恢复、清空（需输入「清空」） |
| `/login` | LoginPage | 182 | 登录/注册、同步、云端校准、退出、同步状态 4 卡 |
| — | App.vue | 444 | 侧栏（274px）、顶栏、底部导航（≤1023px）、Toast、签名弹窗、公告中心 |

### 1.3 数据模型（不可破坏）

```
subject   { id, name, fullScore, color, hidden, sortOrder }
record    { id, subjectId, paperName, recordType: paper|exercise|composite,
            paperVariant: true|mock, score, fullScore, date, durationMinutes,
            exerciseBookName, exercisePage, exerciseQuestion,
            note, pendingSync, createdAt, ... }
mistake   { id, subjectId, title, knowledgePoint, analysis, status, difficulty,
            sourceRecordId, questionText, nextReviewAt, reviewedAt,
            createdAt, updatedAt }
image     { id, ownerType, ownerId, name, size, storageKey, url, pendingUpload, uploadError }
```

错题状态枚举：`待复盘 / 不熟 / 不会 / 已整理 / 已掌握`；难度：`简单 / 中等 / 困难`。

### 1.4 现状问题

1. **样式层失控**：`main.css` 7682 行里叠了 4 套以上主题层，反复覆盖同一批选择器，改一处要靠 `!important` 抢优先级。
2. **信息架构平铺**：侧栏 6 个入口无分组，「同步」和「备份」与业务页同级，缺少「复盘」这一条主线。
3. **首页堆砌**：统计数字 + 焦点 + 提醒 + 快捷入口 + 2 个图表，模块之间没有主次，缺少「一眼看到进度」的核心面板。
4. **移动端入口过多**：底部导航塞了 6 项，拥挤。
5. **状态缺失**：加载态只有一句「正在加载本地学习档案...」，没有 skeleton；错误态基本没有；删除用 `window.confirm`。
6. **反馈不统一**：有的用 inline alert，有的用 Toast，有的什么都不给。

---

## 二、参考站 IA 拆解（408os Dashboard）

参考站首页的模块顺序与承载信息：

| # | 模块 | 承载信息 | 可迁移到本项目的形态 |
| --- | --- | --- | --- |
| 1 | 统计范围筛选 | 「只看真题」开关 | 「只看真题 / 模拟卷」范围切换 |
| 2 | 欢迎区 | 用户、一句话 | 用户 + 今日日期 + 最近学习状态 |
| 3 | 核心数据 4 卡 | 已做题数 / 完成度% / 总题目 / 历年真题 | 成绩记录数 / 近 7 天练习 / 错题待复盘 / 平均得分率 |
| 4 | 主进度条 | 通关进度 % | 总体得分率 / 错题掌握率 |
| 5 | 贡献热力图（90 天） | 做题天数、连续天数 | 学习热力图 + 活跃天数、连续天数 |
| 6 | 公告列表 | 带日期与 new 标记 | 复用现有 `AnnouncementCenter` 数据 |
| 7 | 科目卡片组 | 每科：题数、做题进度%、掌握率%、**掌握/不熟/不会/未做 四态分布** | 每科：成绩数、平均得分率、**已掌握/已整理/不熟/不会/待复盘 五态分布** |
| 8 | 快捷入口网格 | 6 个功能入口 | 记录成绩 / 添加错题 / 查看成绩 / 错题库 / 科目管理 / 数据备份 |
| 9 | 空状态 | 「暂无收藏夹」 | 收藏夹本项目不做 → 改为「最近错题」空状态 |

**关键借鉴点**：科目卡片用「四态计数 + 进度条」而不是单一分数，用户能立刻看出薄弱环节。这一模式直接对应本项目的错题状态枚举。

---

## 三、页面对照表

| 当前页面 | 当前功能 | 参考站对应 | 必须保留 | 需要重新设计 | 需要新增/优化的交互 |
| --- | --- | --- | --- | --- | --- |
| **总览** `/` | 欢迎区 + 4 卡 + 热力图 + 科目进度 + 焦点 + 提醒 + 快捷入口 + 2 图 + 最近成绩 | Dashboard 全页 | 全部数据源与跳转 | 按「概览 → 进度 → 热力图 → 科目 → 趋势 → 最近 → 提醒 → 快捷」重排；统一卡片语言 | 范围切换（全部/真题/模拟）、模块空状态、热力图移动端横滑、趋势图时间范围切换 |
| **成绩列表** `/records` | 筛选/排序/分页/多选/批量/合成/导出/恢复/健康检查 | 真题大观（列表型） | 全部 | 顶部统计摘要条、筛选栏统一为 FilterBar、表格视觉重做、移动端卡片 | 筛选即时生效、骨架屏、空状态/错误态、删除确认弹窗（替换 `window.confirm`） |
| **成绩详情** `/records/:id` | 指标 + 分项 + 关联错题 + 编辑/删除 | — | 全部 | 顶部信息条 + 指标网格 + 关联错题区块 | 返回位置固定、删除二次确认、编辑态切换反馈 |
| **新增/编辑成绩** | 弹窗内嵌表单 | — | 全部字段 | 分区表单（基础/成绩/习题/复盘）、单列移动端 | 逐字段校验态、保存中/成功/失败、禁用态 |
| **错题列表** `/mistakes` | 筛选 + 新增 + 卡片列表 | 题目列表 | 全部筛选维度 | 复习导向：状态分栏 + 进度概览 + 更适合连续处理的列表 | 状态/难度即时筛选、卡片显示掌握态色条、批量操作 |
| **错题详情** `/mistakes/:id` | 题目/解析/图片/复习/上下题 | 做题页 | 全部 | 刷题式布局：内容区 + 状态操作区，键盘/滑动切换 | 状态快捷切换、复习计数、下一题不返回列表 |
| **科目管理** `/subjects` | 统计 + 新增 + 拖拽编辑 | — | 全部 | 统计条 + 列表化编辑（去掉 8 列挤一行） | 保存反馈、删除禁用原因提示 |
| **备份** `/backup` | 导出/导入/清空 | — | 全部 | 数据概览 + 操作分区 + 危险区 | 导入前确认、结果 Toast、备份新鲜度提示 |
| **同步** `/login` | 登录/注册/同步/校准 | — | 全部 | 状态区 + 表单区，未配置时给出明确空状态 | 登录中/成功/失败态 |
| **AppShell** | 侧栏 + 顶栏 + 底部导航 | 侧栏 + 顶部工具 | 路由与状态 | 侧栏分组（学习 / 数据 / 系统）、底部导航精简到 5 项、顶栏统一 PageHeader | 当前项高亮、滚动吸顶、移动端抽屉 |
| **弹窗/抽屉** | 合成、导出、签名、公告 | — | 全部 | 统一 Modal 规格（圆角/阴影/最大高度/滚动区） | 打开关闭动效 ≤160ms、ESC 关闭、遮罩点击关闭 |
| **Toast** | 已有 4 种类型 | — | 全部 | 统一样式与位置 | 移动端置于底部导航上方 |

---

## 四、设计系统规范（第二阶段产出）

### 4.1 色彩

| 语义 | 变量 | 亮色 | 暗色 |
| --- | --- | --- | --- |
| 页面背景 | `--bg` | `#f4f6f9` | `#0f141b` |
| 内容模块背景 | `--surface` | `#ffffff` | `rgba(24,30,39,.72)` |
| 次级背景 | `--surface-soft` | `#f7f8fa` | `rgba(31,38,48,.7)` |
| 主文字 | `--ink` | `#14181f` | `#eef2f7` |
| 次文字 | `--muted` | `#6b7280` | `#9aa4b2` |
| 弱文字 | `--muted-soft` | `#98a0ad` | `#7c8695` |
| 边框 | `--line` | `#e6e8ec` | `rgba(255,255,255,.10)` |
| 主色 | `--blue` | `#2f6fed` | `#5aa7ff` |
| 成功 | `--green` | `#16a34a` | `#3ed68f` |
| 警告 | `--orange` | `#e08700` | `#ffb452` |
| 危险 | `--red` | `#dc2626` | `#ff6b64` |
| 强调 | `--purple` | `#7c5cf5` | `#a49bff` |

掌握状态用色：`已掌握 = green`、`已整理 = blue`、`不熟 = orange`、`不会 = red`、`待复盘 = muted`。

### 4.2 圆角 / 阴影 / 间距

- 圆角：`--r-sm 6px`、`--r-md 10px`、`--r-lg 14px`、`--r-pill 999px`。卡片用 `md`，弹窗用 `lg`，**不做大圆角**。
- 阴影：`--shadow-xs`（卡片默认）、`--shadow-sm`（hover）、`--shadow-md`（弹窗）。均为低透明度单层投影。
- 间距刻度：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40`。
- 栅格：桌面 12 列（`gap 16px`），内容最大宽度 `1200px`；平板 8 列；移动 4 列。

### 4.3 字号与字重

| 用途 | 字号 | 字重 |
| --- | --- | --- |
| 页面标题 | 22px | 700 |
| 模块标题 | 15px | 600 |
| 指标数值 | 26px | 700 |
| 正文 | 14px | 400 |
| 辅助说明 | 12px | 400 |
| 标签 | 12px | 600 |

### 4.4 断点

沿用现有约定，不再新增：

- `≤ 460px` 小屏手机
- `≤ 767px` 手机
- `768 – 1023px` 平板竖屏
- `1024 – 1180px` 平板横屏
- `≥ 1181px` 桌面

### 4.5 组件规范

统一由 `design-system.css` 定义：按钮（primary / secondary / ghost / danger，四态齐全）、输入框（默认/聚焦/错误/禁用）、下拉、标签、进度条、表格、卡片、弹窗、Toast、骨架屏、空状态。

---

## 五、待确认的缺口（不伪造数据）

| 需求中的项 | 现状 | 处理方式 |
| --- | --- | --- |
| 错题「我的答案」「正确答案」 | 模型里只有 `analysis` | **不新增字段**。UI 用 `analysis` 承载「我的答案与解析」，另设「复盘备注」复用 `note` 语义。若确需拆分字段，需 Dexie 版本升级 + Supabase 迁移，单独确认 |
| 错题「章节」筛选 | 只有 `knowledgePoint` | 用 `knowledgePoint` 作为章节维度 |
| 热力图「学习时长」 | 有 `durationMinutes`，但错题无时长 | 热力图 tooltip 显示「成绩 N 条 / 错题 M 条 / 时长 X 分钟」，时长按成绩聚合 |
| 「今日学习目标」 | 无此数据 | **不伪造**。改为「今日待处理」，由真实数据推导：待复盘错题数、超 7 天未备份、待同步项 |
| 用户昵称/头像 | 只有 email | 用 email 首字母，与现状一致 |
| 收藏夹 | 无 | 不做，用「最近错题」替代 |

---

## 六、执行顺序

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 一 | 分析 + 页面对照表 | ✅ 本文档 |
| 二 | 设计系统 + AppShell + 基础组件 | 进行中 |
| 三 | Dashboard 改造 | 待办 |
| 四 | 成绩 / 错题 / 科目 / 备份 / 登录页面 | 待办 |
| 五 | 交互补齐（筛选/弹窗/Toast/骨架/空态/错误态/删除确认） | 待办 |
| 六 | 六档尺寸验证 + 控制台检查 | 待办 |

---

## 实施记录（第二阶段 ~ 第六阶段）

### 新增文件

| 文件 | 作用 |
| --- | --- |
| `src/styles/design-system.css` | 全站设计系统。三层结构：token（颜色 / 圆角 / 阴影 / 间距 / 字体）→ 用同名类覆盖既有样式（`.panel`、`.primary-button`、`input`、`.sidebar`…）→ 新增 `.ds-*` 语义组件。在 `main.js` 里最后引入，是视觉的最终裁决层。 |
| `src/components/ds/DsPageHeader.vue` | 页面头部：标题 + 说明 + 右侧操作 |
| `src/components/ds/DsStatCard.vue` | 指标卡：标签 + 数值 + 趋势说明 |
| `src/components/ds/DsSection.vue` | 区块卡片：统一的「标题 + 说明 + 操作 + 内容」节奏 |
| `src/components/ds/DsEmptyState.vue` | 空状态：图标 + 标题 + 说明 + 操作 |
| `src/components/ds/DsLoadingState.vue` | 骨架屏（行 / 卡片两种） |
| `src/components/ds/DsModal.vue` | 通用弹窗：Esc 关闭、锁滚动、开合动画 |
| `src/components/ds/DsConfirmHost.vue` | 全局二次确认弹窗宿主 |
| `src/components/ds/DsBadge.vue` | 状态徽标 |
| `src/components/ds/DsFilterBar.vue` | 筛选栏布局容器 |
| `src/components/ds/DsRecordCard.vue` | 记录卡片（移动端替代表格） |
| `src/composables/useConfirm.js` | `await confirm({...})` 形式的二次确认，替换 `window.confirm` |
| `src/utils/mistakeQueue.js` | 错题筛选 + 排序的唯一实现，列表页与详情页共用 |
| `scripts/check-bindings.mjs` | 静态模板绑定检查：用 `@vue/compiler-sfc` 扫出模板里没绑上的 `_ctx.*` |
| `scripts/verify-ui.mjs` | 多尺寸实测：起静态服务器 + 复用本机 Chrome/Edge，逐页检查控制台报错、横向溢出、越界元素、底部导航遮挡，并截图 |
| `scripts/probe-overflow.mjs` | 单元素祖先链诊断，定位溢出的具体来源 |

### 首页（DashboardPage）

按八块重构：欢迎区（问候语随时段变化）→ 今日待办（到期错题 / 今日是否已记录 / 备份时效，全部由真实数据推导）→ 顶部筛选（科目 + 时间范围，作用于整页并写入 localStorage）→ 核心指标 → 快速录入 → 科目掌握度（练习进度 / 平均分 / 得分率 / 错题数 + 五态分布条）→ 学习贡献热力图 + 提醒 + 快捷入口 → 分数趋势 → 最近成绩。

明确没有做的事：没有编造「今日目标」，没有做收藏功能——这些在现有数据里没有依据，宁可空着也不塞假数据。

### 热力图（ContributionHeatmap）

- 原生 `title` 换成自绘 tooltip（桌面 hover）+ 常驻读数行（触屏点按），因为 `title` 在 iPad 上根本弹不出来。
- 每天统计成绩条数、错题条数、成绩里记录的用时；没记用时就是「未记录用时」，不猜。
- 加了月份刻度；移动端横向滚动并在挂载后自动滚到最右（最近的日子）。

### 成绩图表（ScoreCharts）

- 支持时间范围筛选（`rangeDays`，0 = 全部）。
- 颜色从设计 token 读取，不再散落硬编码色值。
- 两个面板各自独立初始化：某个面板没数据被 `v-if` 掉时，另一个照常渲染，且容器消失时会销毁对应实例。
- 用 `ResizeObserver` 适配侧栏在「图标条 / 抽屉」之间切换导致的宽度变化。

### 错题连续复习

- 列表页：状态 chip（带各状态数量，点一下即筛选）、搜索 / 科目 / 章节（复用 `knowledgePoint`）/ 难度 / 排序全部即时生效，筛选条件写入 URL query。
- 详情页：上一题 / 下一题沿用列表页的筛选与排序（条件通过 query 带过去），所以「筛出 5 道不熟的题」就能顺着这 5 道翻完；状态可就地切换；桌面端支持 `←` `→` 翻题、`1`–`5` 切状态。
- 复习日志只写 localStorage，不改动 IndexedDB 里的错题结构。

### 交互与表单

- 6 处 `window.confirm` 全部替换为站内确认弹窗（`useConfirm()`），删除后的成功提示沿用 store 里已有的 toast。
- 成绩页筛选改为即时生效：下拉一改就应用，关键词输入 260ms 防抖。同步筛选时不再顺手收起录入面板，避免打断正在填的表单。
- 桌面端顶栏吸顶；底部标签栏从 6 项精简为 5 项（总览 / 成绩 / 错题 / 科目 / 备份），同步入口保留在顶栏账号区。
- 侧栏导航按「学习 / 管理」分组；详情页里侧栏选中态自己判定（路由是扁平注册的，`router-link-active` 不会把 `/records` 认成 `/records/123` 的父级）。

### 多尺寸实测发现并修掉的问题

| 问题 | 原因 | 处理 |
| --- | --- | --- |
| 成绩表右侧「用时 / 日期 / 操作」列完全不可达 | `.table-wrap { overflow: hidden }`（3612 行）把 898px 的表裁进 652px 容器 | 改为 `overflow-x: auto`；并把成绩页改成单列布局，列表独占整行 |
| 科目行右侧「隐藏 / 保存 / 删除」被裁 | 8 列固定网格最小约 850px，放在 696px 的右列里 | 科目页改单列，新增表单压成一行，列表独占整行 |
| 390px 下登录页四张卡挤成 60px 宽 | `.auth-summary-grid`（4955 行）在媒体查询外重新声明 4 列，覆盖了 820px 断点的单列折叠 | 在设计系统里补 820 / 520 两档折叠 |
| `URL.createObjectURL` 抛错 | 模板表达式编译成 `_ctx.URL`，实例上没有这个属性 | 移到 JS 里算，并显式 `revokeObjectURL` |
| 首页出现「2 道待复盘」与「没有积压」自相矛盾 | 把「到期该复习」和「还没复盘」混成一个判断 | 拆成两种情况分别措辞 |
| 成绩页 Hero 占掉首屏一半 | h2 是 `clamp(34px, 5vw, 58px)` + 192px 最小高度 | 收到 22px / 自适应高度 |

### 验证方式

```bash
npm run build
node scripts/check-bindings.mjs     # 模板绑定静态检查
node scripts/verify-ui.mjs          # 8 条路由 × 6 种尺寸 = 48 个组合
```

`verify-ui.mjs` 复用本机已安装的 Chrome / Edge（`playwright-core` 装在托管工作区，不污染项目依赖），
逐页检查控制台报错、整页横向溢出、越界元素、底部导航是否遮挡内容，并把截图写到 `.verify/`。
当前结果：**48 / 48 通过**。

覆盖尺寸：1440×900、1280×720、1024×768、768×1024、390×844、375×667。
覆盖路由：`/`、`/records`、`/records/:id`、`/mistakes`、`/mistakes/:id`、`/subjects`、`/backup`、`/login`。

---

## 第二轮：页面级一致性收口

第一轮建好了设计系统，但**只有首页和错题列表真的用了它**——其余 7 个业务页各写各的页头：
成绩页一套 `records-hero`、科目/备份/同步页一套 `panel + section-head + metric-card`、两个详情页又各有一套 `detail-head`。
结果就是同一款产品在不同页面看起来像两个人做的。这一轮把口径收齐。

### 1. 页头统一为 `DsPageHeader`

| 页面 | 改前 | 改后 |
| --- | --- | --- |
| 成绩 `/records` | `.panel.records-hero` + 4 张自写 `.records-metric` | `DsPageHeader` + `DsStatCard` 栅格 |
| 成绩详情 `/records/:id` | `.detail-panel` 里的 `.detail-head` | 页头提到卡片外，正文改用 `DsStatCard` + `DsSection` |
| 错题 `/mistakes` | 用 `DsSection` 兼任页头 | 补 `DsPageHeader`，原区块降级为「掌握状态」 |
| 错题详情 `/mistakes/:id` | `.detail-panel` 里的 `.detail-head` | `DsPageHeader` + 保留正文卡片 |
| 科目 `/subjects` | `panel + section-head + summary-grid` | `DsPageHeader` + `DsStatCard` + `DsSection` |
| 备份 `/backup` | 同上 | `DsPageHeader` + `DsStatCard` + `DsSection` |
| 同步 `/login` | 同上 | `DsPageHeader` + `DsStatCard` + `DsSection` |

`DsFilterBar` 也从「建了没人用」变成错题页的实际实现（此前是手抄一遍同样的 `.ds-filter-bar` 标记）。

### 2. `scripts/prune-css.mjs`：安全剪掉死样式

上面这轮替换让 `records-hero`、`records-metric`、`summary-grid`、`detail-head`、`detail-copy`、`subject-detail-panel` 等一批类彻底失去引用。
直接手删 7800 行的 CSS 风险太高，所以写了个剪枝器：

- **不做自动推断**。模板里存在 `preview-cell-${fieldId}`、`is-${tone}`、`tone-${tone}` 这类拼接类名，
  「CSS 里定义了但 .vue 里搜不到」并不等于死类，自动推断一定会误删。死类清单必须显式给出。
- 选择器列表按顶层逗号拆开，**只摘掉命中死类的那些选择器**；只要还剩一个活的，规则就保留。
- 递归进入 `@media / @supports / @layer / @container`，块内全空才整块丢。
- 扫描时跳过注释与字符串，规则前的注释单独留存，不会因为规则被删而丢掉章节分隔说明。

结果：`main.css` 7839 → 7631 行、`design-system.css` 2946 → 2916 行，共丢 39 条规则、摘除 130 个选择器，
CSS 产物 162.4 kB → 157.5 kB。

验证方式不是「看着没问题」，而是**拿剪枝前的 49 张截图做哈希比对**：
剪枝前后 10 张有差异，但同一份代码连跑两次也有 6~8 张差异，且差异全部集中在带列表的错题页——
逐张看过，布局、间距、颜色、字号完全一致，只是列表首条卡片不同（数据顺序），所以判定为非回归。

### 3. 顺手修掉错题排序的不确定性

`filterAndSortMistakes` 的四个比较函数都没有兜底键。`createdAt` 相同时（批量导入、同一天连续录入很常见）
顺序会退化成 store 里数组的原始顺序，列表和「上一题 / 下一题」就会飘。现在统一以 `id` 兜底，
状态排序在组内按创建时间倒序。

### 4. 为什么线上一直是旧版

`git status` 显示 **19 个文件从未被提交**，全部是重设计的地基：

```
docs/REDESIGN.md
scripts/{check-bindings,probe-badge,probe-overflow,prune-css,verify-ui}.mjs
src/components/ds/*.vue            (10 个)
src/composables/useConfirm.js
src/styles/design-system.css
src/utils/mistakeQueue.js
```

`70218e5 Redesign exam tracker as study dashboard` 提交的是更早的一版重设计（`main.css` 增量 + 首页 + 错题页），
而 `design-system.css`、`ds/` 组件、`useConfirm`、`mistakeQueue` 这些后续层从未进入版本库，
`main.js` 里那句 `import "./styles/design-system.css"` 也是未提交状态。

本地跑 `npm run dev` 看到的是完整的重设计，线上 `exam-tracker-gray.vercel.app` 看到的还是 `70218e5` 那一版——
这就是「改了但没生效」的原因。
