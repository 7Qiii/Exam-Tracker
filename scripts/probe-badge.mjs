/**
 * 一次性排查：顶栏铃铛的未读红点到底是真的被裁了，还是只是「故意探出按钮外」。
 *
 * 判定逻辑：把红点的 rect 和每一层祖先的 rect 求交，如果某层祖先
 * overflow 不是 visible，且红点超出了它的可视区，那就是真被裁。
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const WORKSPACE = "C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace";
const chromium = createRequire(`${WORKSPACE}/package.json`)("playwright-core").chromium;

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, ".verify");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json"
};

const PROBE = `(() => {
  const dot = document.querySelector(".notification-dot");
  const center = document.querySelector(".announcement-center");
  if (!dot || !center) return { found: false };
  const dotRect = dot.getBoundingClientRect();
  const centerRect = center.getBoundingClientRect();
  const chain = [];
  let el = dot.parentElement;
  let clippedBy = null;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const clips = !/(visible)/.test(style.overflowX) || !/(visible)/.test(style.overflowY);
    const outside = dotRect.right > rect.right + 0.5 || dotRect.left < rect.left - 0.5 ||
                    dotRect.bottom > rect.bottom + 0.5 || dotRect.top < rect.top - 0.5;
    chain.push({
      selector: el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0,2).join(".") : ""),
      overflow: style.overflowX + "/" + style.overflowY,
      clips,
      outside
    });
    if (clips && outside && !clippedBy) clippedBy = chain[chain.length - 1].selector;
    el = el.parentElement;
  }
  return {
    found: true,
    dot: { left: Math.round(dotRect.left), top: Math.round(dotRect.top), w: Math.round(dotRect.width), h: Math.round(dotRect.height) },
    center: { left: Math.round(centerRect.left), top: Math.round(centerRect.top), w: Math.round(centerRect.width), h: Math.round(centerRect.height) },
    dotVisible: getComputedStyle(dot).visibility !== "hidden" && getComputedStyle(dot).display !== "none",
    clippedBy,
    chain
  };
})()`;

function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    let filePath = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
    if (!existsSync(filePath)) filePath = join(DIST, "index.html");
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(body);
    } catch (error) {
      res.writeHead(404).end(String(error.message));
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

const browserPath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].find((item) => existsSync(item));

await mkdir(OUT, { recursive: true });
const { server, port } = await startServer();
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/#/`, { waitUntil: "load" });
await page.waitForTimeout(800);

const result = await page.evaluate(PROBE);
console.log(JSON.stringify(result, null, 2));

// 把顶栏区域截出来，肉眼复核
const topbar = page.locator("header").first();
if (await topbar.count()) {
  await topbar.screenshot({ path: join(OUT, "probe-topbar.png") });
  console.log("\n顶栏截图: " + join(OUT, "probe-topbar.png"));
}

await browser.close();
server.close();
