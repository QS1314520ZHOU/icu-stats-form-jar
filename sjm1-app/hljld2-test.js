// hljld2 拆行+分页 纯逻辑测试 v2
let passed = 0, failed = 0;
function assert(c, m) { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } }
function assertEq(a, e, m) { const ok = JSON.stringify(a) === JSON.stringify(e); if (ok) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m + '\n    expected: ' + JSON.stringify(e) + '\n    actual:   ' + JSON.stringify(a)); } }

// ============ splitTextToLines ============
console.log('\n=== splitTextToLines ===');

function splitTextToLines(text, maxChars, skipSpace = false) {
  const trimmed = (text || '').trimEnd();
  if (!trimmed) { return ['']; }
  const delims = ['、', '，', '；', '：', ';', ','];
  const lines = [];
  let remaining = trimmed;
  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (remaining.length <= maxChars) { lines.push(remaining); break; }
    let breakAt = -1;
    for (const delim of delims) {
      const pos = remaining.lastIndexOf(delim, maxChars);
      if (pos > 0) { breakAt = pos + 1; break; }
    }
    if (breakAt <= 0) {
      if (skipSpace) { lines.push(remaining); break; }
      breakAt = maxChars;
    }
    lines.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt);
  }
  return lines.filter(l => l.length > 0);
}

// 基础
assertEq(splitTextToLines('', 10), [''], '空文本');
assertEq(splitTextToLines('12345', 10), ['12345'], '短文本不拆');
assertEq(splitTextToLines('1234567890', 10), ['1234567890'], '恰好等于maxChars');
assertEq(splitTextToLines('hello   ', 10), ['hello'], '尾部空格trim');

// 空格不参与断行（skipSpace=false 时无标点仍硬断）
const r0 = splitTextToLines('续用 剩余量 13.0 实用量', 9);
assert(r0.length >= 1, 'skipSpace=false: 含空格文本有结果');
// 硬断在9字符处
assert(r0[0].length <= 9, 'skipSpace=false: 每行<=maxChars');

// skipSpace=true: 无标点不硬断，整行返回
assertEq(splitTextToLines('续用 剩余量 13.0 实用量', 9, true), ['续用 剩余量 13.0 实用量'], 'skipSpace=true 整行返回');
assertEq(splitTextToLines('短文本', 9, true), ['短文本'], 'skipSpace=true 短文本');

// 标点断行
const r1 = splitTextToLines('项目A；项目B；项目C', 8);
assert(r1.length >= 2, '中文分号断行: ' + r1.length + ' 行');
assert(r1[0].includes('项目A'), '第一行包含项目A');

const r2 = splitTextToLines('item1,item2,item3', 8);
assert(r2.length >= 2, '英文逗号断行: ' + r2.length + ' 行');

// 硬断行
const r3 = splitTextToLines('这是一段很长的没有标点符号的中文文本', 8);
assert(r3.length >= 2, '无标点硬断: ' + r3.length + ' 行');
assert(r3[0].length === 8, '第一行长度=8');

// skipSpace=true 不硬断
const r4 = splitTextToLines('这是一段很长的没有标点符号的文本', 8, true);
assertEq(r4.length, 1, 'skipSpace=true 无标点不硬断');
assertEq(r4[0], '这是一段很长的没有标点符号的文本', 'skipSpace=true 返回全文');

// 实际业务场景
const r5 = splitTextToLines('中心静脉导管:置入长度15管道状态:在位通畅;导管护理:二次固定;敷料情况干', 34);
assert(r5.length >= 2, '护理记录拆行: ' + r5.length + ' 行');
r5.forEach((line, i) => { assert(line.length <= 34, '行' + (i+1) + '长度=' + line.length + ' <=34'); });

assertEq(splitTextToLines('注射用盐酸地尔硫卓(10mg/支)', 20).length, 1, '短药物名不拆行');
assert(splitTextToLines('注射用盐酸地尔硫卓(10mg/支) 50mg 微量泵注入 st', 20).length >= 2, '长药物名拆行');

// amount 不拆行（skipSpace=true）
assertEq(splitTextToLines('25.7', 9, true), ['25.7'], '数字amount不拆');
assertEq(splitTextToLines('', 9, true), [''], '空amount');
assertEq(splitTextToLines('续用 剩余量 13.0 实用量', 9, true), ['续用 剩余量 13.0 实用量'], '长amount skipSpace不拆');

// ============ parseAmount ============
console.log('\n=== parseAmount ===');

