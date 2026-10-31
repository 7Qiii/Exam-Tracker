import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

let chromium;
for (const base of [import.meta.url, "C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace/package.json"]) {
  try { chromium = createRequire(base)("playwright-core").chromium; break; } catch { /* Try bundled runtime. */ }
}
assert.ok(chromium, "playwright-core is required");
const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const server = await createServer({
  configFile: false, plugins: [vue()], server: { host: "127.0.0.1", port: 0 },
  define: { "import.meta.env.VITE_SUPABASE_URL": '""', "import.meta.env.VITE_SUPABASE_ANON_KEY": '""' }
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/#/records');
  await page.waitForSelector('main .page-stack');
  await page.evaluate(async () => {
    const { useTrackerStore } = await import('/src/stores/tracker.js');
    window.entryStore = useTrackerStore(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia);
    window.entryStore.records = Array.from({ length: 3000 }, (_, index) => ({ id: 'perf-' + index, subjectId: 'math1', recordType: 'paper', paperName: '26张八第' + index + '套', score: 90, fullScore: 150, date: '2026-10-30', createdAt: new Date(2026, 0, 1, 0, index).toISOString(), note: '' }));
  });
  await page.waitForTimeout(500);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const timings = await page.evaluate(async () => {
    const { nextTick } = await import('/node_modules/.vite/deps/vue.js');
    const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const start = performance.now();
    [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '新增成绩').click();
    await nextTick(); await paint();
    const opened = performance.now() - start;
    const name = document.querySelector('.record-form input[list]') || document.querySelector('.record-form input[placeholder*="张八"]');
    const score = document.querySelector('.record-form input[placeholder="本次得分"]');
    const keys = [];
    for (const value of ['2', '27', '27张', '27张八', '27张八1']) {
      const t = performance.now(); name.value = value; name.dispatchEvent(new Event('input', { bubbles: true })); await paint(); keys.push(performance.now()-t);
    }
    for (const value of ['1','12','120']) {
      const t = performance.now(); score.value = value; score.dispatchEvent(new Event('input', { bubbles: true })); await paint(); keys.push(performance.now()-t);
    }
    const save = performance.now();
    document.querySelector('.record-form button[type="submit"]').click();
    while(document.querySelector('.record-form')) await paint();
    return { openMs: Math.round(opened), inputMaxMs: Math.round(Math.max(...keys)), saveMs: Math.round(performance.now()-save) };
  });
  assert.ok(timings.openMs < 750, "Opening the form should not block for 750ms");
  assert.ok(timings.inputMaxMs < 250, "Typing should not block for 250ms");
  assert.ok(timings.saveMs < 1000, "Local saving should finish within 1s");
  console.log("3000 records, 4x CPU throttle: " + JSON.stringify(timings));
} finally { await browser?.close(); await server.close(); }
