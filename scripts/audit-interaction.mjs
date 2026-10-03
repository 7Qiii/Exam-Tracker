/**
 * 交互体验审计：量「切页面时的位置与焦点」这类手感问题。
 *
 * 为什么单独写一个：audit-a11y 查的是静态可达性（名字、尺寸、对比度），
 * audit-buttons 查的是「点一下有没有反应」。两者都覆盖不到
 * 「从列表滚到一半点进详情、再返回」这种**跨页面的状态**问题 ——
 * 而这类问题恰恰是天天用的人最先感觉到的。
 *
 * 检查项：
 *   1. 前进导航（切到另一个路由）后应回到顶部，否则新页面会「从半截开始」
 *   2. 返回时应恢复离开时的位置，否则长列表里翻到一半点进去再退回来会丢失位置
 *   3. 切路由后焦点应落到新页面（键盘 / 读屏用户否则还停在旧位置）
 *   4. 弹窗开着时按返回，应该只关弹窗、不换页，且不能把页面滚回顶部
 *   5. 弹窗开开关关之后历史记录要回到原样，不能留下「按返回没反应」的幽灵记录
 *   6. 搜索浮层要能用键盘走到（Tab / ↑↓ / Enter / Escape），不能只有鼠标能点
 *
 * 用法：node scripts/audit-interaction.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const WORKSPACE = "C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace";
const chromium = createRequire(`${WORKSPACE}/package.json`)("playwright-core").chromium;

const DIST = join(process.cwd(), "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

let problems = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { problems += 1; console.log(`  问题 ${m}`); };
const check = (cond, good, badMsg) => (cond ? ok(good) : bad(badMsg));

const server = createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  let file = join(DIST, normalize(decodeURIComponent(url)));
  if (!existsSync(file) || url === "/" || !extname(file)) file = join(DIST, "index.html");
  if (!existsSync(file)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: "chrome" });

// 用小屏跑，列表才有足够长度滚起来
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(base, { waitUntil: "networkidle" });

const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
const goto = async (hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(500);
};

console.log("场景 1：在长列表里向下滚动，然后切到另一个路由");
await goto("#/records");
await page.waitForTimeout(300);
const canScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 100);
if (!canScroll) {
  bad("成绩页在当前视口下不够长，测不出滚动（demo 数据只有 4 条）");
} else {
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(200);
  const before = await scrollY();
  await goto("#/subjects");
  const after = await scrollY();
  check(after === 0, `切到新路由后回到顶部（滚动 ${before} → ${after}）`,
    `切到新路由后没有回到顶部：从 ${before} 变成 ${after}，新页面会从半截开始显示`);
}

console.log("\n场景 2：从列表点进详情，再返回");
await goto("#/records");
await page.waitForTimeout(300);
if (await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 100)) {
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(200);
  const listPos = await scrollY();
  await goto("#/records/demo-1");
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForTimeout(500);
  const backPos = await scrollY();
  check(backPos === 0 || Math.abs(backPos - listPos) < 40,
    `返回后位置可接受（离开时 ${listPos}，返回后 ${backPos}）`,
    `返回后位置异常：离开时 ${listPos}，返回后 ${backPos}`);
} else {
  bad("列表不够长，跳过返回位置测试");
}

console.log("\n场景 3：切路由后焦点落到哪里");
await goto("#/records");
const focusOnRecords = await page.evaluate(() => ({
  tag: document.activeElement?.tagName || "",
  cls: document.activeElement?.className || "",
  isBody: document.activeElement === document.body
}));
await goto("#/mistakes");
const focusAfterNav = await page.evaluate(() => ({
  tag: document.activeElement?.tagName || "",
  cls: document.activeElement?.className || "",
  isBody: document.activeElement === document.body
}));
check(
  !focusAfterNav.isBody || !focusOnRecords.isBody,
  `切路由后焦点不在 body（${focusAfterNav.tag}.${focusAfterNav.cls}）`,
  "切路由后焦点仍在 body —— 键盘和读屏用户还停在旧页面的位置，不知道已经换页了"
);

console.log("\n场景 4：弹窗开着时按「返回」（手机手势 / 系统返回键）");
await goto("#/records");
await page.waitForTimeout(400);
const routeBefore = await page.evaluate(() => location.hash);
await page.click('button[aria-label="签名"]');
await page.waitForTimeout(400);
const dialogOpened = await page.evaluate(() => !!document.querySelector(".signature-dialog"));
if (!dialogOpened) {
  bad("没能打开签名弹窗，跳过该场景");
} else {
  // 用页面内的 history.back()，而不是 page.goBack()：弹窗的记录是同地址的，
  // 这条返回不会产生导航，Playwright 的 goBack 会一直等 load 事件。
  // history.back() 走的正是浏览器返回键 / 手机侧滑那一条代码路径。
  await page.evaluate(() => history.back());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    hash: location.hash,
    dialog: !!document.querySelector(".signature-dialog")
  }));
  check(
    !after.dialog && after.hash === routeBefore,
    `返回键关掉了弹窗、且没有换页（仍停在 ${after.hash}）`,
    `返回键没有先关弹窗：hash ${routeBefore} → ${after.hash}，弹窗${after.dialog ? "还开着" : "已消失"} —— 手机上滑一下返回，会直接离开当前页`
  );

  // 关弹窗时不能顺手把页面滚回顶部。
  // 注意这里必须用页面内 .click() 而不是 page.click()：Playwright 的 click 会先把
  // 元素滚进视野，顶栏的签名按钮在页面顶部，一滚就把 scrollY 清成 0 ——
  // 量到的是「Playwright 自己滚的」，不是弹窗干的。
  const scrolled = await page.evaluate(() => {
    window.scrollTo(0, 500);
    return Math.round(window.scrollY);
  });
  await page.evaluate(() => document.querySelector('button[aria-label="签名"]')?.click());
  await page.waitForTimeout(350);
  await page.evaluate(() => history.back());
  await page.waitForTimeout(500);
  const kept = await scrollY();
  check(Math.abs(kept - scrolled) < 40,
    `关弹窗没动滚动位置（${scrolled} → ${kept}）`,
    `关弹窗把页面滚到了 ${kept}（原本在 ${scrolled}）—— 返回手势关弹窗时页面会跳回顶部`);
}

console.log("\n场景 5：历史记录不能越积越多（打开又关掉，要能原路退回）");
await goto("#/records");
await page.waitForTimeout(300);
// 不能用 history.length 判断：它统计的是「会话历史里的条目总数」，
// 后退不会让它变小（实测 3→4 之后一直是 4），而且在中途 pushState 会截断
// 前面的条目、总数可能不增反减。用我们自己压进去的标记来判断才准。
await page.click('button[aria-label="签名"]');
await page.waitForTimeout(400);
const opened = await page.evaluate(() => ({
  dialog: !!document.querySelector(".signature-dialog"),
  marker: history.state?.__dialogId ?? null
}));
check(opened.dialog && !!opened.marker,
  `弹窗打开时压了一条带标记的历史记录（__dialogId=${opened.marker}），返回手势才有东西可以拦`,
  `弹窗打开时历史里没有标记（dialog=${opened.dialog}, __dialogId=${opened.marker}）—— 没压记录，返回手势会直接换页`);

// Escape 关闭：这一条记录必须被主动弹掉，否则会留下一层「按返回没反应」的幽灵
await page.keyboard.press("Escape");
await page.waitForTimeout(550);
const afterEscape = await page.evaluate(() => ({
  marker: history.state?.__dialogId ?? null,
  dialog: !!document.querySelector(".signature-dialog"),
  hash: location.hash
}));
check(!afterEscape.dialog && !afterEscape.marker,
  `Escape 关弹窗后那条记录被弹掉了（标记 ${opened.marker} → ${afterEscape.marker}）`,
  `Escape 关弹窗后历史里还留着标记 ${afterEscape.marker} —— 之后按返回会「没反应」一下，用户以为卡住了`);

// 反向验证：没有残留记录时，返回应该真的能换页
await page.evaluate(() => history.back());
await page.waitForTimeout(600);
const hashAfterRealBack = await page.evaluate(() => location.hash);
check(hashAfterRealBack !== "#/records",
  `关掉弹窗后，返回键恢复成正常换页（→ ${hashAfterRealBack}）`,
  `关掉弹窗后返回键还是没换页（仍停在 ${hashAfterRealBack}）—— 历史里留了多余记录`);

console.log("\n场景 6：搜索浮层的键盘操作（Tab / ↑↓ / Enter / Escape）");
// 搜索框在 ≤820px 是 display:none（手机规则把它藏了），所以这一场景要单独开一个
// 宽一点的视口。用同一个 page 改视口也行，但列表/布局的其它断言会被牵连。
const searchPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await searchPage.goto(`${base}/#/records`, { waitUntil: "networkidle" });
await searchPage.waitForTimeout(1500);
const SEARCH = 'input[aria-label="搜索成绩和错题"]';
// 用 fill 而不是 type：fill 会先清空，省得上一段测试留下的关键字被接在后面
await searchPage.fill(SEARCH, "模拟");
await searchPage.waitForTimeout(400);
const resultCount = await searchPage.locator(".global-search-result").count();
if (!resultCount) {
  bad('搜索「模拟」没有出结果（demo 数据变了？），跳过该场景');
} else {
  // 1. Tab 从输入框进到结果上时，浮层不能先收起来
  await searchPage.keyboard.press("Tab");
  const tabState = await searchPage.evaluate(() => ({
    open: !!document.querySelector(".global-search-popover"),
    cls: String(document.activeElement?.className || "")
  }));
  check(tabState.open && tabState.cls.includes("global-search-result"),
    "Tab 能把焦点移到结果上，浮层保持打开",
    `Tab 之后浮层${tabState.open ? "还在、但焦点没落到结果上" : "被关掉了"}（焦点在 ${tabState.cls || "?"}）—— 键盘用户够不到搜索结果，只能靠 Enter 撞第一条`);

  // 2. ↑↓ 在结果之间移动（要真的换了一条，不能只是「焦点在某个结果上」）
  await searchPage.fill(SEARCH, "模拟");
  await searchPage.waitForTimeout(350);
  const activeText = () =>
    searchPage.evaluate(() => String(document.activeElement?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40));
  await searchPage.keyboard.press("ArrowDown");
  const firstStop = await activeText();
  await searchPage.keyboard.press("ArrowDown");
  const secondStop = await activeText();
  if (resultCount < 2) {
    check(Boolean(firstStop), `↓ 把焦点移到了结果上（「${firstStop}」）`, "↓ 没能把焦点移到结果上");
  } else {
    check(Boolean(firstStop) && secondStop !== firstStop,
      `↓ 在结果之间移动（「${firstStop}」 → 「${secondStop}」）`,
      `↓ 没能换到下一条（两次都停在「${firstStop || "?"}」，共 ${resultCount} 条结果）`);
  }

  // 3. Enter 打开当前高亮的那一条
  const hashBefore = await searchPage.evaluate(() => location.hash);
  await searchPage.keyboard.press("Enter");
  await searchPage.waitForTimeout(800);
  const afterEnter = await searchPage.evaluate(() => ({
    hash: location.hash,
    open: !!document.querySelector(".global-search-popover")
  }));
  check(afterEnter.hash !== hashBefore && !afterEnter.open,
    `Enter 打开了高亮的那条结果（${hashBefore} → ${afterEnter.hash}）`,
    `Enter 没能打开结果（${hashBefore} → ${afterEnter.hash}，浮层${afterEnter.open ? "还开着" : "已关闭"}）`);

  // 4. Escape 收起浮层
  await searchPage.goto(`${base}/#/records`, { waitUntil: "load" });
  await searchPage.waitForTimeout(1200);
  await searchPage.fill(SEARCH, "模拟");
  await searchPage.waitForTimeout(400);
  await searchPage.keyboard.press("Escape");
  await searchPage.waitForTimeout(300);
  const popoverAfterEscape = await searchPage.evaluate(() => !!document.querySelector(".global-search-popover"));
  check(!popoverAfterEscape, "Escape 能收起搜索浮层", "Escape 收不起搜索浮层");
}
await searchPage.close();

console.log(`\n${problems === 0 ? "没有发现问题" : `共 ${problems} 个问题`}`);
await browser.close();
server.close();
process.exitCode = problems === 0 ? 0 : 1;
