/**
 * 系统公告时间线。
 *
 * 这个文件是 scripts/gen-announcements.mjs 从 docs/REDESIGN.md 生成的，不要手改 ——
 * 改了会在 npm run check 里被判定为过期。要改内容请改更新日志里的
 * `> 公告｜类型｜标题｜摘要` 那一行，然后重新生成。
 *
 * 共 14 条，最新一条 2026-10-03。
 */
export const announcements = [
  {
    id: "round-15",
    type: "polish",
    title: "系统公告会跟着更新日志自动更新了",
    summary: "以前它是一份手抄的副本、停在 8 月；现在每轮更新日志的内容会自动出现在公告里，铃铛角标也改成看过即消。",
    time: "2026-10-03"
  },
  {
    id: "round-14",
    type: "fix",
    title: "同步不会再带回你没记过的成绩",
    summary: "旧版本自动生成的演示数据会自动清理，改过的记录照常保留。",
    time: "2026-10-03"
  },
  {
    id: "round-13",
    type: "polish",
    title: "错题多也不卡了",
    summary: "列表分页 + 搜索防抖（1000 条时每次按键从 278ms 降到无感），首屏少下载 12%~21% 字节。",
    time: "2026-10-03"
  },
  {
    id: "round-12",
    type: "polish",
    title: "清理仓库里的旧版页面",
    summary: "移除迁移前的静态页面，仓库更干净。",
    time: "2026-10-03"
  },
  {
    id: "round-11",
    type: "fix",
    title: "填了一半的表单不会被丢掉",
    summary: "收起或换页会先问一句，不会再无声丢掉你写的内容。",
    time: "2026-10-03"
  },
  {
    id: "round-10",
    type: "feature",
    title: "可以装到手机桌面了",
    summary: "有图标、能离线打开、以独立窗口运行。",
    time: "2026-10-02"
  },
  {
    id: "round-9",
    type: "polish",
    title: "列表顺序稳定，样式瘦身",
    summary: "清掉不再使用的样式，成绩列表刷新不再跳动。",
    time: "2026-10-02"
  },
  {
    id: "round-8",
    type: "feature",
    title: "「用时」改成小时 + 分钟",
    summary: "录入更顺手，成绩归一化逻辑也纳入自动化测试。",
    time: "2026-10-02"
  },
  {
    id: "round-7",
    type: "fix",
    title: "无障碍与浮层交互补齐",
    summary: "补上无障碍标注与浮层键盘操作，全站 a11y 检查 0 类问题。",
    time: "2026-10-02"
  },
  {
    id: "round-6",
    type: "fix",
    title: "弹窗的键盘操作修好了",
    summary: "焦点进得来、Tab 跑不出去、Escape 能关，关掉后焦点回到原按钮。",
    time: "2026-10-02"
  },
  {
    id: "round-5",
    type: "feature",
    title: "导出前按列挑选成绩",
    summary: "可以按列勾选要包含哪几次成绩，不用把不要的一起导出去。",
    time: "2026-10-01"
  },
  {
    id: "round-4",
    type: "feature",
    title: "导出的 Excel 按卷子自动分列",
    summary: "同一套卷子的多次成绩并进同一列，年份真题不再各占一列。",
    time: "2026-10-01"
  },
  {
    id: "round-3",
    type: "polish",
    title: "首页瘦身，导出入口更好找",
    summary: "首页从 10 块压到 6 块常驻，并逐个实测了全站按钮。",
    time: "2026-10-01"
  },
  {
    id: "round-2",
    type: "polish",
    title: "全站页面统一版式",
    summary: "7 个业务页都用上设计系统的页头，不再各写各的。",
    time: "2026-10-01"
  }
];
