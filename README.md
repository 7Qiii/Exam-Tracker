# Exam Tracker

Exam Tracker is a general-purpose exam review console for score tracking, mistake review, image-based notes, and cross-device sync. The project has been upgraded into a Vue3 console application designed for long-term extensibility.

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
- 错题记录、分类检索、解析复盘
- 科目管理，支持默认科目排序与自定义科目扩展
- 错题图片多图上传，图片 Blob 本地保存到 IndexedDB
- 备份中心，支持导出、合并导入、覆盖恢复和清空确认
- Supabase Auth/Postgres 多设备同步入口
- Cloudflare R2 预签名上传，图片压缩后存对象存储
- 数据导入导出，导出时会把图片转为可迁移 Data URL
- PWA 基础缓存，保留移动端使用能力
- 原静态版本保留在 `public/legacy/` 作为迁移参考

## 数据策略

默认使用 IndexedDB 本地优先存储：

- `subjects`：科目、满分、颜色
- `records`：考试/练习成绩
- `mistakes`：错题、知识点、解析复盘
- `images`：错题图片 Blob

云端同步方案：

- Supabase Auth：账号登录/注册
- Supabase Postgres：科目、成绩、错题、图片元数据
- Cloudflare R2：错题图片本体
- IndexedDB：本地缓存和未登录离线模式

需要先在 Supabase SQL Editor 执行 `supabase/schema.sql`，然后在 Vercel 配置 `.env.example` 中列出的环境变量。

## 部署

Vercel 使用根目录部署：

- Build Command: `npm run build`
- Output Directory: `dist`
- API 位于 `api/state.js`
- 如启用云同步，设置环境变量 `APP_PIN` 并连接 Vercel Blob

当前云同步 API 已兼容 `mistakes` 字段；图片云同步仍建议单独实现上传接口。
