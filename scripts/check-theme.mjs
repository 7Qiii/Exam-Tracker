/**
 * 三种外观模式（跟随系统 / 浅色 / 深色）的一致性检查。
 *
 * 背景（第十六轮修的那个 bug）：
 *   三条路径原本是两种实现 ——
 *     system  → 不写 data-theme，靠 @media (prefers-color-scheme: dark) 兜；
 *     light/dark → 写 data-theme，靠 :root[data-theme="..."] 兜。
 *   同一套「深色」因此有两份规则，而且已经各自漂移：
 *   用 CSSOM 数过，媒体查询里有 18 条选择器在 [data-theme="dark"] 里没有，
 *   [data-theme="dark"] 里也有 36 条在媒体查询里没有。
 *   更糟的是 design-system.css 最后加载，它的裸 :root 浅色 token 和媒体查询里的
 *   :root 优先级相同却更靠后 —— 于是系统是深色时「跟随系统」反而渲染成浅色，
 *   而且是和「浅色」模式不同的第三种样子。用户选「跟随系统」和选「深色」，
 *   看到的根本不是同一个东西。
 *
 * 现在统一改成：在 JS 里把 system 解析成 light/dark 再写 data-theme，
 * 三种模式只剩两套外观。这个脚本负责把这件事钉死。
 *
 * 四条不变量（任何一条破了都是 bug）：
 *   A. 系统=dark 时，「跟随系统」必须和「深色」逐元素一致；
 *   B. 系统=light 时，「跟随系统」必须和「浅色」逐元素一致；
 *   C. 选「浅色」后，系统配色不该再有任何影响；
 *   D. 选「深色」后，系统配色不该再有任何影响。
 *
 * 另外钉四件事：
 *   4. 切换器的高亮必须正好落在选中的那个按钮上；
 *   5. CSS 里不许再出现 @media (prefers-color-scheme: dark)（防止有人又开一条路径）；
 *   6. 首屏渲染前 data-theme 就要写好（把 JS 主包掐断也必须有值，否则会闪浅色）；
 *   7. 停在「跟随系统」时系统配色变了，页面要实时跟上，且不能靠刷新。
 *
 * 比对时会排除 .theme-switcher 子树：选了不同模式，高亮本来就该落在不同按钮上，
 * 那是「正确的不同」。它的状态由第 4 组断言单独负责。
 *
 * 用法：
 *   node scripts/check-theme.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const WORKSPACE = "C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace";

function loadChromium() {
  const candidates = [
    () => createRequire(`${WORKSPACE}/package.json`)("playwright-core"),
    () => createRequire(import.meta.url)("playwright-core")
  ];
  for (const load of candidates) {
    try {
      return load().chromium;
    } catch {
      /* 试下一个 */
    }
  }
  throw new Error(`没有找到 playwright-core，请先在 ${WORKSPACE} 里执行 npm install playwright-core`);
}

const chromium = loadChromium();
const DIST = join(process.cwd(), "dist");

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
];

function findBrowser() {
  const found = BROWSER_CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error("没有找到 Chrome / Edge");
  return found;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

async function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = join(DIST, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""));
    if (!existsSync(file) || !extname(file)) file = join(DIST, "index.html");
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

if (!existsSync(DIST)) throw new Error("dist/ 不存在，先跑一次 npm run build。");

const problems = [];
const ok = (message) => console.log(`  ok   ${message}`);
const bad = (message) => {
  problems.push(message);
  console.log(`  问题 ${message}`);
};
const check = (condition, good, badMessage) => (condition ? ok(good) : bad(badMessage));

// 抓每个元素的「颜色三件套」+ 渐变/阴影/透明度，按 DOM 顺序对齐。
// 只比这几个属性：它们由 token 和主题规则决定，和内容无关，最适合做等价判断。
const SNAPSHOT_PROPS = ["color", "backgroundColor", "borderTopColor", "backgroundImage", "boxShadow", "opacity"];
const SNAPSHOT = (props) =>
  [...document.querySelectorAll("*")]
    // 必须排除主题切换器本身：选了不同模式，高亮当然落在不同的按钮上。
    // 它「应该」不同，留着比就会把正确的选择指示误判成主题不一致。
    // 它自己的状态由下面第 4 组断言单独钉（高亮必须正好落在选中的那个上）。
    .filter((el) => !el.closest(".theme-switcher"))
    .map((el, index) => {
      const cs = getComputedStyle(el);
      const out = { index, tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 60) };
      props.forEach((prop) => {
        out[prop] = cs[prop];
      });
      return out;
    });

