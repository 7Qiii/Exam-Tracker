import { configureCloudSync, getStorageMode, loadState as loadStateDB, saveState as saveStateDB, importData } from "./db.js";
import { drawTrendChart, drawRadarChart, drawPieChart, drawHeatmapChart } from "./charts.js";
import { generateInsights, calculateStudyIntensity } from "./analytics.js";

const defaultSubjects = [
  { id: "math1", name: "数学一", fullScore: 150, targetScore: 115, color: "#18706f" },
  { id: "english1", name: "英语一", fullScore: 100, targetScore: 75, color: "#315b9d" },
  { id: "politics", name: "政治", fullScore: 100, targetScore: 75, color: "#b85c38" },
  { id: "cs408", name: "408", fullScore: 150, targetScore: 115, color: "#8060a8" }
];

const demoRecords = [
  sampleRecord("cs408", "408 综合模拟 01", -8, 86, 150, 180, "知识点遗忘", "操作系统和计网选择题丢分明显。"),
  sampleRecord("math1", "数学一 模拟 01", -6, 92, 150, 170, "时间不够", "后两道大题节奏偏慢。"),
  sampleRecord("english1", "英语一 阅读专项", -4, 68, 100, 90, "审题错误", "阅读细节题需要标定位句。"),
  sampleRecord("politics", "政治 选择题套卷", -2, 63, 100, 75, "不会", "马原概念要回炉。")
];

let state = null;

