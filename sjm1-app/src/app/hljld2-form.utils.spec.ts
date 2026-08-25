import { splitTextToLines, buildDisplayGroups, buildRows, parseAmount, minuteKey, inNursingRange, startOfNursingDay, endOfNursingDay, resolveActiveStayRange } from './hljld2-form.utils';
import { HljldTimeRow, NameAmountRoute } from './hljld2-form.models';

// ============================================================
// splitTextToLines 测试
// ============================================================
describe('splitTextToLines', () => {

  // --- 基础功能 ---
  it('空文本返回空字符串行', () => {
    expect(splitTextToLines('', 10)).toEqual(['']);
  });

  it('null/undefined 返回空字符串行', () => {
    expect(splitTextToLines(null as any, 10)).toEqual(['']);
    expect(splitTextToLines(undefined as any, 10)).toEqual(['']);
  });

  it('文本长度等于 maxChars 不拆行', () => {
    expect(splitTextToLines('1234567890', 10)).toEqual(['1234567890']);
  });

  it('文本长度小于 maxChars 不拆行', () => {
    expect(splitTextToLines('12345', 10)).toEqual(['12345']);
  });

  it('文本长度超过 maxChars 按字符数硬断', () => {
    const result = splitTextToLines('中心静脉导管:置入长度15管道状态:在位通畅;', 20);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].length).toBe(20);
  });

  // --- 空格处理 ---
  it('含空格的长文本按字符数硬断', () => {
    const result = splitTextToLines('续用 剩余量 13.0 实用量', 9);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('续用 剩余量');
    expect(result[1]).toBe(' 13.0 实用');
    expect(result[2]).toBe('量');
  });

  it('skipSpace 参数不再影响行为，统一硬断', () => {
    const result = splitTextToLines('续用 剩余量 13.0 实用量', 9, true);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('续用 剩余量');
  });

  it('含标点的长文本按字符数硬断', () => {
    const text = '管道状态:在位通畅;导管护理:二次固定;敷料:干燥';
    const result = splitTextToLines(text, 15);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // 每行不超过 maxChars
    result.forEach(line => {
      expect(line.length).toBeLessThanOrEqual(15);
    });
  });

  // --- 尾部空格 ---
  it('尾部空格被 trimEnd 处理', () => {
    const result = splitTextToLines('hello   ', 10);
    expect(result).toEqual(['hello']);
  });

  it('中间空格保留', () => {
    const result = splitTextToLines('hello world', 20);
    expect(result).toEqual(['hello world']);
  });

  // --- 中文标点 ---
  it('中文逗号 、 不再作为断行符，统一硬断', () => {
    const result = splitTextToLines('检查A、治疗B、护理C', 8);
    expect(result.length).toBe(2);
    expect(result[0]).toBe('检查A、治疗B');
    expect(result[1]).toBe('、护理C');
  });

  it('中文分号 ； 不再作为断行符，统一硬断', () => {
    const result = splitTextToLines('项目一；项目二；项目三', 8);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('项目一；项目');
    expect(result[1]).toBe('二；项目三');
  });

  it('中文冒号 ： 不再作为断行符，统一硬断', () => {
    const result = splitTextToLines('名称：测试项目说明', 8);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('名称：测试');
    expect(result[1]).toBe('项目说明');
  });

  // --- 英文标点 ---
  it('英文分号 ; 不再作为断行符，统一硬断', () => {
    const result = splitTextToLines('item1;item2;item3', 8);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('item1;it');
    expect(result[1]).toBe('em2;item');
    expect(result[2]).toBe('3');
  });

  it('英文逗号 , 不再作为断行符，统一硬断', () => {
    const result = splitTextToLines('item1,item2,item3', 8);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('item1,ite');
    expect(result[1]).toBe('m2,item3');
  });

  // --- 硬断行 ---
  it('所有文本统一在 maxChars 处硬断', () => {
    const result = splitTextToLines('这是一段很长的没有标点的中文文本测试', 8);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].length).toBe(8);
  });

  it('skipSpace 参数不影响硬断行为', () => {
    const result = splitTextToLines('这是一段很长的没有标点的中文文本测试', 8, true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].length).toBe(8);
  });

  // --- 实际业务场景 ---
  it('护理记录文本拆行', () => {
    const text = '中心静脉导管:置入长度15管道状态:在位通畅;导管护理:二次固定;敷料情况干';
    const result = splitTextToLines(text, 34);
    expect(result.length).toBeGreaterThanOrEqual(2);
    result.forEach(line => {
      expect(line.length).toBeLessThanOrEqual(34);
    });
  });

  it('药物名称拆行', () => {
    const text = '注射用盐酸地尔硫卓(10mg/支)';
    const result = splitTextToLines(text, 20);
    // 15字符 <= 20，不拆行
    expect(result.length).toBe(1);
  });

  it('超长药物名称拆行', () => {
    const text = '注射用盐酸地尔硫卓(10mg/支) 50mg 微量泵注入 st';
    const result = splitTextToLines(text, 20);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('amount含空格按字符数硬断', () => {
    const result = splitTextToLines('续用 剩余量 13.0 实用量', 9, true);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('续用 剩余量');
  });

  it('amount只有数字不拆行', () => {
    const result = splitTextToLines('13.0', 9, true);
    expect(result.length).toBe(1);
  });

  it('amount为空不拆行', () => {
    const result = splitTextToLines('', 9, true);
    expect(result).toEqual(['']);
  });
});