// 页面里得有内容，否则比对的是空壳，断言没有意义。
const SEED = {
  records: Array.from({ length: 4 }, (_, i) => ({
    id: `theme-${i + 1}`,
    subjectId: ["math1", "cs408", "english1", "politics"][i],
    recordType: "paper",
    paperName: `主题检查卷 ${i + 1}`,
    score: 80 + i * 5,
    fullScore: [150, 150, 100, 100][i],
    durationMinutes: 120 + i * 10,
    date: `2026-09-${String(20 + i).padStart(2, "0")}`,
    createdAt: `2026-09-${String(20 + i).padStart(2, "0")}T10:00:00.000Z`,
    note: ""
  })),
  mistakes: [
    {
      id: "theme-m1",
      subjectId: "math1",
      title: "主题检查错题 01",
      knowledgePoint: "高等数学",
      reason: "method",
      difficulty: "中等",
      status: "待复盘",
      sourceRecordId: "",
      questionText: "",
      analysis: "",
      nextReviewAt: "",
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-20T10:00:00.000Z"
    }
  ]
};

const seed = (page) =>
  page.evaluate(
    (payload) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("exam-tracker-v3");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["records", "mistakes"], "readwrite");
          payload.records.forEach((record) => tx.objectStore("records").put(record));
          payload.mistakes.forEach((mistake) => tx.objectStore("mistakes").put(mistake));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    SEED
  );

const READ_APPLIED = () => ({
  theme: document.documentElement.getAttribute("data-theme"),
  colorScheme: document.documentElement.style.colorScheme,
  metaColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
  prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches
});

async function capture(browser, base, colorScheme, mode, route) {
  const context = await browser.newContext({ colorScheme, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/#${route}`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await seed(page);
  await page.evaluate((value) => localStorage.setItem("exam-tracker-theme-mode", value), mode);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  const applied = await page.evaluate(READ_APPLIED);
  const snap = await page.evaluate(SNAPSHOT, SNAPSHOT_PROPS);
  await context.close();
  return { applied, snap };
}

/** 逐元素比对，返回差异列表（空数组 = 完全一致）。 */
function diffSnapshots(a, b) {
  if (a.length !== b.length) return [{ prop: "元素数", left: a.length, right: b.length, tag: "-", cls: "" }];
  const diffs = [];
  for (let i = 0; i < a.length; i += 1) {
    for (const prop of SNAPSHOT_PROPS) {
      if (a[i][prop] !== b[i][prop]) {
        diffs.push({ prop, left: a[i][prop], right: b[i][prop], tag: a[i].tag, cls: a[i].cls });
      }
    }
  }
  return diffs;
}

function reportDiffs(label, diffs) {
  if (!diffs.length) {
    ok(label);
    return;
  }
  const byProp = new Map();
  for (const diff of diffs) byProp.set(diff.prop, (byProp.get(diff.prop) || 0) + 1);
  const summary = [...byProp.entries()].map(([prop, count]) => `${prop}×${count}`).join("、");
  const sample = diffs[0];
  bad(`${label} —— ${diffs.length} 处不同（${summary}）；例：<${sample.tag}.${sample.cls}> ${sample.prop} ${sample.left} vs ${sample.right}`);
}

const ROUTES = ["/", "/records"];

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });

