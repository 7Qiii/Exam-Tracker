/**
 * 校验「装到桌面」这条路是不是真的通。
 *
 * 为什么需要这个脚本：
 * 这个项目之前 manifest.webmanifest 和 sw.js 都写好了，但 index.html 里
 * **一个 link 标签都没有** —— 浏览器不知道 manifest 的存在，于是
 * display:standalone、快捷方式、图标全部失效，手机上打开就是普通网页。
 * 光看文件在不在（public/ 里确实有）会得出「PWA 已经做好了」的错误结论。
 * 所以要按浏览器实际看到的东西来判定。
 *
 * 检查项（对应 Chrome 的「可安装」判定条件）：
 *   1. 页面里引用了 manifest
 *   2. manifest 能取到、是合法 JSON
 *   3. 有 name / start_url / display（standalone 及以上）/ 192 与 512 图标
 *   4. manifest 里每个图标的 URL 都能取到，且实际像素尺寸与声明一致
 *   5. iOS 需要的 apple-touch-icon 存在（iOS 不认 SVG）
 *   6. Service Worker 真的注册成功（可安装的必要条件）
 *   7. 快捷方式的 URL 与路由模式匹配（hash 路由必须带 /#/）
 *
 * 用法：node scripts/check-pwa.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const WORKSPACE = "C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace";
const chromium = createRequire(`${WORKSPACE}/package.json`)("playwright-core").chromium;

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

let problems = 0;
const ok = (msg) => console.log(`  ok   ${msg}`);
const bad = (msg) => { problems += 1; console.log(`  失败 ${msg}`); };
const check = (cond, msg, detail) => (cond ? ok(msg) : bad(`${msg}${detail ? ` —— ${detail}` : ""}`));

const server = createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  let file = join(DIST, normalize(decodeURIComponent(url)));
  // 目录请求直接当 404，别让 readFile 抛 EISDIR
  if (!existsSync(file) || url === "/" || !extname(file)) file = join(DIST, "index.html");
  if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto(base, { waitUntil: "load" });

console.log("页面引用");
const links = await page.evaluate(() => ({
  manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") || null,
  appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") || null,
  icon: document.querySelector('link[rel="icon"]')?.getAttribute("href") || null
}));
check(!!links.manifest, "引用了 manifest", "index.html 里没有 <link rel=\"manifest\">，PWA 不会生效");
check(!!links.appleIcon, "引用了 apple-touch-icon", "iOS 上装到桌面会是没有图标的空白方块");

console.log("\nmanifest 内容");
const manifestRes = links.manifest ? await page.evaluate((href) => fetch(href).then((r) => r.status), links.manifest) : 0;
check(manifestRes === 200, `manifest 可访问（HTTP ${manifestRes}）`);

let manifest = null;
if (manifestRes === 200) {
  manifest = await page.evaluate((href) => fetch(href).then((r) => r.json()).catch(() => null), links.manifest);
  check(!!manifest, "manifest 是合法 JSON");

  if (manifest) {
    check(!!manifest.name, "有 name");
    check(!!manifest.start_url, "有 start_url");
    check(
      ["standalone", "fullscreen", "minimal-ui"].includes(manifest.display),
      `display 是 ${manifest.display}（可安装要求 standalone 及以上）`
    );
    const sizes = (manifest.icons || []).map((i) => i.sizes);
    check(sizes.includes("192x192"), "有 192×192 图标");
    check(sizes.includes("512x512"), "有 512×512 图标");
    check(
      (manifest.icons || []).some((i) => (i.purpose || "").includes("maskable")),
      "有 maskable 图标（安卓/鸿蒙裁圆角不会切到内容）"
    );

    // 启动配色必须和图标底色一致：安卓的启动屏就是「background_color + 图标」，
    // 两者不同色会看到一块突兀的方底。直接从 icon.svg 里读，别在这里再抄一遍颜色，
    // 否则改了图标忘了改这里，测试反而会替错误的组合背书。
    const iconSvg = await readFile(join(ROOT, "public", "icon.svg"), "utf8");
    const brandBg = /<rect[^>]*fill="(#[0-9a-fA-F]{3,8})"/.exec(iconSvg)?.[1]?.toLowerCase() || "";
    check(!!brandBg, `从 icon.svg 读出品牌底色（${brandBg || "读不到"}）`, "icon.svg 里找不到 <rect fill=...>");
    for (const key of ["background_color", "theme_color"]) {
      check(
        (manifest[key] || "").toLowerCase() === brandBg,
        `manifest ${key} 与图标底色一致（${manifest[key]}）`,
        `manifest ${key} 是 ${manifest[key]}，图标底色是 ${brandBg} —— 启动屏会和图标不同色`
      );
    }
  }
}

console.log("\n图标实际尺寸");
if (manifest) {
  const icons = await page.evaluate(async (list) => {
    const out = [];
    for (const icon of list) {
      const r = await fetch(icon.src);
      if (r.status !== 200) { out.push({ src: icon.src, sizes: icon.sizes, status: r.status }); continue; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
      out.push({ src: icon.src, sizes: icon.sizes, status: 200, w: img?.naturalWidth || 0, h: img?.naturalHeight || 0 });
      URL.revokeObjectURL(url);
    }
    return out;
  }, manifest.icons || []);

  for (const icon of icons) {
    if (icon.status !== 200) { bad(`${icon.src} 取不到（HTTP ${icon.status}）`); continue; }
    // SVG 的 sizes 是 "any"，跳过尺寸比对
    if (icon.sizes === "any") { ok(`${icon.src}（SVG，尺寸任意）`); continue; }
    const [w, h] = icon.sizes.split("x").map(Number);
    check(icon.w === w && icon.h === h, `${icon.src} 实际 ${icon.w}×${icon.h}，声明 ${icon.sizes}`, "尺寸不一致时部分浏览器会拒绝安装");
  }
}

console.log("\niOS 专用");
if (links.appleIcon) {
  const st = await page.evaluate((href) => fetch(href).then((r) => r.status).catch(() => 0), links.appleIcon);
  check(st === 200, `apple-touch-icon 可访问（HTTP ${st}）`);
  check(!links.appleIcon.endsWith(".svg"), "apple-touch-icon 不是 SVG", "iOS 不支持 SVG 主屏幕图标");
}

console.log("\niOS 启动图");
const startupLinks = await page.evaluate(() =>
  [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map((el) => ({
    href: el.getAttribute("href"),
    media: el.getAttribute("media") || ""
  }))
);
check(
  startupLinks.length > 0,
  `声明了 ${startupLinks.length} 张启动图`,
  "一个 apple-touch-startup-image 都没有 —— 从主屏幕启动会先闪一张白屏"
);

// 和生成器的清单对答案。index.html 里的 media 是手贴的，机型列表在
// public/splash/screens.json 里，两边会漂移，所以要逐条比。
const screensPath = join(ROOT, "public", "splash", "screens.json");
if (existsSync(screensPath)) {
  const expected = JSON.parse(await readFile(screensPath, "utf8"));
  check(
    expected.length === startupLinks.length,
    `启动图数量与 screens.json 一致（${expected.length} 档机型）`,
    `index.html 里有 ${startupLinks.length} 张，screens.json 里是 ${expected.length} 张 —— 两边漂移了`
  );
  const missing = expected.filter((e) => !startupLinks.some((l) => l.media === e.media));
  check(
    missing.length === 0,
    "screens.json 里每一档机型都在 index.html 里有对应的 link",
    `缺少：${missing.map((m) => m.note).join("、")}`
  );
}

// 每张图都要能取到，而且**真实像素必须和 media 查询算出来的完全一致**。
// 对不上时 iOS 会直接不用这张图 —— 表现是「启动图时有时无」，非常难查。
for (const link of startupLinks) {
  const st = await page.evaluate((href) => fetch(href).then((r) => r.status).catch(() => 0), link.href);
  if (st !== 200) {
    bad(`${link.href} 取不到（HTTP ${st}）`);
    continue;
  }
  const parsed = /device-width:\s*(\d+)px.*device-height:\s*(\d+)px.*-webkit-device-pixel-ratio:\s*([\d.]+)/.exec(link.media);
  if (!parsed) {
    bad(`${link.href} 的 media 解析不了：${link.media}`);
    continue;
  }
  const w = Number(parsed[1]) * Number(parsed[3]);
  const h = Number(parsed[2]) * Number(parsed[3]);
  const actual = await page.evaluate(async (href) => {
    const blob = await (await fetch(href)).blob();
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = url;
    });
    URL.revokeObjectURL(url);
    return img ? [img.naturalWidth, img.naturalHeight] : null;
  }, link.href);
  check(
    actual && actual[0] === w && actual[1] === h,
    `${link.href} ${actual?.[0]}×${actual?.[1]} 与 media 要求一致`,
    `尺寸对不上：实际 ${actual?.[0]}×${actual?.[1]}，media 要求 ${w}×${h}`
  );
}

console.log("\niOS 安装引导");
// 桌面浏览器上这条提示不该出现（检测的是 iOS Safari UA）
check(
  !(await page.evaluate(() => !!document.querySelector(".install-hint"))),
  "桌面浏览器上不出现「添加到主屏幕」引导"
);

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function iosPage(extra) {
  const context = await browser.newContext({
    userAgent: IOS_UA,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  const p = await context.newPage();
  if (extra) await p.addInitScript(extra);
  await p.goto(base, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  return { context, page: p };
}

const hasHint = (p) => p.evaluate(() => !!document.querySelector(".install-hint"));

const ios = await iosPage();
check(await hasHint(ios.page), "iPhone Safari 上出现「添加到主屏幕」引导", "iOS 用户看不到安装方法");
if (await hasHint(ios.page)) {
  await ios.page.locator(".install-hint button").click();
  await ios.page.waitForTimeout(300);
  check(!(await hasHint(ios.page)), "点关闭后引导消失");
  await ios.page.reload({ waitUntil: "load" });
  await ios.page.waitForTimeout(1500);
  check(!(await hasHint(ios.page)), "刷新后不再出现（已记到 localStorage）");
}
await ios.context.close();

// 已经装到主屏幕（standalone）时不该再提
const standalone = await iosPage(() => {
  Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
});
check(!(await hasHint(standalone.page)), "已装到主屏幕（standalone）时不再提示");
await standalone.context.close();

console.log("\nService Worker");
const swState = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "unsupported";
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error("超时")), 8000))
    ]);
    return reg?.active ? "active" : "registered";
  } catch (e) { return `失败：${e.message}`; }
});
check(swState === "active", `Service Worker 已激活（${swState}）`, "SW 是可安装的必要条件");

console.log("\n快捷方式 URL");
// 直接从源码判断路由模式，比猜更可靠
const routerSrc = existsSync(join(ROOT, "src/router/index.js")) ? await readFile(join(ROOT, "src/router/index.js"), "utf8") : "";
const usesHash = /createWebHashHistory/.test(routerSrc);
if (manifest?.shortcuts) {
  for (const s of manifest.shortcuts) {
    const valid = usesHash ? s.url.includes("#/") : !s.url.includes("#/");
    check(valid, `快捷方式「${s.short_name}」${s.url}${usesHash ? "（hash 路由需带 /#/）" : ""}`);
  }
}

console.log("\n控制台");
check(consoleErrors.length === 0, "无控制台报错", consoleErrors.slice(0, 3).join(" | "));

await browser.close();
server.close();

console.log(`\n${problems === 0 ? "全部通过" : `共 ${problems} 个问题`}`);
process.exitCode = problems === 0 ? 0 : 1;