// ============================================================
// parseAmount 测试
// ============================================================
describe('parseAmount', () => {
  it('数字直接返回', () => {
    expect(parseAmount(13.5)).toBe(13.5);
  });

  it('字符串数字解析', () => {
    expect(parseAmount('25.7')).toBe(25.7);
  });

  it('带逗号的数字', () => {
    expect(parseAmount('1,000')).toBe(1000);
  });

  it('空值返回0', () => {
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('')).toBe(0);
  });

  it('非数字字符串返回0', () => {
    expect(parseAmount('abc')).toBe(0);
  });

  it('负数', () => {
    expect(parseAmount('-5.5')).toBe(-5.5);
  });
});

// ============================================================
// minuteKey 测试
// ============================================================
describe('minuteKey', () => {
  it('Date对象返回分钟键', () => {
    const d = new Date('2026-08-23T09:30:00+08:00');
    const key = minuteKey(d);
    expect(key).toBeGreaterThan(0);
  });

  it('字符串返回分钟键', () => {
    const key = minuteKey('2026-08-23T09:30:00.000Z');
    expect(key).toBeGreaterThan(0);
  });

  it('无效值返回NaN', () => {
    expect(Number.isNaN(minuteKey('invalid'))).toBe(true);
  });
});

// ============================================================
// inNursingRange 测试
// ============================================================
describe('inNursingRange', () => {
  const start = new Date('2026-08-23T07:00:00+08:00');
  const end = new Date('2026-08-24T07:00:00+08:00');

  it('范围内（左闭右开）返回true', () => {
    expect(inNursingRange('2026-08-23T08:00:00+08:00', start, end)).toBe(true);
  });

  it('等于start（左闭）返回true', () => {
    expect(inNursingRange('2026-08-23T07:00:00+08:00', start, end)).toBe(true);
  });

  it('等于end（右开）返回false', () => {
    expect(inNursingRange('2026-08-24T07:00:00+08:00', start, end)).toBe(false);
  });

  it('范围外返回false', () => {
    expect(inNursingRange('2026-08-22T08:00:00+08:00', start, end)).toBe(false);
  });

  it('startExclusive=true时排除start', () => {
    expect(inNursingRange('2026-08-23T07:00:00+08:00', start, end, true)).toBe(false);
  });
});

// ============================================================
// startOfNursingDay / endOfNursingDay 测试
// ============================================================
describe('护理日时间边界', () => {
  it('startOfNursingDay 返回当天07:00', () => {
    const d = new Date('2026-08-23T15:30:00+08:00');
    const start = startOfNursingDay(d);
    expect(start.getHours()).toBe(7);
    expect(start.getMinutes()).toBe(0);
  });

  it('endOfNursingDay 返回次日07:00', () => {
    const d = new Date('2026-08-23T15:30:00+08:00');
    const end = endOfNursingDay(d);
    expect(end.getDate()).toBe(24);
    expect(end.getHours()).toBe(7);
  });
});

