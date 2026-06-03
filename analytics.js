// 数据分析和预测功能模块

// 计算移动平均
export function calculateMovingAverage(data, period = 3) {
  if (data.length < period) return [];

  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
  }
  return result;
}

// 计算线性回归（用于预测趋势）
export function linearRegression(data) {
  const n = data.length;
  if (n < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  data.forEach((y, x) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

// 预测达到目标分数需要的次数
export function predictTargetReach(records, targetScore) {
  if (!records.length) return null;

  const scores = records.map(r => r.score);
  const regression = linearRegression(scores);

  if (!regression || regression.slope <= 0) {
    return null; // 无法预测（没有上升趋势）
  }

  const currentIndex = scores.length - 1;
  const currentScore = scores[currentIndex];

  if (currentScore >= targetScore) {
    return { reached: true, tests: 0 };
  }

  // 预测需要多少次考试
  const testsNeeded = Math.ceil((targetScore - regression.intercept) / regression.slope) - currentIndex;

  return {
    reached: false,
    tests: Math.max(1, testsNeeded),
    trend: regression.slope > 0 ? 'improving' : 'declining'
  };
}

// 分析失分原因趋势
export function analyzeMistakeTrends(records, recentCount = 10) {
  if (!records.length) return null;

  const recent = records.slice(-recentCount);
  const reasonCount = {};

  recent.forEach(record => {
    const reason = record.mistakeReason || '未分类';
    reasonCount[reason] = (reasonCount[reason] || 0) + 1;
  });

  const sorted = Object.entries(reasonCount)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: (count / recent.length) * 100
    }))
    .sort((a, b) => b.count - a.count);

  return {
    topReason: sorted[0],
    all: sorted
  };
}

// 计算各科目目标差距趋势
export function calculateTargetGapTrend(records, targetScore) {
  if (records.length < 2) return null;

  const gaps = records.map(r => Math.max(0, targetScore - r.score));
  const recent5 = gaps.slice(-5);
  const recent10 = gaps.slice(-10);

  const avg5 = recent5.reduce((a, b) => a + b, 0) / recent5.length;
  const avg10 = recent10.length >= 5
    ? recent10.reduce((a, b) => a + b, 0) / recent10.length
    : avg5;

  const trend = avg5 < avg10 ? 'improving' : avg5 > avg10 ? 'declining' : 'stable';

  return {
    currentGap: gaps[gaps.length - 1],
    avgGap5: Math.round(avg5 * 10) / 10,
    avgGap10: Math.round(avg10 * 10) / 10,
    trend
  };
}

// 生成学习建议
export function generateInsights(subjects, recordsMap) {
  const insights = [];

  subjects.forEach(subject => {
    const records = recordsMap[subject.id] || [];
    if (records.length < 3) return;

    // 分析得分趋势
    const scores = records.map(r => r.score);
    const recentAvg = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const overallAvg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (recentAvg < overallAvg - 5) {
      insights.push({
        type: 'warning',
        subject: subject.name,
        message: `${subject.name}近期得分下降，建议加强练习`
      });
    } else if (recentAvg > overallAvg + 5) {
      insights.push({
        type: 'success',
        subject: subject.name,
        message: `${subject.name}进步明显，继续保持！`
      });
    }

    // 分析目标差距
    const gapTrend = calculateTargetGapTrend(records, subject.targetScore);
    if (gapTrend && gapTrend.trend === 'improving') {
      const prediction = predictTargetReach(records, subject.targetScore);
      if (prediction && !prediction.reached) {
        insights.push({
          type: 'info',
          subject: subject.name,
          message: `${subject.name}按当前趋势，预计还需 ${prediction.tests} 次达到目标`
        });
      }
    }

    // 分析失分原因
    const mistakeTrend = analyzeMistakeTrends(records, 5);
    if (mistakeTrend && mistakeTrend.topReason.count >= 3) {
      insights.push({
        type: 'tip',
        subject: subject.name,
        message: `${subject.name}主要问题是"${mistakeTrend.topReason.reason}"，占近期 ${Math.round(mistakeTrend.topReason.percentage)}%`
      });
    }
  });

  return insights;
}

// 计算学习强度（近期练习频率）
export function calculateStudyIntensity(records, days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentRecords = records.filter(r => new Date(r.date) >= cutoffDate);
  const intensity = recentRecords.length / days;

  let level = 'low';
  let suggestion = '';

  if (intensity >= 1) {
    level = 'high';
    suggestion = '练习频率很高，注意劳逸结合';
  } else if (intensity >= 0.5) {
    level = 'medium';
    suggestion = '练习频率适中，保持节奏';
  } else {
    level = 'low';
    suggestion = '建议增加练习频率';
  }

  return {
    level,
    testsPerDay: Math.round(intensity * 10) / 10,
    totalTests: recentRecords.length,
    suggestion
  };
}
