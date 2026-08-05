import {
  BedsideRecord,
  DrugExecution,
  DrugMethodConfig,
  HljldDisplayRow,
  HljldSourceData,
  HljldSummary,
  HljldSummaryItem,
  HljldSummaryKind,
  HljldTimeGroup,
  HljldTimeRow,
  HljldTimelineItem,
  NameAmount,
  NameAmountRoute,
  PatientContext,
} from './hljld-form.models';

import { databaseTimeValue, formatShanghaiDateMinute } from './form-date.util';

/* ---- 统计分类定义 ---- */

const INPUT_SUMMARY_DEFINITIONS = [
  { key: 'brought-medication', label: '带入药量', codes: ['param_带入药量'] },
  { key: 'oral', label: '口服量', codes: ['param_kouFu'] },
  { key: 'tube-feeding', label: '鼻饲量', codes: ['param_biSi'] },
  { key: 'intravenous', label: '静脉入量', codes: ['param_YaoYeti_in_hour'] },
  { key: 'gastrointestinal', label: '胃肠入量', codes: ['param_YaoStomach_in_hour'] },
  { key: 'blood-transfusion', label: '输血入量', codes: ['param_YaoShuXue_in_hour'] },
] as const;

const OUTPUT_SUMMARY_DEFINITIONS = [
  { key: 'urine', code: 'param_niaoLiang', label: '尿量' },
  { key: 'stool', code: 'param_daBianAmount', label: '大便量' },
  { key: 'ultrafiltration', code: 'param_chaoLvLiang', label: '净超滤量' },
  { key: 'stoma', code: 'param_造瘘口量', label: '造瘘口量' },
  { key: 'vomit', code: 'param_outuwuliang', label: '呕吐物量' },
  { key: 'hemoptysis', code: 'param_咯血', label: '咯血' },
  { key: 'sputum', code: 'param_tanLiang', label: '痰液量' },
] as const;

const OUTPUT_CODE_NAMES: Record<string, string> = {
  param_chaoLvLiang: '净超滤量',
  param_niaoLiang: '尿量',
  param_daBianAmount: '大便量',
  'param_造瘘口量': '造瘘口量',
  param_outuwuliang: '呕吐物量',
  'param_咯血': '咯血',
  param_tanLiang: '痰液量',
};

const DISPLAY_BEDSIDE_CODES = new Set<string>([
  'param_带入药量', 'param_kouFu', 'param_biSi',
  'param_chaoLvLiang', 'param_niaoLiang', 'param_daBianAmount',
  'param_造瘘口量', 'param_outuwuliang', 'param_咯血', 'param_tanLiang',
  'param_外出检查', 'param_物理治疗', 'param_基础护理1', 'param_健康教育',
]);

export const DEFAULT_REMARK_LINES = [
  '检查：A：CT    B：核磁共振    C：胃镜    D：肠镜    E：超声检查    F：床旁胸片',
  '治疗：A：机械辅助排痰    B：气压治疗    C：雾化吸入    D：支气管镜灌洗    E：TDP照射    F：针灸治疗    G：运动治疗    H：肺复张',
  '基础护理：A：口腔护理    B：动/静脉置管护理    C：擦浴    D：会阴擦洗    E：肛周护理    F：更换引流袋    G：膀胱冲洗    H：压疮护理    I：床上洗头',
  '健康教育：A：入院指导    B：疾病知识    C：药物指导    D：饮食指导    E：肢体活动指导    F：检查指导    G：安全指导    H：心理指导    I：术前指导    J：术后指导    K：转科/出院指导    L：用氧注意事项    M：通气配合指导    N：康复指导    O：VTE预防指导',
];

/* ---- 护理日时间范围 ---- */

export function startOfNursingDay(selectedDate: Date): Date {
  const d = new Date(selectedDate);
  d.setHours(7, 0, 0, 0);
  return d;
}

export function endOfNursingDay(selectedDate: Date): Date {
  const d = startOfNursingDay(selectedDate);
  d.setDate(d.getDate() + 1);
  d.setMilliseconds(d.getMilliseconds() - 1);
  return d;
}

export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ---- 东八区时间工具 ---- */

