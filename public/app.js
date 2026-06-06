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
let overviewPoints = [];
let overviewDateGroups = [];
let trendPoints = [];
const pageSize = 8;
const chartTheme = {
  bg: "#ffffff",
  band: "#f7f8fa",
  grid: "#edf1f6",
  axis: "#d7dde6",
  text: "#64748b",
  ink: "#111827"
};

const els = {
  totalRecords: document.querySelector("#totalRecords"),
  subjectCount: document.querySelector("#subjectCount"),
  bestRate: document.querySelector("#bestRate"),
  totalRecordsHint: document.querySelector("#totalRecordsHint"),
  subjectCountHint: document.querySelector("#subjectCountHint"),
  bestRateHint: document.querySelector("#bestRateHint"),
  pageTitle: document.querySelector("#pageTitle"),
  storageBadge: document.querySelector("#storageBadge"),
  subjectList: document.querySelector("#subjectList"),
  subjectId: document.querySelector("#subjectId"),
  paperName: document.querySelector("#paperName"),
  score: document.querySelector("#score"),
  fullScore: document.querySelector("#fullScore"),
  examDate: document.querySelector("#examDate"),
  note: document.querySelector("#note"),
  recordForm: document.querySelector("#recordForm"),
  summarySubject: document.querySelector("#summarySubject"),
  chartSubject: document.querySelector("#chartSubject"),
  overviewSubject: document.querySelector("#overviewSubject"),
  overviewDateFrom: document.querySelector("#overviewDateFrom"),
  overviewDateTo: document.querySelector("#overviewDateTo"),
  filterSubject: document.querySelector("#filterSubject"),
  searchInput: document.querySelector("#searchInput"),
  dateFrom: document.querySelector("#dateFrom"),
  dateTo: document.querySelector("#dateTo"),
  overviewTrendCanvas: document.querySelector("#overviewTrendCanvas"),
  overviewTooltip: document.querySelector("#overviewTooltip"),
  chartPointInfo: document.querySelector("#chartPointInfo"),
  trendCanvas: document.querySelector("#trendCanvas"),
  trendPointInfo: document.querySelector("#trendPointInfo"),
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

const viewTitles = {
  dashboard: "数据看板",
  records: "成绩管理",
  charts: "图表分析",
  entry: "新增记录"
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
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveView(link.dataset.viewLink, true);
    });
  });
  els.subjectId.addEventListener("change", syncFullScore);
  els.summarySubject.addEventListener("change", renderSummary);
  els.chartSubject.addEventListener("change", drawCharts);
  els.overviewSubject.addEventListener("change", drawOverviewTrend);
  els.overviewDateFrom.addEventListener("change", drawOverviewTrend);
  els.overviewDateTo.addEventListener("change", drawOverviewTrend);
  els.overviewTrendCanvas.addEventListener("click", handleOverviewChartClick);
  els.overviewTrendCanvas.addEventListener("mousemove", handleOverviewChartHover);
  els.overviewTrendCanvas.addEventListener("mouseleave", hideOverviewTooltip);
  els.trendCanvas.addEventListener("click", handleTrendChartClick);
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
  window.addEventListener("hashchange", () => setActiveView(location.hash.replace("#", "") || "dashboard", false));
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
  drawOverviewTrend();
  setActiveView(location.hash.replace("#", "") || "dashboard", false);
}

