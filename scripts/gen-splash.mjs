/**
 * 生成 iOS 启动图（apple-touch-startup-image）。
 *
 * 为什么需要：
 *   从主屏幕启动一个 iOS 网页应用时，如果没声明启动图，系统会先给一张**白屏**，
 *   等页面渲染完才出现内容 —— 这一下白闪是「像个网页」和「像个 App」最明显的差别。
 *   iOS 又不像 Android 那样能用 manifest 的 background_color 自动生成，
 *   必须**每种机型分辨率各给一张**，靠 media 查询精确匹配。
 *
 * 为什么启动图「什么都没有」：
 *   这不是偷懒，是照 Apple 人机界面指南（HIG · Launching）抄的。原文：
 *     · "A launch screen isn't an opportunity for artistic expression."
 *     · "Design a launch screen that's nearly identical to the first screen…
 *        If your app displays a solid color before transitioning to the first
 *        screen, create a launch screen that displays only that solid color."
 *     · "Avoid including text on your launch screen."（文字没法本地化）
 *     · "Don't advertise… don't include logos or other branding elements unless
 *        they're a fixed part of your app's first screen."
 *   之前那版放了一个「IN」字标 + 「错题本」，四条全踩：启动屏和首屏不一样，
 *   反而制造了一次「深蓝 → 浅色」的闪。启动屏的作用是把「还没渲染好」的那段
 *   时间藏起来，不是给人看画面。
 *
 * 颜色从哪来 —— 两个踩过的坑，都写在这儿免得再踩：
 *   1. **不能手抄 --bg。** 这个项目里 --bg 被定义了好几次，而 main.css 的
 *      `:root[data-theme="light"]`（特异度 0,2,0）会压过 design-system.css 里的
 *      裸 `:root`（0,1,0）—— 所以浅色真实的底色是 #dfe7f0，不是 #f4f6f9。
 *      抄一份就必然和首屏对不上。
 *   2. **也不去复刻那层渐变。** 首屏 body 的渐变里有一条 `... 54%` 的色标，
 *      是按 body 高度算的，而 body 高度由内容决定（实测 3018px）。静态图片
 *      无论怎么画都对不齐，反而把单张图从 12KB 撑到 505KB。
 *      实测「平铺底色」和「复刻渐变」的最大色差是同一个量级（Δ≈13/255），
 *      所以老老实实用平铺底色。
 *   所以这里用**浏览器读真实计算样式**（body 的 backgroundColor，即渐变下面的
 *   基色）—— 由浏览器按完整层叠算出来，改了 CSS 重新生成即可，永不漂移。
 *
 * 产出：public/splash/<light|dark>/<宽>x<高>.png，文件名就是真实像素尺寸。
 *       纯色 PNG 自己编码，不走截图，所以单张十几 KB（截图版要 505KB）。
 * 用法：node scripts/gen-splash.mjs
 */
import { createRequire } from "node:module";
import { deflateSync, crc32 } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WORKSPACE = "C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace";
const chromium = createRequire(`${WORKSPACE}/package.json`)("playwright-core").chromium;

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
];

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "public", "splash");

/** 和 src/main.js 的 import 顺序保持一致 —— 顺序错了算出来的背景就不是首屏那个背景。 */
const CSS_FILES = ["main.css", "mistakes-refresh.css", "tablet.css", "design-system.css"];

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

export const splashPixels = (screen) => `${screen.width * screen.ratio}x${screen.height * screen.ratio}`;
export const splashPath = (mode, screen) => `/splash/${mode}/${splashPixels(screen)}.png`;

/**
 * iOS 匹配启动图用的 media 查询，必须和图片的真实像素完全对应。
 * 深色那一条在设备条件前再加一个 prefers-color-scheme 条件。
 */
export const splashMedia = (screen, mode) => {
  const device = `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio})`;
  return mode === "dark" ? `(prefers-color-scheme: dark) and ${device}` : device;
};

// ---------------------------------------------------------------------------
// 极简 PNG 编码：只做「整张图一个颜色」这一件事。
// 比开无头浏览器截图快得多，也不会把平滑渐变编成 500KB 的抖动噪点。
// ---------------------------------------------------------------------------
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** 生成一张 width×height 的纯色 PNG。hex 形如 "#dfe7f0"。 */
function solidPng(width, height, hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  // 10/11/12 = compression / filter / interlace，全 0
  //
  // 过滤器用「Up」(2)：每行存的是「本行 - 上一行」。纯色图里除了第一行，
  // 其余整行都是 0，deflate 几乎全吃掉 —— 单张从 12KB 掉到 1KB 以内。
  // 第一行没有上一行（按全 0 处理），所以 Up 退化成直接存原值，正好。
  const firstRow = Buffer.alloc(1 + width * 3);
  firstRow[0] = 2;
  for (let x = 0; x < width; x += 1) {
    firstRow[1 + x * 3] = r;
    firstRow[2 + x * 3] = g;
    firstRow[3 + x * 3] = b;
  }
  const emptyRow = Buffer.alloc(1 + width * 3);
  emptyRow[0] = 2;
  const raw = Buffer.concat([firstRow, ...Array.from({ length: height - 1 }, () => emptyRow)]);
  return Buffer.concat([
    PNG_MAGIC,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const rgbToHex = (value) => {
  const [r, g, b] = /rgba?\(([^)]+)\)/.exec(value)[1].split(",").map((v) => parseInt(v, 10));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const browserPath = BROWSER_CANDIDATES.find((path) => existsSync(path));
if (!browserPath) throw new Error("没有找到 Chrome / Edge，无法计算真实背景色。");

const appCss = CSS_FILES.map((file) => readFileSync(join(ROOT, "src", "styles", file), "utf8")).join("\n");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: browserPath, headless: true });

// 让浏览器按真实层叠算出「首屏背景的基色」。
// 视口用最窄的那档（320pt），保证手机断言的媒体查询生效。
const COLORS = {};
for (const mode of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html data-theme="${mode}"><head><meta charset="UTF-8" /><style>${appCss}</style></head><body></body></html>`,
    { waitUntil: "load" }
  );
  const computed = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  COLORS[mode] = rgbToHex(computed);
  await page.close();
}
await browser.close();

let total = 0;
for (const mode of ["light", "dark"]) {
  const color = COLORS[mode];
  const dir = join(OUT_DIR, mode);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  console.log(`\n${mode}  ${color}`);
  for (const screen of IPHONE_SCREENS) {
    const w = screen.width * screen.ratio;
    const h = screen.height * screen.ratio;
    writeFileSync(join(dir, `${w}x${h}.png`), solidPng(w, h, color));
    total += 1;
    console.log(`  ${`${w}x${h}.png`.padEnd(14)} ${String(w).padStart(4)}×${h}  ${screen.note}`);
  }
}

// 顺手写一份清单：index.html 里的 link 标签和 check-pwa.mjs 都从这里对答案，
// 免得「改了机型列表忘了同步 index.html」这种漂移。
writeFileSync(
  join(OUT_DIR, "screens.json"),
  `${JSON.stringify(
    {
      colors: COLORS,
      screens: IPHONE_SCREENS.map((screen) => ({
        pixels: splashPixels(screen),
        light: splashPath("light", screen),
        dark: splashPath("dark", screen),
        media: splashMedia(screen, "light"),
        mediaDark: splashMedia(screen, "dark"),
        note: screen.note
      }))
    },
    null,
    2
  )}\n`
);
console.log(`\n共 ${total} 张（${IPHONE_SCREENS.length} 档机型 × 2 种外观），清单见 public/splash/screens.json`);
