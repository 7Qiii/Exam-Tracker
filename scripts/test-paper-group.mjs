/**
 * paperGroupName 的行为回归测试。
 *
 * 「按卷子分列」的分组完全由卷子名推导，规则改错会静默地把不同卷子并到一列
 * （列变少、数据看起来像丢了），所以这里把各种写法钉死。
 *
 * 跑法：node scripts/test-paper-group.mjs
 */
import { paperGroupName, buildExportMatrix } from "../src/services/excelExport.js";

const cases = [
  // ---- 应该合并成同一组 ----
  [["26张八1", "26张八2", "26张八10"], "26张八", "裸数字序号 1–2 位"],
  [["张宇八套卷 第1套", "张宇八套卷 第2套"], "张宇八套卷", "第N套（带空格）"],
  [["张宇八套卷第1套", "张宇八套卷第3套"], "张宇八套卷", "第N套（不带空格）"],
  [["2026年真题第一套", "2026年真题第二套"], "2026年真题", "第 + 汉字数字 + 单位"],
  [["真题 第 12 讲", "真题 第 13 讲"], "真题", "第 N 讲（数字两侧有空格）"],
  [["模拟卷(1)", "模拟卷(2)"], "模拟卷", "半角括号数字"],
  [["模拟卷（1）", "模拟卷（2）"], "模拟卷", "全角括号数字"],
  [["模拟卷（一）", "模拟卷（二）"], "模拟卷", "括号汉字数字"],
  [["模拟卷-三", "模拟卷-四"], "模拟卷", "短横线 + 汉字数字"],
  [["模拟卷_3", "模拟卷_4"], "模拟卷", "下划线 + 数字"],
  [["强化 二", "强化 三"], "强化", "空格 + 汉字数字"],
  [["真题第1套", "真题第2套"], "真题", "第N套（名字本身短）"],

  // ---- 必须保持原样（合并了才是 bug）----
  ["英语一2010", "英语一2010", "4 位年份不拆"],
  ["英语一2011", "英语一2011", "4 位年份不拆"],
  ["英语一", "英语一", "汉字数字属于名字本身"],
  ["数学一", "数学一", "汉字数字属于名字本身"],
  ["数一", "数一", "汉字数字属于名字本身"],
  ["数二", "数二", "汉字数字属于名字本身"],
  ["07年真题", "07年真题", "末尾不是序号，各占一列"],
  ["08年真题", "08年真题", "末尾不是序号，各占一列"],
  ["09年真题", "09年真题", "末尾不是序号，各占一列"],
  ["2026年真题", "2026年真题", "末尾不是序号"],
  ["真题", "真题", "没有序号"],
  ["26张八", "26张八", "已经没有序号了"],
  ["第一套真题", "第一套真题", "序号不在末尾"],
  ["数学第二轮复习", "数学第二轮复习", "序号不在末尾"],
  ["第三次模拟", "第三次模拟", "序号不在末尾"],
  ["英语一真题2010", "英语一真题2010", "4 位年份不拆"],
  ["", "未命名", "空名兜底"]
];

let failed = 0;

for (const [input, expected, note] of cases) {
  const names = Array.isArray(input) ? input : [input];
  for (const name of names) {
    const actual = paperGroupName(name);
    const ok = actual === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${JSON.stringify(name).padEnd(26)} -> ${JSON.stringify(actual).padEnd(22)} 期望 ${JSON.stringify(expected)}  (${note})`);
  }
}

// 同一组的不同写法必须收敛到同一个分组名，否则仍然会裂成多列
const convergence = [
  [["张宇八套卷 第1套", "张宇八套卷第2套", "张宇八套卷(3)", "张宇八套卷（四）"], "张宇八套卷"],
  [["2026年真题第一套", "2026年真题第2套", "2026年真题 第3讲"], "2026年真题"]
];
for (const [names, expected] of convergence) {
  const actual = new Set(names.map((name) => paperGroupName(name)));
  const ok = actual.size === 1 && actual.has(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  收敛 ${JSON.stringify(names)} -> ${JSON.stringify([...actual])}`);
}

// 端到端：真的摊成列之后，分组数 / 每组条数是否符合预期
const subjects = [{ id: "math1", name: "数一", color: "#2563eb" }];
const matrixScenarios = [
  {
    note: "真题按年份各占一列，同年的多套卷并到一起",
    records: [
      { id: "a", subjectId: "math1", recordType: "paper", paperName: "07年真题", score: 124, fullScore: 150 },
      { id: "b", subjectId: "math1", recordType: "paper", paperName: "08年真题", score: 136, fullScore: 150 },
      { id: "c", subjectId: "math1", recordType: "paper", paperName: "09年真题", score: 133, fullScore: 150 }
    ],
    expect: [["07年真题", 1], ["08年真题", 1], ["09年真题", 1]]
  },
  {
    note: "同一套卷子的第1套/第2套/(3) 并成一列",
    records: [
      { id: "a", subjectId: "math1", recordType: "paper", paperName: "张宇八套卷 第1套", score: 120, fullScore: 150 },
      { id: "b", subjectId: "math1", recordType: "paper", paperName: "张宇八套卷 第2套", score: 130, fullScore: 150 },
      { id: "c", subjectId: "math1", recordType: "paper", paperName: "张宇八套卷(3)", score: 140, fullScore: 150 }
    ],
    expect: [["张宇八套卷", 3]]
  },
  {
    note: "2026年真题第一套/第二套 并成一列，且不与 07年真题 混",
    records: [
      { id: "a", subjectId: "math1", recordType: "paper", paperName: "2026年真题第一套", score: 120, fullScore: 150 },
      { id: "b", subjectId: "math1", recordType: "paper", paperName: "2026年真题第二套", score: 130, fullScore: 150 },
      { id: "c", subjectId: "math1", recordType: "paper", paperName: "07年真题", score: 124, fullScore: 150 }
    ],
    expect: [["07年真题", 1], ["2026年真题", 2]]
  },
  {
    note: "不同年份的英语一不合并",
    records: [
      { id: "a", subjectId: "math1", recordType: "paper", paperName: "英语一2010", score: 60, fullScore: 100 },
      { id: "b", subjectId: "math1", recordType: "paper", paperName: "英语一2011", score: 70, fullScore: 100 }
    ],
    expect: [["英语一2010", 1], ["英语一2011", 1]]
  },
  {
    note: "习题按习题册名分组",
    records: [
      { id: "a", subjectId: "math1", recordType: "exercise", exerciseBookName: "1000题", exercisePage: "12", exerciseQuestion: "3", score: 5, fullScore: 5 },
      { id: "b", subjectId: "math1", recordType: "exercise", exerciseBookName: "1000题", exercisePage: "13", exerciseQuestion: "4", score: 4, fullScore: 5 }
    ],
    expect: [["1000题", 2]]
  }
];

for (const scenario of matrixScenarios) {
  const { groups } = buildExportMatrix({ records: scenario.records, subjects, fields: ["record", "scoreText"] });
  const actual = groups.map((group) => [group.label, group.records.length]);
  const ok = JSON.stringify(actual) === JSON.stringify(scenario.expect);
  if (!ok) failed += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${scenario.note}\n      实际 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(scenario.expect)}`
  );
}

console.log(failed ? `\n${failed} 条不符合预期` : "\n全部通过");
process.exit(failed ? 1 : 0);