function renderSelectors() {
  const subjectOptions = state.subjects
    .map((subject) => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`)
    .join("");
  const filterOptions = `<option value="all">全部科目</option>${subjectOptions}`;
  const currentSubject = els.subjectId.value || state.subjects[0]?.id;
  const currentSummary = els.summarySubject.value || "all";
  const currentChart = els.chartSubject.value || currentSubject;
  const currentFilter = els.filterSubject.value || "all";
  const currentOverview = els.overviewSubject.value || "all";

  els.subjectId.innerHTML = subjectOptions;
  els.summarySubject.innerHTML = filterOptions;
  els.chartSubject.innerHTML = subjectOptions;
  els.filterSubject.innerHTML = filterOptions;
  els.overviewSubject.innerHTML = filterOptions;
  els.subjectId.value = currentSubject;
  els.summarySubject.value = currentSummary;
  els.chartSubject.value = currentChart;
  els.filterSubject.value = currentFilter;
  els.overviewSubject.value = currentOverview;
  syncFullScore();
}

function renderSummary() {
  const subjectId = els.summarySubject.value || "all";
  const subject = findSubject(subjectId);
  const records = state.records.filter((record) => subjectId === "all" || record.subjectId === subjectId);
  const scopeName = subject?.name || "全部科目";
  const average = records.length
    ? round(records.reduce((sum, record) => sum + record.score, 0) / records.length)
    : null;
  const best = records.length
    ? records.reduce((max, record) => record.score > max.score ? record : max, records[0])
    : null;

  els.totalRecords.textContent = records.length;
  els.totalRecordsHint.textContent = scopeName;
  els.subjectCount.textContent = average === null ? "--" : average;
  els.subjectCountHint.textContent = subject ? `满分 ${subject.fullScore} 分` : "跨科目仅作粗略参考";
  els.bestRate.textContent = best ? best.score : "--";
  els.bestRateHint.textContent = best ? `${escapeHtml(findSubject(best.subjectId)?.name || scopeName)} · ${best.fullScore} 分卷` : "暂无记录";
}

function renderStorageMode() {
  const isCloud = getStorageMode() === "cloud";
  els.storageBadge.textContent = isCloud ? "云端同步" : "本地缓存";
}

function setActiveView(view, updateHash) {
  const nextView = viewTitles[view] ? view : "dashboard";
  document.querySelectorAll("[data-view]").forEach((page) => {
    page.classList.toggle("is-active", page.dataset.view === nextView);
  });
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.viewLink === nextView);
  });
  els.pageTitle.textContent = viewTitles[nextView];
  if (updateHash && location.hash !== `#${nextView}`) {
    history.pushState(null, "", `#${nextView}`);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
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

function drawOverviewTrend() {
  const canvas = els.overviewTrendCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 30, right: 28, bottom: 42, left: 54 };
  const plot = chartPlot(width, height, pad);
  const records = overviewRecords();
  const selectedSubject = els.overviewSubject.value;
  const visibleSubjects = state.subjects.filter((subject) => {
    return (selectedSubject === "all" || subject.id === selectedSubject)
      && records.some((record) => record.subjectId === subject.id);
  });
  const yMax = niceChartMax(Math.max(1, ...visibleSubjects.map((subject) => subject.fullScore), ...records.map((record) => record.fullScore)));
  overviewPoints = [];
  overviewDateGroups = [];
  ctx.clearRect(0, 0, width, height);
  drawChartFrame(ctx, width, height, pad, { yMax, suffix: "分" });

  if (!records.length) {
    drawEmptyChart(ctx, width, height, "暂无匹配成绩数据");
    return;
  }

  const allDates = [...new Set(records.map((record) => record.date))].sort();
  const xForIndex = (index) => allDates.length === 1 ? plot.left + plot.width / 2 : plot.left + (plot.width / (allDates.length - 1)) * index;

  allDates.forEach((date, index) => {
    const x = xForIndex(index);
    overviewDateGroups.push({ date, x, points: [] });
  });

  visibleSubjects.forEach((subject) => {
    const subjectRecords = records
      .filter((record) => record.subjectId === subject.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    const points = subjectRecords.map((record) => {
      const dateIndex = Math.max(0, allDates.indexOf(record.date));
      const rate = (record.score / record.fullScore) * 100;
      const x = xForIndex(dateIndex);
      const y = plot.bottom - (record.score / yMax) * plot.height;
      const point = { x, y, record, subject, rate };
      overviewDateGroups[dateIndex]?.points.push(point);
      return point;
    });

    ctx.strokeStyle = subject.color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    points.forEach((point) => {
      ctx.fillStyle = subject.color;
      ctx.strokeStyle = subject.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      overviewPoints.push(point);
    });
  });

  drawXAxisLabels(ctx, allDates, plot);
  drawLegend(ctx, visibleSubjects, plot.left, 18, width - pad.right);
}

function handleOverviewChartClick(event) {
  const { x, y } = chartPointer(els.overviewTrendCanvas, event);
  const hit = overviewPoints.find((point) => Math.hypot(point.x - x, point.y - y) <= 14);

  if (!hit) {
    els.chartPointInfo.textContent = "点击折线上的节点查看试卷名称、日期和得分。";
    return;
  }

  els.chartPointInfo.innerHTML = chartPointDetail(hit);
}

function handleOverviewChartHover(event) {
  if (!overviewDateGroups.length) return;
  const { x } = chartPointer(els.overviewTrendCanvas, event);
  const nearest = overviewDateGroups.reduce((best, group) => {
    const distance = Math.abs(group.x - x);
    return !best || distance < best.distance ? { group, distance } : best;
  }, null);

  if (!nearest || nearest.distance > 48 || !nearest.group.points.length) {
    hideOverviewTooltip();
    return;
  }

  const records = nearest.group.points
    .slice()
    .sort((a, b) => b.rate - a.rate);
  const total = records.length;
  const rows = records.map((point) => `
    <div class="tooltip-row">
      <span class="tooltip-dot" style="background:${point.subject.color}"></span>
      <span>${escapeHtml(point.subject.name)} · ${escapeHtml(point.record.paperName)}</span>
      <strong>${point.record.score}/${point.record.fullScore}</strong>
    </div>
  `).join("");

  showOverviewTooltip(event, `
    <div class="tooltip-title">${formatChartDate(nearest.group.date)}</div>
    <div class="tooltip-row total"><span>总计</span><strong>${total}</strong></div>
    ${rows}
  `);
}

function showOverviewTooltip(event, html) {
  const tooltip = els.overviewTooltip;
  const box = tooltip.parentElement.getBoundingClientRect();
  tooltip.innerHTML = html;
  tooltip.classList.add("show");
  tooltip.setAttribute("aria-hidden", "false");

  const tooltipRect = tooltip.getBoundingClientRect();
  const offset = 14;
  let left = event.clientX - box.left + offset;
  let top = event.clientY - box.top - tooltipRect.height / 2;
  left = Math.min(Math.max(10, left), box.width - tooltipRect.width - 10);
  top = Math.min(Math.max(10, top), box.height - tooltipRect.height - 10);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideOverviewTooltip() {
  els.overviewTooltip.classList.remove("show");
  els.overviewTooltip.setAttribute("aria-hidden", "true");
}

function handleTrendChartClick(event) {
  const { x, y } = chartPointer(els.trendCanvas, event);
  const hit = trendPoints.find((point) => Math.hypot(point.x - x, point.y - y) <= 14);

  if (!hit) {
    els.trendPointInfo.textContent = "点击折线上的节点查看试卷名称、日期和得分。";
    return;
  }

  els.trendPointInfo.innerHTML = chartPointDetail(hit);
}

function chartPointDetail(point) {
  const pct = round((point.record.score / point.record.fullScore) * 100);
  return `
    <strong>${escapeHtml(point.record.paperName)}</strong>
    ${point.record.date} · ${escapeHtml(point.subject.name)} · ${point.record.score}/${point.record.fullScore} (${pct}%)
  `;
}

function drawTrendChart(canvas, records, subject) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 28, right: 24, bottom: 38, left: 50 };
  const plot = chartPlot(width, height, pad);
  ctx.clearRect(0, 0, width, height);
  trendPoints = [];
  const yMax = niceChartMax(subject?.fullScore || Math.max(1, ...records.map((record) => record.fullScore)));
  drawChartFrame(ctx, width, height, pad, { yMax, suffix: "分" });

  if (!records.length || !subject) {
    els.trendPointInfo.textContent = "点击折线上的节点查看试卷名称、日期和得分。";
    drawEmptyChart(ctx, width, height, "选择科目并记录成绩后显示趋势");
    return;
  }

  const points = records.map((record, index) => {
    const rate = (record.score / record.fullScore) * 100;
    const x = records.length === 1 ? plot.left + plot.width / 2 : plot.left + (plot.width / (records.length - 1)) * index;
    const y = plot.bottom - (record.score / yMax) * plot.height;
    return { x, y, record, subject, rate };
  });
  trendPoints = points;
  els.trendPointInfo.textContent = "点击折线上的节点查看试卷名称、日期和得分。";

  ctx.strokeStyle = subject.color;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  points.forEach((point) => {
    ctx.fillStyle = subject.color;
    ctx.strokeStyle = subject.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  drawXAxisLabels(ctx, records.map((record) => record.date), plot);
}

function drawDistributionChart(canvas, records) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 28, right: 22, bottom: 38, left: 46 };
  const plot = chartPlot(width, height, pad);
  ctx.clearRect(0, 0, width, height);

  if (!records.length) {
    drawChartFrame(ctx, width, height, pad, { yMax: 4, suffix: "" });
    drawEmptyChart(ctx, width, height, "暂无筛选结果");
    return;
  }

  const buckets = [
    { label: "140+", min: 140, max: Infinity, count: 0 },
    { label: "130-140", min: 130, max: 139.999, count: 0 },
    { label: "120-125", min: 120, max: 124.999, count: 0 },
    { label: "125-130", min: 125, max: 129.999, count: 0 },
    { label: "110-120", min: 110, max: 119.999, count: 0 },
    { label: "100-110", min: 100, max: 109.999, count: 0 }
  ];

  records.forEach((record) => {
    const bucket = buckets.find((item) => record.score >= item.min && record.score <= item.max);
    if (bucket) bucket.count += 1;
  });

  const maxCount = Math.max(1, ...buckets.map((item) => item.count));
  const yMax = Math.max(4, maxCount);
  drawChartFrame(ctx, width, height, pad, { yMax, suffix: "" });
  const step = plot.width / buckets.length;
  const barWidth = Math.min(54, step * 0.52);
  buckets.forEach((bucket, index) => {
    const barHeight = (plot.height * bucket.count) / yMax;
    const x = plot.left + index * step + (step - barWidth) / 2;
    const y = plot.bottom - barHeight;
    const gradient = ctx.createLinearGradient(0, y, 0, plot.bottom);
    gradient.addColorStop(0, "#2563eb");
    gradient.addColorStop(1, "#67e8f9");
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, barWidth, barHeight, 6);
    ctx.fill();
    ctx.fillStyle = chartTheme.text;
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(bucket.label, x + barWidth / 2, height - 12);
    ctx.fillStyle = chartTheme.ink;
    ctx.font = "700 13px Microsoft YaHei, sans-serif";
    ctx.fillText(bucket.count, x + barWidth / 2, Math.max(18, y - 8));
  });
}