/**
 * 分钟键：使用绝对毫秒时间戳除以60000取整，
 * 保证跨时区和跨数据源的分钟匹配一致。
 */
export function minuteKey(value: string | Date): number {
  const timestamp = value instanceof Date ? value.getTime() : databaseTimeValue(value);
  if (!Number.isFinite(timestamp)) { return NaN; }
  return Math.floor(timestamp / 60000);
}

/** 将绝对毫秒时间戳格式化为上海时间 yyyy-MM-dd HH:mm */
export function formatTime(ms: number): string {
  return formatShanghaiDateMinute(ms);
}

export function parseAmount(value: unknown): number {
  if (typeof value === 'number') { return Number.isFinite(value) ? value : 0; }
  if (typeof value !== 'string') { return 0; }
  const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function displayAmount(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function hasText(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/* ---- 药物方法匹配 ---- */

function normalizeCodes(code: string): string[] {
  return String(code || '')
    .split('、')
    .map(item => item.trim())
    .filter(Boolean);
}

export function findDrugMethod(methodCode: string | undefined, configs: DrugMethodConfig[]): DrugMethodConfig | undefined {
  const targetCode = String(methodCode ?? '').trim();
  if (!targetCode) { return undefined; }
  return configs.find(config => config.valid !== false && normalizeCodes(config.code).includes(targetCode));
}

export function routeLabel(name: string | undefined): string {
  const value = String(name || '');
  if (/输液泵|静滴/.test(value)) { return 'ivgtt'; }
  if (/微量泵/.test(value)) { return 'iv泵'; }
  if (/肌肉注射/.test(value)) { return 'im'; }
  if (/皮下注射/.test(value)) { return 'IH'; }
  if (/静注/.test(value)) { return 'iv'; }
  if (/口服/.test(value)) { return 'po'; }
  if (/胃管置管术/.test(value)) { return '鼻饲'; }
  if (/肠内营养/.test(value)) { return '鼻饲注入'; }
  return value;
}

export function enteralDisplayName(rawName: string): string {
  const name = rawName || '';
  if (name.includes('SP')) { return '短肽'; }
  if (name.includes('TP')) { return '瑞素'; }
  if (name.includes('瑞高')) { return '瑞高'; }
  if (name.includes('瑞能')) { return '瑞能'; }
  return name;
}

/* ---- Bedside/Drug 渲染判断 ---- */

function isRenderableBedsideRecord(record: BedsideRecord): boolean {
  if (!record || !record.time || !record.code) { return false; }
  if (record.code === 'param_Yishi') { return false; }
  if (!DISPLAY_BEDSIDE_CODES.has(record.code) && !record.code.includes('引流')) { return false; }
  return hasText(record.strVal) || hasText(record.remark);
}

/**
 * 根据 param_Yishi 记录解析签名用户ID。
 * 只使用 bedside.code === 'param_Yishi' 的 editUser。
 * 选择 time <= targetTime 的最近一条。
 */
export function resolveYishiSignerId(
  targetTime: string | Date | number,
  bedsideRecords: BedsideRecord[],
): string {
  const targetInstant = typeof targetTime === 'number'
    ? targetTime
    : targetTime instanceof Date
      ? targetTime.getTime()
      : databaseTimeValue(targetTime);

  if (!Number.isFinite(targetInstant)) { return ''; }

  const yishiRecords = bedsideRecords
    .filter(item => item.valid !== false && item.code === 'param_Yishi' && !!item.time && !!item.editUser)
    .map(item => ({
      instant: databaseTimeValue(item.time),
      editUser: String(item.editUser ?? '').trim(),
    }))
    .filter(item => Number.isFinite(item.instant) && !!item.editUser)
    .sort((a, b) => a.instant - b.instant);

  for (let i = yishiRecords.length - 1; i >= 0; i--) {
    if (yishiRecords[i].instant <= targetInstant) {
      return yishiRecords[i].editUser;
    }
  }
  return '';
}

function isRenderableDrugExecution(item: DrugExecution): boolean {
  if (!item || item.status === 'invalid' || !item.startTime) { return false; }
  return (item.drugList ?? []).some(drug => hasText(drug.name) || parseAmount(drug.liquidAmount) !== 0);
}

/* ---- 数据转换 ---- */

function drugToCell(execution: DrugExecution, config: DrugMethodConfig, enteral: boolean): NameAmountRoute {
  const drugList = execution.drugList ?? [];
  const rawName = drugList.map(item => String(item.name ?? '').trim()).filter(Boolean).join('、');
  const numericAmount = drugList.reduce((sum, item) => sum + parseAmount(item.liquidAmount), 0);
  return {
    name: enteral ? enteralDisplayName(rawName) : rawName,
    amount: numericAmount !== 0 ? String(numericAmount) : '',
    numericAmount,
    route: routeLabel(config.name),
  };
}

function bedsideInputCell(record: BedsideRecord): NameAmountRoute {
  let route = '';
  if (record.code === 'param_带入药量') { route = '带入'; }
  else if (record.code === 'param_kouFu') { route = 'po'; }
  else if (record.code === 'param_biSi') { route = '鼻饲'; }
  return {
    name: String(record.remark ?? '').trim(),
    amount: displayAmount(record.strVal),
    numericAmount: parseAmount(record.strVal),
    route,
  };
}

function drainName(code: string): string {
  const stripped = code.replace(/^param_tube_/, '').replace(/^param_/, '');
  return stripped.endsWith('管') ? `${stripped.slice(0, -1)}液` : stripped.replace(/管/g, '液');
}

function inRange(time: string, start: Date, end: Date): boolean {
  const value = databaseTimeValue(time);
  return Number.isFinite(value) && value >= start.getTime() && value <= end.getTime();
}

function activeStayBoundary(patient: PatientContext, start: Date, end: Date): { start: Date; end: Date } {
  let actualStart = new Date(start);
  let actualEnd = new Date(end);
  if (patient.admissionTime) {
    const admission = new Date(patient.admissionTime);
    if (admission > actualStart) { actualStart = admission; }
  }
  if (patient.dischargeTime) {
    const discharge = new Date(patient.dischargeTime);
    if (discharge < actualEnd) { actualEnd = discharge; }
  }
  return { start: actualStart, end: actualEnd };
}

function durationText(start: Date, end: Date): string {
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}小时${rest ? `${rest}分钟` : ''}`;
}

function sumBedsideByCodes(records: BedsideRecord[], codes: readonly string[]): number {
  return records.filter(item => codes.includes(item.code)).reduce((sum, item) => sum + parseAmount(item.strVal), 0);
}

/* ---- 小结 ---- */

export function buildSummary(
  kind: HljldSummaryKind,
  label: string,
  patient: PatientContext,
  source: HljldSourceData,
  periodStart: Date,
  periodEnd: Date,
): HljldSummary {
  const stay = activeStayBoundary(patient, periodStart, periodEnd);
  const startTs = stay.start.getTime();
  const endTs = stay.end.getTime();

  // 左闭右开：timestamp >= start && timestamp < end
  const records = source.bedside.filter(item => {
    if (item.valid === false) { return false; }
    const ts = databaseTimeValue(item.time);
    return Number.isFinite(ts) && ts >= startTs && ts < endTs;
  });

  // 入量分类
  const inputItems: HljldSummaryItem[] = INPUT_SUMMARY_DEFINITIONS.map(def => ({
    key: def.key,
    label: def.label,
    amount: sumBedsideByCodes(records, def.codes),
    unit: 'ml' as const,
  }));
  const totalInput = inputItems.reduce((sum, item) => sum + item.amount, 0);

  // 排出物分类
  const outputItems: HljldSummaryItem[] = OUTPUT_SUMMARY_DEFINITIONS
    .map(def => ({
      key: def.key,
      label: def.label,
      amount: records.filter(item => item.code === def.code).reduce((sum, item) => sum + parseAmount(item.strVal), 0),
      unit: 'ml' as const,
    }))
    .filter(item => records.some(r => r.code === OUTPUT_SUMMARY_DEFINITIONS.find(d => d.key === item.key)?.code));
  const outputTotal = outputItems.reduce((sum, item) => sum + item.amount, 0);

  // 引流液分类
  const drainMap = new Map<string, number>();
  records.filter(item => item.code.includes('引流')).forEach(item => {
    const name = drainName(item.code);
    drainMap.set(name, (drainMap.get(name) || 0) + parseAmount(item.strVal));
  });
  const drainItems: HljldSummaryItem[] = Array.from(drainMap.entries()).map(([name, amount]) => ({
    key: `drain-${name}`,
    label: name,
    amount,
    unit: 'ml' as const,
  }));
  const drainTotal = drainItems.reduce((sum, item) => sum + item.amount, 0);

  const totalOutput = outputTotal + drainTotal;

  return {
    kind,
    label,
    periodText: `${formatTime(startTs)}—${formatTime(endTs)}`,
    periodStart: startTs,
    periodEnd: endTs,
    totalInput,
    inputItems,
    totalOutput,
    outputItems,
    drainItems,
    balance: totalOutput - totalInput,
  };
}

/* ---- 时间行生成 ---- */

export function buildRows(
  source: HljldSourceData,
  start: Date,
  end: Date,
  accountMap: Map<string, string> = new Map(),
): HljldTimeRow[] {
  const events: Array<{ timestamp: number }> = [
    ...source.bedside.filter(isRenderableBedsideRecord).map(item => ({ timestamp: minuteKey(item.time) })),
    ...source.drugExecutions.filter(isRenderableDrugExecution).map(item => ({ timestamp: minuteKey(item.startTime) })),
    ...source.nurseRecords.filter(item => item.valid !== false && !!item.time && hasText(item.desc)).map(item => ({ timestamp: minuteKey(item.time) })),
  ].filter(item => Number.isFinite(item.timestamp) && item.timestamp * 60000 >= start.getTime() && item.timestamp * 60000 <= end.getTime());

  const uniqueKeys = Array.from(new Set(events.map(item => item.timestamp).filter(k => Number.isFinite(k)))).sort((a, b) => a - b);

  return uniqueKeys.map(key => {
    const timeMs = key * 60000;
    const bedside = source.bedside.filter(item => minuteKey(item.time) === key);
    const drugExecutions = source.drugExecutions.filter(item => item.status !== 'invalid' && minuteKey(item.startTime) === key);
    const medications: NameAmountRoute[] = [];
    const enteral: NameAmountRoute[] = [];

    drugExecutions.forEach(execution => {
      const method = findDrugMethod(execution.methodCode, source.drugMethods);
      if (!method) { return; }
      const isEnteral = String(method.group ?? '').trim() === '胃肠';
      const cell = drugToCell(execution, method, isEnteral);
      if (!cell.name && !cell.amount) { return; }
      if (isEnteral) { enteral.push(cell); } else { medications.push(cell); }
    });

    bedside.filter(item => item.code === 'param_带入药量').forEach(item => medications.push(bedsideInputCell(item)));
    bedside.filter(item => item.code === 'param_kouFu' || item.code === 'param_biSi').forEach(item => enteral.push(bedsideInputCell(item)));

    const outputs: NameAmount[] = bedside
      .filter(item => Boolean(OUTPUT_CODE_NAMES[item.code]))
      .map(item => ({ name: OUTPUT_CODE_NAMES[item.code], amount: displayAmount(item.strVal), numericAmount: parseAmount(item.strVal) }));
    const drains: NameAmount[] = bedside
      .filter(item => item.code.includes('引流'))
      .map(item => ({ name: drainName(item.code), amount: displayAmount(item.strVal), numericAmount: parseAmount(item.strVal) }));

    const values = (code: string) => bedside.filter(item => item.code === code).map(item => displayAmount(item.strVal)).filter(Boolean);

    // 签名：只使用 param_Yishi 的 editUser
    const signUserId = resolveYishiSignerId(timeMs, source.bedside);
    const signature = signUserId ? (accountMap.get(signUserId) || '') : '';

    return {
      key: String(key),
      time: new Date(timeMs),
      timeText: formatTime(timeMs),
      medications,
      enteral,
      outputs,
      drains,
      examination: values('param_外出检查'),
      treatment: values('param_物理治疗'),
      basicCare: values('param_基础护理1'),
      healthEducation: values('param_健康教育'),
      nursingRecords: source.nurseRecords.filter(item => item.valid !== false && minuteKey(item.time) === key).map(item => item.desc || '').filter(Boolean),
      signature,
    };
  });
}

/* ---- 时间组展开 ---- */

export function buildDisplayGroups(sourceRows: HljldTimeRow[]): HljldTimeGroup[] {
  const sortedRows = [...sourceRows].sort((a, b) => a.time.getTime() - b.time.getTime());

  return sortedRows.map(row => {
    const medications = row.medications.filter(item => !!item && (hasText(item.name) || hasText(item.amount) || hasText(item.route)));
    const enteral = row.enteral.filter(item => !!item && (hasText(item.name) || hasText(item.amount) || hasText(item.route)));
    const outputs = row.outputs.filter(item => !!item && (hasText(item.name) || hasText(item.amount)));
    const drains = row.drains.filter(item => !!item && (hasText(item.name) || hasText(item.amount)));
    const examination = row.examination.filter(hasText);
    const treatment = row.treatment.filter(hasText);
    const basicCare = row.basicCare.filter(hasText);
    const healthEducation = row.healthEducation.filter(hasText);
    const nursingRecords = row.nursingRecords.filter(hasText);

    const lineCount = Math.max(1, medications.length, enteral.length, outputs.length, drains.length, examination.length, treatment.length, basicCare.length, healthEducation.length, nursingRecords.length);

    const timestamp = row.time.getTime();
    const groupKey = row.key;
    const displayRows: HljldDisplayRow[] = [];

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const firstLine = lineIndex === 0;
      displayRows.push({
        key: `${groupKey}::${lineIndex}`,
        groupKey,
        timestamp,
        lineIndex,
        firstLine,
        timeText: firstLine ? row.timeText : '',
        medication: medications[lineIndex],
        enteral: enteral[lineIndex],
        output: outputs[lineIndex],
        drain: drains[lineIndex],
        examination: examination[lineIndex] ?? '',
        treatment: treatment[lineIndex] ?? '',
        basicCare: basicCare[lineIndex] ?? '',
        healthEducation: healthEducation[lineIndex] ?? '',
        nursingRecord: nursingRecords[lineIndex] ?? '',
        signature: firstLine ? row.signature : '',
      });
    }

    return { key: groupKey, timestamp, rows: displayRows };
  });
}

/* ---- 时间轴构建 ---- */

export function buildTimeline(
  groups: HljldTimeGroup[],
  daySummary: HljldSummary,
  shiftSummary: HljldSummary,
  fullDaySummary: HljldSummary,
  dayBoundaryMs: number,
  nextMorningBoundaryMs: number,
): HljldTimelineItem[] {
  const result: HljldTimelineItem[] = [];
  let dayInserted = false;

  const sortedGroups = [...groups].sort((a, b) => a.timestamp - b.timestamp);

  for (const group of sortedGroups) {
    // 当前组晚于17:00时，先在当前组前插入17:00日间小结
    if (!dayInserted && group.timestamp > dayBoundaryMs) {
      result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
      dayInserted = true;
    }

    // 当前组不能晚于护理日结束边界（次日07:00的数据属于下一护理日）
    if (group.timestamp >= nextMorningBoundaryMs) {
      continue;
    }

    result.push({ kind: 'time-group', key: group.key, timestamp: group.timestamp, group });

    // 正好17:00：先展示完整组，再展示日间小结
    if (!dayInserted && group.timestamp === dayBoundaryMs) {
      result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
      dayInserted = true;
    }
  }

  // 即使17:00以后没有普通业务数据，17:00边界仍需要插入日间小结
  if (!dayInserted) {
    result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
  }

  // 次日07:00边界必须同时展示：小结 + 24小时总结
  result.push({ kind: 'shift-summary', key: 'shift-summary-next-07', timestamp: nextMorningBoundaryMs, summary: shiftSummary });
  result.push({ kind: 'full-day-summary', key: 'full-day-summary-next-07', timestamp: nextMorningBoundaryMs, summary: fullDaySummary });

  return result;
}
