export const exportColumnGroups = [
  {
    id: "basic",
    label: "基础信息",
    columns: [
      { id: "subject", label: "科目", width: 14 },
      { id: "year", label: "年份", width: 10 },
      { id: "date", label: "日期", width: 14 },
      { id: "record", label: "记录名称", width: 30 },
      { id: "type", label: "类型", width: 12 },
      { id: "variant", label: "卷型", width: 12 }
    ]
  },
  {
    id: "score",
    label: "成绩信息",
    columns: [
      { id: "score", label: "得分", width: 12 },
      { id: "fullScore", label: "满分", width: 12 },
      { id: "rate", label: "得分率", width: 12 }
    ]
  },
  {
    id: "exercise",
    label: "习题详情",
    columns: [
      { id: "exerciseBook", label: "习题册", width: 22 },
      { id: "exercisePage", label: "页码", width: 10 },
      { id: "exerciseQuestion", label: "题号", width: 10 }
    ]
  },
  {
    id: "review",
    label: "复盘信息",
    columns: [
      { id: "duration", label: "用时", width: 14 },
      { id: "sync", label: "同步状态", width: 14 },
      { id: "note", label: "复盘备注", width: 38 }
    ]
  }
];

export const exportColumnOptions = exportColumnGroups.flatMap((group) => group.columns);

export const exportThemeOptions = [
  { id: "ocean", label: "清爽蓝", header: "2563EB", accent: "DBEAFE", stripe: "F8FBFF" },
  { id: "forest", label: "森林绿", header: "047857", accent: "D1FAE5", stripe: "F7FCF9" },
  { id: "sunset", label: "暖橙色", header: "C2410C", accent: "FFEDD5", stripe: "FFFBF7" },
  { id: "graphite", label: "石墨灰", header: "344054", accent: "E4E7EC", stripe: "F8F9FB" }
];

export async function exportRecordsToExcel({
  records = [],
  subjects = [],
  columns = exportColumnOptions.map((column) => column.id),
  sheetMode = "single",
  theme = "ocean",
  filename = "成绩导出",
  includeSummary = false
} = {}) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const themeConfig = exportThemeOptions.find((item) => item.id === theme) || exportThemeOptions[0];
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const selectedColumns = exportColumnOptions.filter((column) => columns.includes(column.id));
  const safeRecords = [...records].sort(
    (a, b) =>
      String(a.subjectId || "").localeCompare(String(b.subjectId || "")) ||
      String(getYear(b) || "").localeCompare(String(getYear(a) || "")) ||
      String(b.date || "").localeCompare(String(a.date || "")) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  workbook.creator = "Exam Tracker";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  let groups =
    sheetMode === "subject"
      ? groupRecordsBySubject(safeRecords, subjectMap)
      : [{ name: "成绩明细", records: safeRecords }];
  if (!groups.length) groups = [{ name: "成绩明细", records: [] }];
  groups.forEach((group) => addRecordSheet(workbook, group.name, group.records, subjectMap, selectedColumns, themeConfig));

  if (includeSummary) addSummarySheet(workbook, safeRecords, themeConfig);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, `${normalizeFilename(filename)}.xlsx`);
}

function addSummarySheet(workbook, records, theme) {
  const sheet = workbook.addWorksheet("导出概览");
  const scoredRecords = records.filter((record) => Number(record.fullScore) > 0);
  const totalScore = scoredRecords.reduce((sum, record) => sum + numberOrZero(record.score), 0);
  const totalFullScore = scoredRecords.reduce((sum, record) => sum + numberOrZero(record.fullScore), 0);
  const averageRate = totalFullScore ? totalScore / totalFullScore : 0;
  const subjectCount = new Set(records.map((record) => record.subjectId)).size;

  sheet.columns = [
    { header: "项目", key: "label", width: 22 },
    { header: "数值", key: "value", width: 32 }
  ];
  sheet.addRows([
    { label: "导出时间", value: new Date().toLocaleString("zh-CN") },
    { label: "成绩记录", value: records.length },
    { label: "科目数量", value: subjectCount },
    { label: "累计得分", value: totalScore },
    { label: "累计满分", value: totalFullScore },
    { label: "总体得分率", value: averageRate }
  ]);
  styleHeader(sheet.getRow(1), theme.header);
  sheet.getCell("B2").numFmt = "@";
  sheet.getCell("B7").numFmt = "0.0%";
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "B7" };
}