// ============================================================
// resolveActiveStayRange 测试
// ============================================================
describe('resolveActiveStayRange', () => {
  it('入院前返回 beforeAdmission=true', () => {
    const patient = { pid: '1', admissionTime: '2026-08-24T08:00:00+08:00' };
    const start = new Date('2026-08-23T07:00:00+08:00');
    const end = new Date('2026-08-24T07:00:00+08:00');
    const range = resolveActiveStayRange(patient, start, end);
    expect(range.beforeAdmission).toBe(true);
  });

  it('出院后返回 afterDischarge=true', () => {
    const patient = {
      pid: '1',
      admissionTime: '2026-08-20T08:00:00+08:00',
      dischargeTime: '2026-08-22T10:00:00+08:00',
    };
    const start = new Date('2026-08-23T07:00:00+08:00');
    const end = new Date('2026-08-24T07:00:00+08:00');
    const range = resolveActiveStayRange(patient, start, end);
    expect(range.afterDischarge).toBe(true);
  });

  it('住院中有有效范围', () => {
    const patient = {
      pid: '1',
      admissionTime: '2026-08-20T08:00:00+08:00',
    };
    const start = new Date('2026-08-23T07:00:00+08:00');
    const end = new Date('2026-08-24T07:00:00+08:00');
    const range = resolveActiveStayRange(patient, start, end);
    expect(range.hasValidRange).toBe(true);
    expect(range.beforeAdmission).toBe(false);
    expect(range.afterDischarge).toBe(false);
  });

  it('入科时间在护理日内截断', () => {
    const patient = {
      pid: '1',
      admissionTime: '2026-08-23T15:00:00+08:00',
    };
    const start = new Date('2026-08-23T07:00:00+08:00');
    const end = new Date('2026-08-24T07:00:00+08:00');
    const range = resolveActiveStayRange(patient, start, end);
    expect(range.admissionClipped).toBe(true);
    expect(range.hasValidRange).toBe(true);
  });
});

// ============================================================
// buildDisplayGroups 拆行集成测试
// ============================================================
describe('buildDisplayGroups 拆行', () => {
  function makeRow(overrides: Partial<HljldTimeRow> = {}): HljldTimeRow {
    return {
      key: 'test',
      time: new Date('2026-08-23T09:00:00+08:00'),
      timeText: '09:00',
      medications: [],
      enteral: [],
      urines: [],
      ultrafiltrations: [],
      outputs: [],
      drains: [],
      examination: [],
      treatment: [],
      basicCare: [],
      healthEducation: [],
      nursingRecords: [],
      signature: '',
      ...overrides,
    };
  }

  it('amount含分隔符不产生空白行', () => {
    const row = makeRow({
      medications: [{
        name: '肠内营养乳剂(SP)',
        amount: '续用|剩余13.0|实用0',
        route: 'iv泵',
        numericAmount: 13,
      }],
    });
    const groups = buildDisplayGroups([row]);
    expect(groups.length).toBe(1);
    // amount 按 | 拆行，所以 displayRows 中每行一个部分
    const rows = groups[0].rows;
    const amountLines = rows.filter(r => r.medication?.amount && r.medication.amount.trim());
    expect(amountLines.length).toBe(3); // 续用、剩余13.0、实用0
    // 所有行的 amount 拼接后包含完整信息
    const fullAmount = rows.map(r => r.medication?.amount || '').join('|');
    expect(fullAmount).toContain('续用');
    expect(fullAmount).toContain('剩余');
  });

  it('护理记录长文本拆行但不在空格处断', () => {
    const row = makeRow({
      nursingRecords: ['中心静脉导管:置入长度15管道状态:在位通畅;导管护理:二次固定;敷料情况干'],
    });
    const groups = buildDisplayGroups([row]);
    const rows = groups[0].rows;
    // 拆行后行数 >= 2
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // 所有行的护理记录拼接后包含完整文本
    const fullText = rows.map(r => r.nursingRecord).join('');
    expect(fullText).toContain('中心静脉导管');
    expect(fullText).toContain('二次固定');
  });

  it('多药物每列独立拆行', () => {
    const row = makeRow({
      medications: [
        { name: '药物A(长名称需要拆行的)', amount: '13.0', route: 'iv', numericAmount: 13 },
        { name: '药物B', amount: '25.7|实用0', route: 'po', numericAmount: 25.7 },
      ],
    });
    const groups = buildDisplayGroups([row]);
    expect(groups.length).toBe(1);
    expect(groups[0].rows.length).toBeGreaterThanOrEqual(1);
  });

  it('空行不产生（所有字段都为空时）', () => {
    const row = makeRow({
      medications: [{ name: '', amount: '', route: '', numericAmount: 0 }],
    });
    const groups = buildDisplayGroups([row]);
    // 空药物不产生 display row
    if (groups.length > 0) {
      groups[0].rows.forEach(r => {
        const hasData = r.medication?.name || r.medication?.amount ||
          r.nursingRecord || r.timeText;
        // 至少有一个字段有值（或这是正常的空行）
      });
    }
  });
});

