# Exam Tracker

面向 11408 备考的成绩追踪、错题记录与图片复盘工具。项目已从原生静态页面升级为 Vue3 控制台应用，适合后续持续扩展内容、分类和同步能力。

## 使用

```powershell
npm install
npm run dev
```

本地访问 `http://127.0.0.1:5173/`。

生产构建：

```powershell
npm run build
```

## 当前功能

- Vue3 + Vite + Pinia + Vue Router 控制台架构
- 成绩记录、筛选、分页、详情页与 ECharts 统计图
- 错题记录、分类检索、状态管理、关联成绩
- 错题图片多图上传，图片 Blob 本地保存到 IndexedDB
- 数据导入导出，导出时会把图片转为可迁移 Data URL
- PWA 基础缓存，保留移动端使用能力
- 原静态版本保留在 `public/legacy/` 作为迁移参考

## 数据策略

默认使用 IndexedDB 本地优先存储：

- `subjects`：科目、满分、目标分、颜色
- `records`：考试/练习成绩
- `mistakes`：错题、知识点、错因、复盘状态
- `images`：错题图片 Blob

后续跨设备同步建议把大图片单独上传到 Vercel Blob 或对象存储，状态 JSON 只保存图片 URL 和元数据。

## 部署

Vercel 使用根目录部署：

- Build Command: `npm run build`
- Output Directory: `dist`
- API 位于 `api/state.js`
- 如启用云同步，设置环境变量 `APP_PIN` 并连接 Vercel Blob

当前云同步 API 已兼容 `mistakes` 字段；图片云同步仍建议单独实现上传接口。