function addRecordSheet(workbook, name, records, subjectMap, selectedColumns, theme) {
  const sheet = workbook.addWorksheet(normalizeSheetName(name, workbook));
  const headers = selectedColumns.map((column) => column.label);
  const keys = selectedColumns.map((column) => column.id);

  sheet.addRow(headers);
  records.forEach((record, index) => {
    const row = sheet.addRow(keys.map((key) => getCellValue(key, record, subjectMap)));
    styleRecordRow(row, record, subjectMap, theme, index, keys);
  });

  selectedColumns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });
  styleHeader(sheet.getRow(1), theme.header);
  sheet.getRow(1).height = 25;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${columnName(Math.max(selectedColumns.length, 1))}${records.length + 1}` };
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalDpi: 200,
    verticalDpi: 200
  };
}

function styleHeader(row, color) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "medium", color: { argb: `FF${color}` } } };
  });
}

function styleRecordRow(row, record, subjectMap, theme, index, keys) {
  const subject = subjectMap.get(record.subjectId);
  const subjectColor = toArgb(subject?.color || theme.header);
  row.height = 22;

  row.eachCell((cell) => {
    const key = keys[cell.column - 1];
    cell.alignment = { vertical: "middle", wrapText: key === "record" || key === "note" };
    cell.border = { bottom: { style: "hair", color: { argb: "FFE4E7EC" } } };
    if (index % 2 === 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${theme.stripe}` } };
    }
    if (key === "score" || key === "fullScore") cell.numFmt = "0.0";
  });

  const subjectColumn = keys.indexOf("subject") + 1;
  if (subjectColumn > 0) {
    const cell = row.getCell(subjectColumn);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${mixHex(subjectColor, "FFFFFF", 0.82)}` } };
    cell.font = { bold: true, color: { argb: subjectColor } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  const rateColumn = keys.indexOf("rate") + 1;
  if (rateColumn > 0) {
    const cell = row.getCell(rateColumn);
    cell.numFmt = "0%";
    cell.font = { bold: true, color: { argb: subjectColor } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${mixHex(subjectColor, "FFFFFF", 0.9)}` } };
  }
}

function getCellValue(key, record, subjectMap) {
  const subject = subjectMap.get(record.subjectId);
  switch (key) {
    case "subject":
      return subject?.name || "未分类";
    case "year":
      return getYear(record);
    case "date":
      return record.date || "";
    case "record":
      return recordTitle(record);
    case "type":
      return recordTypeLabel(record);
    case "variant":
      return recordVariantLabel(record);
    case "score":
      return numberOrZero(record.score);
    case "fullScore":
      return numberOrZero(record.fullScore);
    case "rate":
      return numberOrZero(record.fullScore) ? numberOrZero(record.score) / numberOrZero(record.fullScore) : 0;
    case "exerciseBook":
      return record.exerciseBookName || "";
    case "exercisePage":
      return record.exercisePage || "";
    case "exerciseQuestion":
      return record.exerciseQuestion || "";
    case "duration":
      return formatDuration(record.durationMinutes);
    case "sync":
      return record.pendingSync ? "待同步" : "已同步";
    case "note":
      return record.note || "";
    default:
      return "";
  }
}

function groupRecordsBySubject(records, subjectMap) {
  const groups = new Map();
  records.forEach((record) => {
    const name = subjectMap.get(record.subjectId)?.name || "未分类";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  });
  return [...groups.entries()].map(([name, groupedRecords]) => ({ name, records: groupedRecords }));
}

function recordTitle(record) {
  if (record.recordType !== "exercise") return record.paperName || "未命名成绩";
  return [record.exerciseBookName || record.paperName, record.exercisePage ? `P${record.exercisePage}` : "", record.exerciseQuestion ? `第 ${record.exerciseQuestion} 题` : ""]
    .filter(Boolean)
    .join(" · ");
}

function recordTypeLabel(record) {
  if (record.recordType === "composite") return "合成";
  return record.recordType === "exercise" ? "习题" : "试卷";
}

function recordVariantLabel(record) {
  if (record.recordType !== "paper" || record.subjectId !== "math1") return "";
  const raw = String(record.paperVariant || "").toLowerCase();
  if (raw === "true") return "真题";
  if (raw === "mock") return "模拟卷";
  return "";
}

function getYear(record) {
  const dateYear = String(record.date || "").match(/\d{4}/)?.[0];
  if (dateYear) return Number(dateYear);
  const titleYear = String(record.paperName || "").match(/(?:19|20)\d{2}/)?.[0];
  return titleYear ? Number(titleYear) : "";
}

function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "未记录";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}小时${rest ? `${rest}分钟` : ""}` : `${minutes}分钟`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeFilename(value) {
  return String(value || "成绩导出").trim().replace(/[\\/:*?"<>|]+/g, "_") || "成绩导出";
}

function normalizeSheetName(value, workbook) {
  const base = String(value || "成绩明细").replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "成绩明细";
  let name = base;
  let index = 2;
  while (workbook.worksheets.some((sheet) => sheet.name === name)) {
    const suffix = `-${index}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }
  return name;
}

function columnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function toArgb(color) {
  const value = String(color || "").replace("#", "").trim();
  return `FF${/^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : "2563EB"}`;
}

function mixHex(firstArgb, secondHex, amount) {
  const first = firstArgb.slice(2);
  const second = secondHex.replace("#", "");
  const channel = (offset) =>
    Math.round(parseInt(first.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(second.slice(offset, offset + 2), 16) * amount)
      .toString(16)
      .padStart(2, "0");
  return `${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
