/**
 * 生成 iOS 启动图（apple-touch-startup-image）。
 *
 * 为什么需要：
 *   从主屏幕启动一个 iOS 网页应用时，如果没声明启动图，系统会先给一张**白屏**，
 *   等页面渲染完才出现内容 —— 这一下白闪是「像个网页」和「像个 App」最明显的差别。
 *   iOS 又不像 Android 那样能用 manifest 的 background_color 自动生成，
 *   必须**每种机型分辨率各给一张**，靠 media 查询精确匹配。
 *
 * 为什么用 #18212f 当底色：
 *   它和主屏幕图标（public/icon.svg 的圆角方底）是同一个颜色。
 *   从主屏幕点开时，图标会直接「化」进启动屏，两种系统模式下都不突兀。
 *   反过来说，用浅色或深色主题色都会有一半用户觉得闪 —— 所以不用主题色。
 *
 * 产出：public/splash/<宽>x<高>.png，文件名就是像素尺寸，方便和 index.html 对齐。
 * 用法：node scripts/gen-splash.mjs
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WORKSPACE = "C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace";
const chromium = createRequire(`${WORKSPACE}/package.json`)("playwright-core").chromium;

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
];

const OUT_DIR = join(process.cwd(), "public", "splash");

/**
 * iPhone 各代的分辨率。
 *
 * width / height 是 **CSS 点**（就是 media 查询里 device-width 用的值），
 * ratio 是 -webkit-device-pixel-ratio，两者相乘才是图片的真实像素。
 * 竖屏取值：device-width/device-height 在 iOS 上恒为竖屏尺寸，不随旋转变化。
 */
export const IPHONE_SCREENS = [
  { width: 320, height: 568, ratio: 2, note: "SE 1代 / 5s" },
  { width: 375, height: 667, ratio: 2, note: "SE 2/3代 / 8 / 7 / 6s" },
  { width: 375, height: 812, ratio: 3, note: "X / XS / 11 Pro / 12·13 mini" },
  { width: 390, height: 844, ratio: 3, note: "12 / 13 / 14" },
  { width: 393, height: 852, ratio: 3, note: "14 Pro / 15 / 15 Pro / 16" },
  { width: 402, height: 874, ratio: 3, note: "16 Pro" },
  { width: 414, height: 896, ratio: 2, note: "XR / 11" },
  { width: 414, height: 896, ratio: 3, note: "XS Max / 11 Pro Max" },
  { width: 428, height: 926, ratio: 3, note: "12·13 Pro Max / 14 Plus" },
  { width: 430, height: 932, ratio: 3, note: "14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus" },
  { width: 440, height: 956, ratio: 3, note: "16 Pro Max" }
];

export const splashFile = (screen) => `${screen.width * screen.ratio}x${screen.height * screen.ratio}.png`;

/** iOS 匹配启动图用的 media 查询，必须和图片的真实像素完全对应。 */
export const splashMedia = (screen) =>
  `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio})`;

const BRAND_BG = "#18212f";
const BRAND_INK = "#f5f7f4";
const BRAND_ACCENT = "#18706f";

/**
 * 启动图模板。
 * 只放图标里的那个「N + 下划线」，不放圆角方底 —— 整屏已经是同色了，再加方底看不见。
 * 尺寸全部按屏幕宽度取百分比，所以同一份模板放大缩小到任何机型都协调。
 */
const template = (w, h) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${w}px; height: ${h}px; overflow: hidden; background: ${BRAND_BG}; }
      body {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .mark { width: ${(w * 0.34).toFixed(1)}px; height: ${(w * 0.34).toFixed(1)}px; display: block; }
      .name {
        margin-top: ${(h * 0.035).toFixed(1)}px;
        font-size: ${(w * 0.055).toFixed(1)}px;
        letter-spacing: ${(w * 0.012).toFixed(2)}px;
        color: rgba(245, 247, 244, 0.62);
      }
    </style>
  </head>
  <body>
    <svg class="mark" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M126 358V140h58v218h-58Zm88 0V140h48l86 122V140h58v218h-50l-84-119v119h-58Z" fill="${BRAND_INK}" />
      <path d="M124 386h288" stroke="${BRAND_ACCENT}" stroke-width="26" stroke-linecap="round" />
    </svg>
    <div class="name">错题本</div>
  </body>
</html>`;

const browserPath = BROWSER_CANDIDATES.find((path) => existsSync(path));
if (!browserPath) throw new Error("没有找到 Chrome / Edge，无法生成启动图。");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: browserPath, headless: true });

let total = 0;
for (const screen of IPHONE_SCREENS) {
  const w = screen.width * screen.ratio;
  const h = screen.height * screen.ratio;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(template(w, h), { waitUntil: "load" });
  await page.screenshot({ path: join(OUT_DIR, splashFile(screen)), type: "png" });
  await page.close();
  total += 1;
  console.log(`  ${splashFile(screen).padEnd(16)} ${String(w).padStart(4)}×${h}  ${screen.note}`);
}

await browser.close();

// 顺手写一份清单：index.html 里的 link 标签和 check-pwa.mjs 都从这里对答案，
// 免得「改了机型列表忘了同步 index.html」这种漂移。
const manifestPath = join(OUT_DIR, "screens.json");
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    IPHONE_SCREENS.map((s) => ({ file: splashFile(s), media: splashMedia(s), note: s.note })),
    null,
    2
  )}\n`
);
console.log(`\n共 ${total} 张，已写入 public/splash/（清单见 public/splash/screens.json）`);
