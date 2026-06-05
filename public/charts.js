// 图表绘制模块 - 增强版可视化

// 绘制单科趋势图（原有功能，带移动平均线）
export function drawTrendChart(canvas, records, subject, showMA = true) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = 34;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d9e1dc";
  ctx.lineWidth = 1;

  // 绘制网格线
  for (let i = 0; i < 4; i += 1) {
    const y = pad + ((height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  if (!records.length || !subject) {
    ctx.fillStyle = "#667085";
    ctx.font = "26px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("选择科目后记录几套卷，趋势会出现在这里", width / 2, height / 2);
    return;
  }

  const maxScore = Math.max(subject.fullScore, ...records.map((r) => r.fullScore));
  const points = records.map((record, index) => {
    const x = records.length === 1 ? width / 2 : pad + ((width - pad * 2) / (records.length - 1)) * index;
    const y = height - pad - (record.score / maxScore) * (height - pad * 2);
    return { x, y, record };
  });

  // 绘制移动平均线（3期）
  if (showMA && records.length >= 3) {
    const maPoints = [];
    for (let i = 2; i < records.length; i++) {
      const ma = (records[i].score + records[i - 1].score + records[i - 2].score) / 3;
      const x = pad + ((width - pad * 2) / (records.length - 1)) * i;
      const y = height - pad - (ma / maxScore) * (height - pad * 2);
      maPoints.push({ x, y });
    }

    ctx.strokeStyle = subject.color + "40";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    maPoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 绘制目标线
  const targetY = height - pad - (subject.targetScore / maxScore) * (height - pad * 2);
  ctx.strokeStyle = "#b85c38";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, targetY);
  ctx.lineTo(width - pad, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 绘制实际得分线
  ctx.strokeStyle = subject.color;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  // 绘制数据点
  points.forEach((point) => {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = subject.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#18212f";
    ctx.font = "22px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(point.record.score, point.x, point.y - 16);
  });

  // 图表说明
  ctx.fillStyle = "#667085";
  ctx.font = "18px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${subject.name} 最近 ${records.length} 次`, pad, height - 10);
}

// 绘制雷达图 - 各科目得分率对比
export function drawRadarChart(canvas, subjects, recordsMap) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 60;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  if (!subjects.length) {
    ctx.fillStyle = "#667085";
    ctx.font = "26px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("暂无数据", centerX, centerY);
    return;
  }

  const angles = subjects.map((_, i) => (Math.PI * 2 * i) / subjects.length - Math.PI / 2);

  // 绘制背景网格（5层）
  ctx.strokeStyle = "#d9e1dc";
  ctx.lineWidth = 1;
  for (let level = 1; level <= 5; level++) {
    ctx.beginPath();
    const r = (radius * level) / 5;
    angles.forEach((angle, i) => {
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  // 绘制轴线
  angles.forEach((angle) => {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
    ctx.stroke();
  });

  // 计算得分率并绘制数据区域
  const scoreRates = subjects.map((subject) => {
    const records = recordsMap[subject.id] || [];
    if (!records.length) return 0;
    const avg = records.reduce((sum, r) => sum + r.score, 0) / records.length;
    return Math.min(100, (avg / subject.fullScore) * 100);
  });

  ctx.fillStyle = "#18706f40";
  ctx.strokeStyle = "#18706f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  scoreRates.forEach((rate, i) => {
    const r = (radius * rate) / 100;
    const x = centerX + r * Math.cos(angles[i]);
    const y = centerY + r * Math.sin(angles[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 绘制数据点
  scoreRates.forEach((rate, i) => {
    const r = (radius * rate) / 100;
    const x = centerX + r * Math.cos(angles[i]);
    const y = centerY + r * Math.sin(angles[i]);

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#18706f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // 绘制科目标签
  ctx.fillStyle = "#18212f";
  ctx.font = "bold 18px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
  subjects.forEach((subject, i) => {
    const labelR = radius + 30;
    const x = centerX + labelR * Math.cos(angles[i]);
    const y = centerY + labelR * Math.sin(angles[i]);

    ctx.textAlign = x > centerX ? "left" : x < centerX ? "right" : "center";
    ctx.textBaseline = y > centerY ? "top" : y < centerY ? "bottom" : "middle";

    ctx.fillText(subject.name, x, y);

    // 显示得分率
    ctx.font = "14px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
    ctx.fillStyle = "#667085";
    ctx.fillText(`${Math.round(scoreRates[i])}%`, x, y + (y > centerY ? 18 : -18));
  });
}

// 绘制饼图 - 失分原因分析
export function drawPieChart(canvas, records) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2 - 20;
  const radius = Math.min(width, height) / 2 - 80;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  if (!records.length) {
    ctx.fillStyle = "#667085";
    ctx.font = "26px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("暂无数据", centerX, centerY);
    return;
  }

  // 统计失分原因
  const reasonCount = {};
  records.forEach((record) => {
    const reason = record.mistakeReason || "未分类";
    reasonCount[reason] = (reasonCount[reason] || 0) + 1;
  });

  const data = Object.entries(reasonCount).map(([reason, count]) => ({
    reason,
    count,
    percentage: (count / records.length) * 100
  }));

  const colors = ["#18706f", "#315b9d", "#b85c38", "#8060a8", "#d97706"];

  let startAngle = -Math.PI / 2;

  // 绘制饼图扇区
  data.forEach((item, i) => {
    const sliceAngle = (item.percentage / 100) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();

    // 绘制白色边框
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    startAngle = endAngle;
  });

  // 绘制图例
  const legendX = 40;
  let legendY = height - 80;

  ctx.font = "16px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
  data.forEach((item, i) => {
    // 色块
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(legendX, legendY, 20, 20);

    // 文字
    ctx.fillStyle = "#18212f";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${item.reason} (${item.count}次, ${Math.round(item.percentage)}%)`, legendX + 28, legendY + 10);

    legendY += 28;
  });

  // 标题
  ctx.fillStyle = "#18212f";
  ctx.font = "bold 20px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("失分原因分布", centerX, 30);
}

// 绘制练习频率热力图（简化版 - 近30天）
export function drawHeatmapChart(canvas, records) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  const today = new Date();
  const days = 30;
  const cellSize = Math.min(20, (width - 100) / days);
  const startX = 80;
  const startY = 60;

  // 统计每天的练习次数
  const dayCount = {};
  records.forEach((record) => {
    dayCount[record.date] = (dayCount[record.date] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(dayCount), 1);

  // 绘制热力格子
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().slice(0, 10);
    const count = dayCount[dateStr] || 0;

    const x = startX + i * (cellSize + 2);
    const y = startY;

    // 根据次数设置颜色深度
    const intensity = count / maxCount;
    const alpha = Math.max(0.1, intensity);
    ctx.fillStyle = `rgba(24, 112, 111, ${alpha})`;
    ctx.fillRect(x, y, cellSize, cellSize);

    // 绘制边框
    ctx.strokeStyle = "#d9e1dc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellSize, cellSize);

    // 每周日标注
    if (date.getDay() === 0 && i % 7 === 0) {
      ctx.fillStyle = "#667085";
      ctx.font = "12px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      ctx.fillText(label, x + cellSize / 2, startY - 10);
    }
  }

  // 标题
  ctx.fillStyle = "#18212f";
  ctx.font = "bold 18px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("近30天练习频率", 20, 35);

  // 图例
  ctx.font = "14px HarmonyOS Sans SC, Microsoft YaHei, sans-serif";
  ctx.fillStyle = "#667085";
  ctx.fillText("少", startX, startY + cellSize + 25);

  for (let i = 0; i <= 4; i++) {
    const x = startX + 30 + i * (cellSize + 2);
    const alpha = 0.2 + (i / 4) * 0.8;
    ctx.fillStyle = `rgba(24, 112, 111, ${alpha})`;
    ctx.fillRect(x, startY + cellSize + 12, cellSize, cellSize);
    ctx.strokeStyle = "#d9e1dc";
    ctx.strokeRect(x, startY + cellSize + 12, cellSize, cellSize);
  }

  ctx.fillStyle = "#667085";
  ctx.fillText("多", startX + 30 + 5 * (cellSize + 2), startY + cellSize + 25);
}
