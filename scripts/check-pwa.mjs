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