try {
  console.log("检查三种外观模式的一致性\n");

  // ---- 5. 结构：CSS 里不许再有 prefers-color-scheme 这条老路 ----
  {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(`${base}/#/`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const leftover = await page.evaluate(() => {
      const hits = [];
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const text = rule.conditionText || rule.media?.mediaText || "";
            if (/prefers-color-scheme/.test(text)) hits.push(text);
            walk([...rule.cssRules]);
            continue;
          }
          if (rule.cssRules) walk([...rule.cssRules]);
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk([...sheet.cssRules]);
        } catch {
          /* 跨域表跳过 */
        }
      }
      return hits;
    });
    check(
      leftover.length === 0,
      "样式表里已经没有 prefers-color-scheme 分支（深色只剩 data-theme 一条路径）",
      `样式表里还有 ${leftover.length} 处 prefers-color-scheme（${leftover.join(" / ")}）—— 深色又被拆成两条路径了`
    );
    await context.close();
  }

  // ---- 6. 首屏：把 JS 主包掐断，data-theme 也必须已经写好 ----
  {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.route("**/assets/index-*.js", (route) => route.abort());
    await page.goto(`${base}/#/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    check(
      theme === "dark",
      "JS 主包没加载时，系统深色下 <html> 也已经带上 data-theme=\"dark\"（首帧不闪浅色）",
      `JS 主包被掐断后 data-theme 是「${theme}」，应为「dark」—— 主题又变成挂载后才写了`
    );
    await context.close();
  }

  // ---- 7. 实时跟随：停在「跟随系统」时切换系统配色 ----
  {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(`${base}/#/`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(READ_APPLIED);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(400);
    const afterSystem = await page.evaluate(READ_APPLIED);
    check(
      before.theme === "light" && afterSystem.theme === "dark",
      "停在「跟随系统」时，系统配色变了页面立刻跟上（light → dark，无需刷新）",
      `「跟随系统」没跟上系统配色：切换前 ${before.theme}，切换后 ${afterSystem.theme}`,
    );
    // 切到显式「浅色」后，系统再变也不该影响
    await page.evaluate(() => localStorage.setItem("exam-tracker-theme-mode", "light"));
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(400);
    const pinned = await page.evaluate(READ_APPLIED);
    check(
      pinned.theme === "light",
      "显式选了「浅色」后，系统切到深色也拉不动它",
      `显式「浅色」被系统配色带跑了：变成 ${pinned.theme}`
    );
    await context.close();
  }

  // ---- 4. 主题切换器自己的状态指示 ----
  // 上面逐元素比对时把切换器排除了，这里单独钉住它：高亮必须正好落在选中的那个按钮上。
  {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(`${base}/#/`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const LABELS = { system: "跟随系统", light: "浅色", dark: "深色" };
    for (const mode of ["system", "light", "dark"]) {
      await page.evaluate((value) => localStorage.setItem("exam-tracker-theme-mode", value), mode);
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(1200);
      const state = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll(".theme-switcher button")];
        return {
          total: buttons.length,
          active: buttons.filter((b) => b.classList.contains("active")).map((b) => b.getAttribute("aria-label")),
          pressed: buttons.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("aria-label")),
          theme: document.documentElement.getAttribute("data-theme")
        };
      });
      const label = LABELS[mode];
      check(
        state.total === 3 && state.active.length === 1 && state.active[0] === label && state.pressed.length === 1 && state.pressed[0] === label,
        `选中「${label}」时切换器只有它高亮（data-theme=${state.theme}）`,
        `选中「${label}」时高亮不对：active=[${state.active.join("、")}] aria-pressed=[${state.pressed.join("、")}] 共 ${state.total} 个按钮`
      );
    }
    await context.close();
  }

  // ---- A/B/C/D：逐元素比对 ----
  for (const route of ROUTES) {
    const sysDark = await capture(browser, base, "dark", "system", route);
    const expDarkOnDark = await capture(browser, base, "dark", "dark", route);
    const sysLight = await capture(browser, base, "light", "system", route);
    const expLightOnLight = await capture(browser, base, "light", "light", route);
    const expLightOnDark = await capture(browser, base, "dark", "light", route);
    const expDarkOnLight = await capture(browser, base, "light", "dark", route);

    console.log(`\n──── ${route} ────`);

    // data-theme 必须永远有值，且和 color-scheme、theme-color 对得上
    for (const [label, shot] of [
      ["跟随系统", sysDark],
      ["浅色", expLightOnLight],
      ["深色", expDarkOnDark]
    ]) {
      check(
        shot.applied.theme === "light" || shot.applied.theme === "dark",
        `「${label}」写入了 data-theme="${shot.applied.theme}"`,
        `「${label}」的 data-theme 是「${shot.applied.theme}」，不是 light/dark —— 又回到「不写属性靠媒体查询兜」了`
      );
    }
    check(
      expDarkOnDark.applied.colorScheme === "dark" && expLightOnLight.applied.colorScheme === "light",
      "color-scheme 与模式一致（原生控件 / 滚动条不会反色）",
      `color-scheme 不对：深色 ${expDarkOnDark.applied.colorScheme}，浅色 ${expLightOnLight.applied.colorScheme}`
    );
    check(
      expDarkOnDark.applied.metaColor === "#0f141b" && expLightOnLight.applied.metaColor === "#dfe7f0",
      "theme-color 跟着模式走（状态栏颜色不再永远是那个深蓝）",
      `theme-color 不对：深色 ${expDarkOnDark.applied.metaColor}，浅色 ${expLightOnLight.applied.metaColor}`
    );

    reportDiffs(`A. 系统=dark ·「跟随系统」≡「深色」`, diffSnapshots(sysDark.snap, expDarkOnDark.snap));
    reportDiffs(`B. 系统=light ·「跟随系统」≡「浅色」`, diffSnapshots(sysLight.snap, expLightOnLight.snap));
    reportDiffs(`C. 选「浅色」· 系统 light ≡ 系统 dark`, diffSnapshots(expLightOnLight.snap, expLightOnDark.snap));
    reportDiffs(`D. 选「深色」· 系统 light ≡ 系统 dark`, diffSnapshots(expDarkOnLight.snap, expDarkOnDark.snap));
  }
} catch (error) {
  bad(`执行出错：${String(error.message)}`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log(`\n✗ 外观模式检查未通过（${problems.length} 个问题）`);
  process.exit(1);
}
console.log("\n✓ 外观模式检查通过 —— 三种模式只有两套外观，「跟随系统」真的跟着系统。");
