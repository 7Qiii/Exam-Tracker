import { configureCloudSync, getStorageMode, loadState as loadStateDB, saveState as saveStateDB, importData } from "./db.js";

const defaultSubjects = [
  { id: "math1", name: "数学一", fullScore: 150, targetScore: 115, color: "#0f766e" },
  { id: "english1", name: "英语一", fullScore: 100, targetScore: 75, color: "#2563eb" },
  { id: "politics", name: "政治", fullScore: 100, targetScore: 75, color: "#dc2626" },
  { id: "cs408", name: "408", fullScore: 150, targetScore: 115, color: "#7c3aed" }
];

const demoRecords = [
  sampleRecord("cs408", "408 综合模拟 01", -8, 86, 150, "操作系统和计网选择题丢分明显。"),
  sampleRecord("math1", "数学一 模拟 01", -6, 92, 150, "后两道大题节奏偏慢。"),
  sampleRecord("english1", "英语一 阅读专项", -4, 68, 100, "阅读细节题需要标定位句。"),
  sampleRecord("politics", "政治 选择题套卷", -2, 63, 100, "马原概念要回炉。")
];

let state = null;
let currentPage = 1;
let pendingImportData = null;
let pendingImportKind = "json";
const pageSize = 8;

const els = {
  totalRecords: document.querySelector("#totalRecords"),
  weekRecords: document.querySelector("#weekRecords"),
  targetGap: document.querySelector("#targetGap"),
  filteredRecords: document.querySelector("#filteredRecords"),
  storageBadge: document.querySelector("#storageBadge"),
  subjectList: document.querySelector("#subjectList"),
  subjectId: document.querySelector("#subjectId"),
  paperName: document.querySelector("#paperName"),
  score: document.querySelector("#score"),
  fullScore: document.querySelector("#fullScore"),
  examDate: document.querySelector("#examDate"),
  note: document.querySelector("#note"),
  recordForm: document.querySelector("#recordForm"),
  chartSubject: document.querySelector("#chartSubject"),
  filterSubject: document.querySelector("#filterSubject"),
  searchInput: document.querySelector("#searchInput"),
  dateFrom: document.querySelector("#dateFrom"),
  dateTo: document.querySelector("#dateTo"),
  trendCanvas: document.querySelector("#trendCanvas"),
  distributionCanvas: document.querySelector("#distributionCanvas"),
  recordTableBody: document.querySelector("#recordTableBody"),
  pageInfo: document.querySelector("#pageInfo"),
  prevPageBtn: document.querySelector("#prevPageBtn"),
  nextPageBtn: document.querySelector("#nextPageBtn"),
  toast: document.querySelector("#toast"),
  exportBtn: document.querySelector("#exportBtn"),
  cloudSyncBtn: document.querySelector("#cloudSyncBtn"),
  loginSyncBtn: document.querySelector("#loginSyncBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFile: document.querySelector("#importFile"),
  clearDemoBtn: document.querySelector("#clearDemoBtn"),
  manageSubjectsBtn: document.querySelector("#manageSubjectsBtn"),
  subjectDialog: document.querySelector("#subjectDialog"),
  subjectEditor: document.querySelector("#subjectEditor"),
  saveSubjectsBtn: document.querySelector("#saveSubjectsBtn"),
  importDialog: document.querySelector("#importDialog"),
  importMergeBtn: document.querySelector("#importMergeBtn"),
  importReplaceBtn: document.querySelector("#importReplaceBtn"),
  detailDialog: document.querySelector("#detailDialog"),
  recordDetail: document.querySelector("#recordDetail"),
  closeDetailBtn: document.querySelector("#closeDetailBtn")
};

init();

async function init() {
  els.examDate.value = today();
  state = await loadInitialState();
  bindEvents();
  render();
  registerServiceWorker();
}

async function loadInitialState() {
  const loaded = await loadStateDB();
  return loaded || { subjects: defaultSubjects, records: demoRecords };
}

function bindEvents() {
  els.recordForm.addEventListener("submit", addRecord);
  els.subjectId.addEventListener("change", syncFullScore);
  els.chartSubject.addEventListener("change", drawCharts);
  els.filterSubject.addEventListener("change", resetPageAndRender);
  els.searchInput.addEventListener("input", resetPageAndRender);
  els.dateFrom.addEventListener("change", resetPageAndRender);
  els.dateTo.addEventListener("change", resetPageAndRender);
  els.prevPageBtn.addEventListener("click", () => changePage(-1));
  els.nextPageBtn.addEventListener("click", () => changePage(1));
  els.exportBtn.addEventListener("click", exportDataFiles);
  els.cloudSyncBtn.addEventListener("click", handleCloudSync);
  els.loginSyncBtn.addEventListener("click", handleCloudSync);
  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", handleImportFile);
  els.clearDemoBtn.addEventListener("click", clearRecords);
  els.manageSubjectsBtn.addEventListener("click", openSubjectDialog);
  els.saveSubjectsBtn.addEventListener("click", saveSubjectSettings);
  els.importMergeBtn.addEventListener("click", () => processImport(true));
  els.importReplaceBtn.addEventListener("click", () => processImport(false));
  els.closeDetailBtn.addEventListener("click", () => els.detailDialog.close());
}

async function saveState() {
  try {
    await saveStateDB(state);
  } catch (error) {
    console.error("Save failed", error);
    showToast("保存失败，请检查云端配置或稍后重试");
  }
}

function render() {
  renderSelectors();
  renderSummary();
  renderStorageMode();
  renderSubjects();
  renderTable();
  drawCharts();
}

function renderSelectors() {
  const subjectOptions = state.subjects
    .map((subject) => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`)
    .join("");
  const filterOptions = `<option value="all">全部科目</option>${subjectOptions}`;
  const currentSubject = els.subjectId.value || state.subjects[0]?.id;
  const currentChart = els.chartSubject.value || currentSubject;
  const currentFilter = els.filterSubject.value || "all";

  els.subjectId.innerHTML = subjectOptions;
  els.chartSubject.innerHTML = subjectOptions;
  els.filterSubject.innerHTML = filterOptions;
  els.subjectId.value = currentSubject;
  els.chartSubject.value = currentChart;
  els.filterSubject.value = currentFilter;
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
  els.filteredRecords.textContent = filteredRecords().length;
}

function renderStorageMode() {
  const isCloud = getStorageMode() === "cloud";
  els.storageBadge.textContent = isCloud ? "云端同步" : "本地缓存";
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
      const latestText = latest ? `最近 ${latest.score}/${latest.fullScore} · ${latest.date}` : "暂无记录";
      return `
        <article class="subject-card">
          <div class="subject-top">
            <span class="subject-name">${escapeHtml(subject.name)}</span>
            <span class="subject-score">${avg === null ? "--" : avg} / ${subject.targetScore}</span>
          </div>
          <div class="progress" aria-hidden="true"><span style="width:${progress}%; background:${subject.color}"></span></div>
          <p class="meta">平均分 / 目标分 · ${latestText}</p>
        </article>
      `;
    })
    .join("");
}

function renderTable() {
  const rows = filteredRecords();
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  if (!pageRows.length) {
    els.recordTableBody.innerHTML = `<tr><td colspan="6" class="empty">暂无匹配记录。</td></tr>`;
  } else {
    els.recordTableBody.innerHTML = pageRows
      .map((record) => {
        const subject = findSubject(record.subjectId);
        const pct = round((record.score / record.fullScore) * 100);
        return `
          <tr>
            <td>${record.date}</td>
            <td>${escapeHtml(subject?.name || "未知科目")}</td>
            <td><strong>${escapeHtml(record.paperName)}</strong></td>
            <td>${record.score}/${record.fullScore}</td>
            <td>${pct}%</td>
            <td>
              <div class="table-actions">
                <button class="link-button" type="button" onclick="showRecordDetail('${record.id}')">详情</button>
                <button class="delete-record" type="button" onclick="deleteRecord('${record.id}')">删除</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  els.pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页 · 共 ${rows.length} 条`;
  els.prevPageBtn.disabled = currentPage <= 1;
  els.nextPageBtn.disabled = currentPage >= totalPages;
  els.filteredRecords.textContent = rows.length;
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
    note: els.note.value.trim(),
    createdAt: new Date().toISOString()
  });

  await saveState();
  els.recordForm.reset();
  els.examDate.value = today();
  syncFullScore();
  resetPageAndRender();
  showToast("成绩记录已保存");
}

window.deleteRecord = async function deleteRecord(id) {
  state.records = state.records.filter((record) => record.id !== id);
  await saveState();
  render();
  showToast("记录已删除");
};

window.showRecordDetail = function showRecordDetail(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  const subject = findSubject(record.subjectId);
  const pct = round((record.score / record.fullScore) * 100);
  els.recordDetail.innerHTML = `
    <div class="record-detail-row"><strong>科目</strong><span>${escapeHtml(subject?.name || "未知科目")}</span></div>
    <div class="record-detail-row"><strong>试卷</strong><span>${escapeHtml(record.paperName)}</span></div>
    <div class="record-detail-row"><strong>日期</strong><span>${record.date}</span></div>
    <div class="record-detail-row"><strong>分数</strong><span>${record.score}/${record.fullScore} (${pct}%)</span></div>
    <div><strong>复盘备注</strong><p class="meta">${escapeHtml(record.note || "暂无备注")}</p></div>
  `;
  els.detailDialog.showModal();
};

async function clearRecords() {
  if (!confirm("确定清空所有记录吗？科目设置会保留。")) return;
  state.records = [];
  await saveState();
  currentPage = 1;
  render();
  showToast("记录已清空");
}

function resetPageAndRender() {
  currentPage = 1;
  render();
}

function changePage(delta) {
  currentPage += delta;
  renderTable();
}

function syncFullScore() {
  const subject = findSubject(els.subjectId.value);
  if (subject) {
    els.fullScore.value = subject.fullScore;
  }
}

async function handleCloudSync() {
  try {
    const result = await configureCloudSync();
    state = result.state || await loadStateDB() || state;
    render();
    showToast(result.mode === "cloud" ? "云端同步已开启" : "已切换为本地缓存");
  } catch (error) {
    console.error("Cloud sync setup failed", error);
    showToast("云端同步失败，请检查密码和 Vercel 配置");
  }
}

function drawCharts() {
  const subject = findSubject(els.chartSubject.value);
  const records = recordsFor(els.chartSubject.value).slice(-12);
  drawTrendChart(els.trendCanvas, records, subject);
  drawDistributionChart(els.distributionCanvas, filteredRecords());
}

function drawTrendChart(canvas, records, subject) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = 42;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height, pad);

  if (!records.length || !subject) {
    drawEmptyChart(ctx, width, height, "选择科目并记录成绩后显示趋势");
    return;
  }

  const maxScore = Math.max(subject.fullScore, ...records.map((record) => record.fullScore));
  const points = records.map((record, index) => {
    const x = records.length === 1 ? width / 2 : pad + ((width - pad * 2) / (records.length - 1)) * index;
    const y = height - pad - (record.score / maxScore) * (height - pad * 2);
    return { x, y, record };
  });

  const targetY = height - pad - (subject.targetScore / maxScore) * (height - pad * 2);
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(pad, targetY);
  ctx.lineTo(width - pad, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = subject.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  points.forEach((point) => {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = subject.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawDistributionChart(canvas, records) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = 42;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!records.length) {
    drawEmptyChart(ctx, width, height, "暂无筛选结果");
    return;
  }

  const buckets = [
    { label: "0-59", min: 0, max: 59, count: 0 },
    { label: "60-69", min: 60, max: 69, count: 0 },
    { label: "70-79", min: 70, max: 79, count: 0 },
    { label: "80-89", min: 80, max: 89, count: 0 },
    { label: "90-100", min: 90, max: 100, count: 0 }
  ];

  records.forEach((record) => {
    const rate = (record.score / record.fullScore) * 100;
    const bucket = buckets.find((item) => rate >= item.min && rate <= item.max) || buckets.at(-1);
    bucket.count += 1;
  });

  const maxCount = Math.max(1, ...buckets.map((item) => item.count));
  const barWidth = (width - pad * 2) / buckets.length - 16;
  buckets.forEach((bucket, index) => {
    const barHeight = ((height - pad * 2) * bucket.count) / maxCount;
    const x = pad + index * ((width - pad * 2) / buckets.length) + 8;
    const y = height - pad - barHeight;
    ctx.fillStyle = "#0f766e";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#64748b";
    ctx.font = "18px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(bucket.label, x + barWidth / 2, height - 14);
    ctx.fillText(bucket.count, x + barWidth / 2, y - 10);
  });
}

function drawGrid(ctx, width, height, pad) {
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = pad + ((height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
}

function drawEmptyChart(ctx, width, height, text) {
  ctx.fillStyle = "#64748b";
  ctx.font = "24px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);
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

function exportDataFiles() {
  downloadFile(`exam-tracker-${today()}.json`, JSON.stringify(state, null, 2), "application/json");
  downloadFile(`exam-tracker-${today()}.csv`, toCsv(state.records), "text/csv;charset=utf-8");
  showToast("已导出 JSON 和 CSV");
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingImportKind = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
    pendingImportData = String(e.target.result || "");
    els.importDialog.showModal();
  };
  reader.readAsText(file);
  event.target.value = "";
}

async function processImport(mergeMode) {
  if (!pendingImportData) return;
  const payload = pendingImportKind === "csv" ? csvToState(pendingImportData) : pendingImportData;
  const result = await importData(typeof payload === "string" ? payload : JSON.stringify(payload), mergeMode);

  if (result.success) {
    state = await loadStateDB();
    currentPage = 1;
    render();
    els.importDialog.close();
    showToast(`导入成功，共 ${result.recordCount} 条记录`);
  } else {
    showToast(`导入失败：${result.error}`);
  }

  pendingImportData = null;
}

function filteredRecords() {
  const keyword = els.searchInput.value.trim().toLowerCase();
  const subject = els.filterSubject.value;
  const from = els.dateFrom.value;
  const to = els.dateTo.value;

  return [...state.records]
    .filter((record) => subject === "all" || record.subjectId === subject)
    .filter((record) => !keyword || `${record.paperName} ${record.note || ""}`.toLowerCase().includes(keyword))
    .filter((record) => !from || record.date >= from)
    .filter((record) => !to || record.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
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

function sampleRecord(subjectId, paperName, daysAgo, score, fullScore, note) {
  const date = new Date();
  date.setDate(date.getDate() + daysAgo);
  return {
    id: crypto.randomUUID(),
    subjectId,
    paperName,
    score,
    fullScore,
    date: date.toISOString().slice(0, 10),
    note,
    createdAt: date.toISOString()
  };
}

function toCsv(records) {
  const header = ["subject", "paperName", "score", "fullScore", "date", "note"];
  const rows = records.map((record) => [
    findSubject(record.subjectId)?.name || record.subjectId,
    record.paperName,
    record.score,
    record.fullScore,
    record.date,
    record.note || ""
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvToState(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() || "").map((item) => item.trim());
  const records = lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const subject = state.subjects.find((item) => item.name === row.subject || item.id === row.subject) || state.subjects[0];
    return {
      id: crypto.randomUUID(),
      subjectId: subject.id,
      paperName: row.paperName || "未命名试卷",
      score: Number(row.score) || 0,
      fullScore: Number(row.fullScore) || subject.fullScore,
      date: row.date || today(),
      note: row.note || "",
      createdAt: new Date().toISOString()
    };
  });
  return { subjects: state.subjects, records };
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2000);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}