function chartPlot(width, height, pad) {
  return {
    left: pad.left,
    right: width - pad.right,
    top: pad.top,
    bottom: height - pad.bottom,
    width: width - pad.left - pad.right,
    height: height - pad.top - pad.bottom
  };
}

function drawChartFrame(ctx, width, height, pad, options = {}) {
  const plot = chartPlot(width, height, pad);
  const yMax = options.yMax || 100;
  const ticks = chartTicks(yMax);
  ctx.fillStyle = chartTheme.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = chartTheme.band;
  ctx.fillRect(plot.left, plot.top, plot.width, plot.height);

  ctx.strokeStyle = chartTheme.grid;
  ctx.lineWidth = 1;
  ticks.forEach((value) => {
    const y = plot.bottom - (value / yMax) * plot.height;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillStyle = chartTheme.text;
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${value}${options.suffix || ""}`, plot.left - 10, y + 4);
  });

  ctx.strokeStyle = chartTheme.axis;
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom);
  ctx.stroke();
}

function chartTicks(yMax) {
  if (yMax <= 4) return [4, 3, 2, 1, 0];
  if (yMax === 150) return [150, 100, 50, 0];
  if (yMax >= 200 && yMax <= 300 && yMax % 50 === 0) {
    return Array.from({ length: yMax / 50 + 1 }, (_, index) => yMax - index * 50);
  }
  return [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(yMax * ratio));
}

function drawXAxisLabels(ctx, labels, plot) {
  if (!labels.length) return;
  const indexes = labels.length <= 4
    ? labels.map((_, index) => index)
    : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];
  ctx.fillStyle = chartTheme.text;
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  indexes.forEach((index) => {
    const x = labels.length === 1 ? plot.left + plot.width / 2 : plot.left + (plot.width / (labels.length - 1)) * index;
    ctx.fillText(formatChartDate(labels[index]), x, plot.bottom + 24);
  });
}

function drawLegend(ctx, subjects, x, y, maxX) {
  let currentX = x;
  ctx.font = "12px Microsoft YaHei, sans-serif";
  subjects.forEach((subject) => {
    const labelWidth = Math.min(120, ctx.measureText(subject.name).width + 30);
    if (currentX + labelWidth > maxX) return;
    ctx.fillStyle = subject.color;
    ctx.beginPath();
    ctx.arc(currentX + 4, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#475569";
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(subject.name, currentX + 14, y);
    currentX += labelWidth + 12;
  });
}

function chartPointer(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function formatChartDate(date) {
  const parts = String(date).split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : String(date);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function overviewRecords() {
  const subject = els.overviewSubject.value || "all";
  const from = els.overviewDateFrom.value;
  const to = els.overviewDateTo.value;

  return state.records
    .filter((record) => subject === "all" || record.subjectId === subject)
    .filter((record) => !from || record.date >= from)
    .filter((record) => !to || record.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

function niceChartMax(value) {
  const max = Math.max(1, Number(value) || 1);
  if (max <= 100) return 100;
  if (max <= 150) return 150;
  if (max <= 200) return 200;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function drawEmptyChart(ctx, width, height, text) {
  ctx.fillStyle = "#64748b";
  ctx.font = "14px Microsoft YaHei, sans-serif";
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