const els = {
  totalRecords: document.querySelector("#totalRecords"),
  weekRecords: document.querySelector("#weekRecords"),
  targetGap: document.querySelector("#targetGap"),
  subjectList: document.querySelector("#subjectList"),
  subjectId: document.querySelector("#subjectId"),
  paperName: document.querySelector("#paperName"),
  score: document.querySelector("#score"),
  fullScore: document.querySelector("#fullScore"),
  examDate: document.querySelector("#examDate"),
  duration: document.querySelector("#duration"),
  mistakeReason: document.querySelector("#mistakeReason"),
  note: document.querySelector("#note"),
  recordForm: document.querySelector("#recordForm"),
  chartSubject: document.querySelector("#chartSubject"),
  trendCanvas: document.querySelector("#trendCanvas"),
  radarCanvas: document.querySelector("#radarCanvas"),
  pieCanvas: document.querySelector("#pieCanvas"),
  heatmapCanvas: document.querySelector("#heatmapCanvas"),
  recordList: document.querySelector("#recordList"),
  insightsList: document.querySelector("#insightsList"),
  toast: document.querySelector("#toast"),
  exportBtn: document.querySelector("#exportBtn"),
  cloudSyncBtn: document.querySelector("#cloudSyncBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFile: document.querySelector("#importFile"),
  clearDemoBtn: document.querySelector("#clearDemoBtn"),
  manageSubjectsBtn: document.querySelector("#manageSubjectsBtn"),
  subjectDialog: document.querySelector("#subjectDialog"),
  subjectEditor: document.querySelector("#subjectEditor"),
  saveSubjectsBtn: document.querySelector("#saveSubjectsBtn"),
  importDialog: document.querySelector("#importDialog"),
  importMergeBtn: document.querySelector("#importMergeBtn"),
  importReplaceBtn: document.querySelector("#importReplaceBtn")
};

init();

async function init() {
  els.examDate.value = today();
  state = await loadInitialState();
  render();
  bindEvents();
  registerServiceWorker();
}

async function loadInitialState() {
  const loaded = await loadStateDB();
  if (loaded) {
    return loaded;
  }
  return { subjects: defaultSubjects, records: demoRecords };
}

function bindEvents() {
  els.recordForm.addEventListener("submit", addRecord);
  els.subjectId.addEventListener("change", syncFullScore);
  els.chartSubject.addEventListener("change", () => drawAllCharts());
  els.exportBtn.addEventListener("click", exportDataToFile);
  els.cloudSyncBtn.addEventListener("click", handleCloudSync);
  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", handleImportFile);
  els.clearDemoBtn.addEventListener("click", clearRecords);
  els.manageSubjectsBtn.addEventListener("click", openSubjectDialog);
  els.saveSubjectsBtn.addEventListener("click", saveSubjectSettings);
  els.importMergeBtn.addEventListener("click", () => processImport(true));
  els.importReplaceBtn.addEventListener("click", () => processImport(false));
}

async function saveState() {
  try {
    await saveStateDB(state);
  } catch (error) {
    console.error("保存失败", error);
    showToast("保存失败，请重试");
  }
}

function render() {
  renderSelectors();
  renderSummary();
  renderStorageMode();
  renderSubjects();
  renderRecords();
  renderInsights();
  drawAllCharts();
}

function renderStorageMode() {
  if (!els.cloudSyncBtn) return;
  const isCloud = getStorageMode() === "cloud";
  els.cloudSyncBtn.classList.toggle("is-active", isCloud);
  els.cloudSyncBtn.title = isCloud ? "云端同步已开启" : "云端同步未开启";
  els.cloudSyncBtn.setAttribute("aria-label", els.cloudSyncBtn.title);
}

async function handleCloudSync() {
  try {
    const result = await configureCloudSync();
    state = result.state || await loadStateDB();
    render();
    showToast(result.mode === "cloud" ? "云端同步已开启" : "已切换为本机存储");
  } catch (error) {
    console.error("Cloud sync setup failed", error);
    showToast("云端同步失败，请检查密码和 Vercel 配置");
  }
}

function renderSelectors() {
  const subjectOptions = state.subjects
    .map((subject) => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`)
    .join("");
  const currentSubject = els.subjectId.value || state.subjects[0]?.id;
  const currentChart = els.chartSubject.value || currentSubject;

  els.subjectId.innerHTML = subjectOptions;
  els.chartSubject.innerHTML = subjectOptions;
  els.subjectId.value = currentSubject;
  els.chartSubject.value = currentChart;
  syncFullScore();
}

function renderSummary() {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekCount = state.records.filter((record) => new Date(record.date) >= weekStart).length;
  const gaps = state.subjects
    .map((subject) => {
      const avg = subjectAverage(subject.id);
      return avg === null ? null : Math.max(0, subject.targetScore - avg);
    })
    .filter((item) => item !== null);
  const avgGap = gaps.length ? round(gaps.reduce((sum, item) => sum + item, 0) / gaps.length) : null;

  els.totalRecords.textContent = state.records.length;
  els.weekRecords.textContent = weekCount;
  els.targetGap.textContent = avgGap === null ? "--" : avgGap;
}

function renderInsights() {
  if (!state.records.length) {
    els.insightsList.innerHTML = `<p class="empty">记录几套卷后，这里会显示学习建议</p>`;
    return;
  }

  const recordsMap = {};
  state.subjects.forEach((s) => {
    recordsMap[s.id] = recordsFor(s.id);
  });

  const insights = generateInsights(state.subjects, recordsMap);
  const intensity = calculateStudyIntensity(state.records, 7);

  if (!insights.length && intensity.level === 'medium') {
    els.insightsList.innerHTML = `<p class="empty">继续保持当前学习节奏 💪</p>`;
    return;
  }

  let html = '';

  // 学习强度卡片
  const intensityClass = intensity.level === 'high' ? 'insight-success' :
                         intensity.level === 'medium' ? 'insight-info' : 'insight-warning';
  html += `
    <article class="insight-card ${intensityClass}">
      <strong>学习强度</strong>
      <p>近7天练习 ${intensity.totalTests} 次，平均每天 ${intensity.testsPerDay} 次</p>
      <p class="insight-tip">${intensity.suggestion}</p>
    </article>
  `;

  // 各科洞察
  insights.forEach(insight => {
    const typeClass = `insight-${insight.type}`;
    html += `
      <article class="insight-card ${typeClass}">
        <strong>${insight.subject}</strong>
        <p>${insight.message}</p>
      </article>
    `;
  });

  els.insightsList.innerHTML = html;
}

function renderSubjects() {
  if (!state.subjects.length) {
    els.subjectList.innerHTML = `<p class="empty">还没有科目。</p>`;
    return;
  }

  els.subjectList.innerHTML = state.subjects
    .map((subject) => {
      const records = recordsFor(subject.id);
      const avg = subjectAverage(subject.id);
      const latest = records.at(-1);
      const progress = avg === null ? 0 : Math.min(100, (avg / subject.targetScore) * 100);
      const latestText = latest ? `最近：${latest.score}/${latest.fullScore} · ${latest.date}` : "还没有记录";
      const avgText = avg === null ? "--" : avg;
      return `
        <article class="subject-card">
          <div class="subject-top">
            <span class="subject-name">${escapeHtml(subject.name)}</span>
            <span class="subject-score">${avgText} / ${subject.targetScore}</span>
          </div>
          <div class="progress" aria-hidden="true"><span style="width:${progress}%; background:${subject.color}"></span></div>
          <p class="meta">平均分 / 目标分 · ${latestText}</p>
        </article>
      `;
    })
    .join("");
}

function renderRecords() {
  if (!state.records.length) {
    els.recordList.innerHTML = `<p class="empty">还没有模考记录。先保存一套卷子吧。</p>`;
    return;
  }

  const sorted = [...state.records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  els.recordList.innerHTML = sorted
    .map((record) => {
      const subject = findSubject(record.subjectId);
      const pct = round((record.score / record.fullScore) * 100);
      return `
        <article class="record-card">
          <div class="record-top">
            <div>
              <p class="record-title">${escapeHtml(record.paperName)}</p>
              <p class="meta">${escapeHtml(subject?.name || "未知科目")} · ${record.date} · ${record.duration || "--"} 分钟</p>
            </div>
            <button class="delete-record" type="button" onclick="deleteRecord('${record.id}')">删除</button>
          </div>
          <div class="progress" aria-hidden="true"><span style="width:${Math.min(100, pct)}%; background:${subject?.color || "#18706f"}"></span></div>
          <p class="meta">得分 ${record.score}/${record.fullScore}，得分率 ${pct}% · 主要原因：${escapeHtml(record.mistakeReason)}</p>
          ${record.note ? `<p class="meta">复盘：${escapeHtml(record.note)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

async function addRecord(event) {
  event.preventDefault();
  const score = Number(els.score.value);
  const fullScore = Number(els.fullScore.value);

  if (score > fullScore) {
    showToast("得分不能超过满分");
    return;
  }

  state.records.push({
    id: crypto.randomUUID(),
    subjectId: els.subjectId.value,
    paperName: els.paperName.value.trim(),
    score,
    fullScore,
    date: els.examDate.value,
    duration: Number(els.duration.value) || null,
    mistakeReason: els.mistakeReason.value,
    note: els.note.value.trim(),
    createdAt: new Date().toISOString()
  });

  await saveState();
  els.recordForm.reset();
  els.examDate.value = today();
  syncFullScore();
  render();
  showToast("已保存这一套模考");
}

window.deleteRecord = async function deleteRecord(id) {
  state.records = state.records.filter((record) => record.id !== id);
  await saveState();
  render();
  showToast("已删除记录");
};

async function clearRecords() {
  if (!confirm("确定清空所有记录吗？科目设置会保留。")) return;
  state.records = [];
  await saveState();
  render();
  showToast("记录已清空");
}

function syncFullScore() {
  const subject = findSubject(els.subjectId.value);
  if (subject) {
    els.fullScore.value = subject.fullScore;
  }
}

function drawAllCharts() {
  // 绘制单科趋势图
  const subject = findSubject(els.chartSubject.value);
  const records = recordsFor(els.chartSubject.value).slice(-8);
  drawTrendChart(els.trendCanvas, records, subject, true);

  // 绘制雷达图
  const recordsMap = {};
  state.subjects.forEach((s) => {
    recordsMap[s.id] = recordsFor(s.id);
  });
  drawRadarChart(els.radarCanvas, state.subjects, recordsMap);

  // 绘制失分原因饼图
  drawPieChart(els.pieCanvas, state.records);

  // 绘制练习频率热力图
  drawHeatmapChart(els.heatmapCanvas, state.records);
}

function openSubjectDialog() {
  els.subjectEditor.innerHTML = state.subjects
    .map((subject) => `
      <div class="subject-edit-row" data-subject-id="${subject.id}">
        <label>名称<input data-field="name" value="${escapeHtml(subject.name)}" /></label>
        <label>满分<input data-field="fullScore" type="number" min="1" value="${subject.fullScore}" /></label>
        <label>目标<input data-field="targetScore" type="number" min="1" value="${subject.targetScore}" /></label>
      </div>
    `)
    .join("");
  els.subjectDialog.showModal();
}

async function saveSubjectSettings() {
  const rows = [...els.subjectEditor.querySelectorAll(".subject-edit-row")];
  state.subjects = state.subjects.map((subject) => {
    const row = rows.find((item) => item.dataset.subjectId === subject.id);
    return {
      ...subject,
      name: row.querySelector('[data-field="name"]').value.trim() || subject.name,
      fullScore: Number(row.querySelector('[data-field="fullScore"]').value) || subject.fullScore,
      targetScore: Number(row.querySelector('[data-field="targetScore"]').value) || subject.targetScore
    };
  });
  await saveState();
  render();
  els.subjectDialog.close();
  showToast("科目设置已保存");
}

function exportDataToFile() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `11408-records-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("数据已导出");
}

let pendingImportData = null;

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target.result;
      JSON.parse(content); // 验证格式
      pendingImportData = content;
      els.importDialog.showModal();
    } catch (error) {
      showToast("文件格式错误，请选择有效的 JSON 文件");
    }
  };
  reader.readAsText(file);
  event.target.value = ""; // 重置以便再次选择
}

async function processImport(mergeMode) {
  if (!pendingImportData) return;

  const result = await importData(pendingImportData, mergeMode);

  if (result.success) {
    state = await loadStateDB();
    render();
    els.importDialog.close();
    showToast(`数据已${result.mode === "merge" ? "合并" : "导入"}，共 ${result.recordCount} 条记录`);
  } else {
    showToast(`导入失败：${result.error}`);
  }

  pendingImportData = null;
}

function recordsFor(subjectId) {
  return state.records
    .filter((record) => record.subjectId === subjectId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

function subjectAverage(subjectId) {
  const records = recordsFor(subjectId);
  if (!records.length) return null;
  return round(records.reduce((sum, record) => sum + record.score, 0) / records.length);
}

function findSubject(id) {
  return state.subjects.find((subject) => subject.id === id);
}

function sampleRecord(subjectId, paperName, daysAgo, score, fullScore, duration, mistakeReason, note) {
  const date = new Date();
  date.setDate(date.getDate() + daysAgo);
  return {
    id: crypto.randomUUID(),
    subjectId,
    paperName,
    score,
    fullScore,
    date: date.toISOString().slice(0, 10),
    duration,
    mistakeReason,
    note,
    createdAt: date.toISOString()
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}