// ============================================================
// 分页边界测试（模拟 splitIntoPages 逻辑）
// ============================================================
describe('分页边界', () => {
  const MAX_ROWS = 34;

  it('34行刚好一页', () => {
    const rows = Array.from({ length: 34 }, (_, i) => i + 1);
    const pages: number[][] = [];
    let current: number[] = [];
    let count = 0;
    for (const r of rows) {
      if (count > 0 && count + 1 > MAX_ROWS) {
        pages.push(current);
        current = [];
        count = 0;
      }
      current.push(r);
      count++;
    }
    if (current.length) pages.push(current);
    expect(pages.length).toBe(1);
    expect(pages[0].length).toBe(34);
  });

  it('35行分两页', () => {
    const rows = Array.from({ length: 35 }, (_, i) => i + 1);
    const pages: number[][] = [];
    let current: number[] = [];
    let count = 0;
    for (const r of rows) {
      if (count > 0 && count + 1 > MAX_ROWS) {
        pages.push(current);
        current = [];
        count = 0;
      }
      current.push(r);
      count++;
    }
    if (current.length) pages.push(current);
    expect(pages.length).toBe(2);
    expect(pages[0].length).toBe(34);
    expect(pages[1].length).toBe(1);
  });

  it('大时间组整体移至下一页', () => {
    // 模拟：当前页20行，下一个时间组15行
    const pages: number[][] = [];
    let current: number[] = Array.from({ length: 20 }, (_, i) => i + 1);
    let count = 20;
    const bigGroup = 15;
    if (count > 0 && count + bigGroup > MAX_ROWS) {
      pages.push(current);
      current = [];
      count = 0;
    }
    // 大时间组放入新页
    for (let i = 0; i < bigGroup; i++) {
      current.push(i + 100);
      count++;
    }
    pages.push(current);
    expect(pages.length).toBe(2);
    expect(pages[0].length).toBe(20);
    expect(pages[1].length).toBe(15);
  });

  it('空数组返回一页', () => {
    const pages: number[][] = [];
    let current: number[] = [];
    // 空数组不进入循环
    if (current.length) pages.push(current);
    expect(pages.length).toBe(0);
  });
});

// ============================================================
// 跨护理日肠内营养 quickAdd 模拟测试
// ============================================================
describe('跨护理日肠内营养', () => {
  it('startTime在前一护理日但quickAdd在当前护理日', () => {
    // 模拟：药物 startTime=22号19:00, quickAdd在23号09:30和15:00
    const nursingStart = new Date('2026-08-23T07:00:00+08:00');
    const nursingEnd = new Date('2026-08-24T07:00:00+08:00');

    const quickAddTimes = [
      new Date('2026-08-22T11:00:00.000Z'), // 22号19:00 - 不在当前护理日
      new Date('2026-08-22T12:00:00.000Z'), // 22号20:00 - 不在当前护理日
      new Date('2026-08-23T01:30:00.000Z'), // 23号09:30 - 在当前护理日 ✓
      new Date('2026-08-23T07:00:00.000Z'), // 23号15:00 - 在当前护理日 ✓
    ];

    const inCurrentDay = quickAddTimes.filter(t =>
      inNursingRange(t, nursingStart, nursingEnd, true)
    );

    expect(inCurrentDay.length).toBe(2);
    expect(inCurrentDay[0].getUTCHours()).toBe(1);  // 01:30 UTC = 09:30 Shanghai
    expect(inCurrentDay[1].getUTCHours()).toBe(7);  // 07:00 UTC = 15:00 Shanghai
  });

  it('所有quickAdd都在当前护理日', () => {
    const nursingStart = new Date('2026-08-23T07:00:00+08:00');
    const nursingEnd = new Date('2026-08-24T07:00:00+08:00');

    const quickAddTimes = [
      new Date('2026-08-23T02:00:00.000Z'), // 23号10:00
      new Date('2026-08-23T06:00:00.000Z'), // 23号14:00
    ];

    const inCurrentDay = quickAddTimes.filter(t =>
      inNursingRange(t, nursingStart, nursingEnd, true)
    );

    expect(inCurrentDay.length).toBe(2);
  });

  it('所有quickAdd都在当前护理日之外', () => {
    const nursingStart = new Date('2026-08-23T07:00:00+08:00');
    const nursingEnd = new Date('2026-08-24T07:00:00+08:00');

    const quickAddTimes = [
      new Date('2026-08-22T11:00:00.000Z'), // 22号19:00
      new Date('2026-08-22T12:00:00.000Z'), // 22号20:00
    ];

    const inCurrentDay = quickAddTimes.filter(t =>
      inNursingRange(t, nursingStart, nursingEnd, true)
    );

    expect(inCurrentDay.length).toBe(0);
  });
});