function parseAmount(value) {
  if (typeof value === 'number') { return Number.isFinite(value) ? value : 0; }
  if (typeof value !== 'string') { return 0; }
  const cleaned = value.replace(/,/g, '');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

assertEq(parseAmount(13.5), 13.5, '数字');
assertEq(parseAmount('25.7'), 25.7, '字符串数字');
assertEq(parseAmount('1,000'), 1000, '逗号千位分隔');
assertEq(parseAmount('1,000.5'), 1000.5, '逗号+小数');
assertEq(parseAmount(null), 0, 'null');
assertEq(parseAmount(''), 0, '空字符串');
assertEq(parseAmount('abc'), 0, '非数字');
assertEq(parseAmount(-5.5), -5.5, '负数');

// ============ minuteKey / inNursingRange ============
console.log('\n=== minuteKey + inNursingRange ===');

function databaseTimeValue(v) {
  if (!v) return NaN;
  if (v instanceof Date) return v.getTime();
  const d = new Date(String(v).trim());
  return isNaN(d.getTime()) ? NaN : d.getTime();
}
function minuteInstant(v) { const ts = databaseTimeValue(v); return Number.isFinite(ts) ? Math.floor(ts / 60000) : NaN; }
function minuteKey(v) { const ts = v instanceof Date ? v.getTime() : databaseTimeValue(v); return Number.isFinite(ts) ? Math.floor(ts / 60000) : NaN; }
function inNursingRange(value, start, end, startExclusive = true) {
  const ts = minuteInstant(value); if (!Number.isFinite(ts)) return false;
  const s = minuteInstant(start), e = minuteInstant(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return (startExclusive ? ts > s : ts >= s) && ts <= e;
}

assert(Number.isFinite(minuteKey(new Date('2026-08-23T09:30:00+08:00'))), 'Date minuteKey');
assert(Number.isNaN(minuteKey('invalid')), 'Invalid minuteKey');

const ns = new Date('2026-08-23T07:00:00+08:00'), ne = new Date('2026-08-24T07:00:00+08:00');
assert(inNursingRange('2026-08-23T08:00:00+08:00', ns, ne, true), '范围内');
assert(!inNursingRange('2026-08-23T07:00:00+08:00', ns, ne, true), '等于start(左开)');
assert(inNursingRange('2026-08-24T07:00:00+08:00', ns, ne, true), '等于end(右闭)');
assert(!inNursingRange('2026-08-22T08:00:00+08:00', ns, ne, true), '范围外');

// ============ 跨护理日 quickAdd ============
console.log('\n=== 跨护理日quickAdd ===');

const qat = [
  new Date('2026-08-22T11:00:00.000Z'), // 22号19:00 ✗
  new Date('2026-08-22T12:00:00.000Z'), // 22号20:00 ✗
  new Date('2026-08-23T01:30:00.000Z'), // 23号09:30 ✓
  new Date('2026-08-23T07:00:00.000Z'), // 23号15:00 ✓
];
const inDay = qat.filter(t => inNursingRange(t, ns, ne, true));
assertEq(inDay.length, 2, '2个在当前护理日');
assertEq(inDay[0].getUTCHours(), 1, '第一个=09:30');
assertEq(inDay[1].getUTCHours(), 7, '第二个=15:00');

// ============ 分页边界 ============
console.log('\n=== 分页边界 ===');

function paginate(rows, max) {
  const pages = []; let cur = [], cnt = 0;
  for (const r of rows) {
    if (cnt > 0 && cnt + r > max) { pages.push(cur); cur = []; cnt = 0; }
    cur.push(r); cnt++;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

assertEq(paginate(Array.from({length:34}, ()=>1), 34).length, 1, '34行=1页');
assertEq(paginate(Array.from({length:35}, ()=>1), 34).length, 2, '35行=2页');
assertEq(paginate(Array.from({length:68}, ()=>1), 34).length, 2, '68行=2页');
assertEq(paginate(Array.from({length:69}, ()=>1), 34).length, 3, '69行=3页');

// 大时间组不拆分
const p = paginate([20, 15], 34); // 20行 + 15行时间组
assertEq(p.length, 2, '20+15分2页');
assertEq(p[0].length, 1, '第一页1个item(20行)');
assertEq(p[1].length, 1, '第二页1个item(15行)');

// 摘要行不拆分
const p2 = paginate([30, 4], 34); // 30行 + 4行摘要
assertEq(p2.length, 2, '30+4分2页');

// ============ 汇总 ============
console.log('\n========================================');
console.log('Passed: ' + passed + ', Failed: ' + failed);
if (failed > 0) process.exit(1);
else console.log('All tests passed!');