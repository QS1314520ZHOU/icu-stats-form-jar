import {
  ActiveStayRange,
  BedsideRecord,
  ConfigTubeView,
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
  NurseRecord,
  PatientContext,
  SummaryTextToken,
  TubeExecution,
  TubeFieldConfig,
  TubeRecord,
} from './hljld-form.models';

export interface TubeNursingEntry {
  key: string;
  timestamp: number;
  time: string;
  text: string;
}

import { databaseTimeValue, formatShanghaiDateMinute } from './form-date.util';

/* ---- 统计分类定义 ---- */

const CODE_BROUGHT = 'param_带入药量';
const CODE_ORAL = 'param_kouFu';
const CODE_TUBE_FEEDING = 'param_biSi';
const CODE_INTRAVENOUS = 'param_YaoYeti_in_hour';
const CODE_GASTROINTESTINAL = 'param_YaoStomach_in_hour';
const CODE_TRANSFUSION = 'param_YaoShuXue_in_hour';

/** 尿量与净超滤量已独立成列，不再计入排出物 */
export const URINE_CODE = 'param_niaoLiang';
export const ULTRAFILTRATION_CODE = 'param_chaoLvLiang';

const INPUT_SUMMARY_DEFINITIONS = [
  { key: 'brought-medication', label: '带入药量', codes: [CODE_BROUGHT] },
  { key: 'oral', label: '口服量', codes: [CODE_ORAL] },
  { key: 'tube-feeding', label: '鼻饲量', codes: [CODE_TUBE_FEEDING] },
  { key: 'intravenous', label: '静脉入量', codes: [CODE_INTRAVENOUS] },
  { key: 'gastrointestinal', label: '胃肠入量', codes: [CODE_GASTROINTESTINAL] },
  { key: 'blood-transfusion', label: '输血入量', codes: [CODE_TRANSFUSION] },
] as const;

/** 排出物：不含尿量、净超滤量 */
const EXCRETION_SUMMARY_DEFINITIONS = [
  { key: 'stool', code: 'param_daBianAmount', label: '大便量' },
  { key: 'stoma', code: 'param_造瘘口量', label: '造瘘口量' },
  { key: 'vomit', code: 'param_outuwuliang', label: '呕吐物量' },
  { key: 'hemoptysis', code: 'param_咯血', label: '咯血' },
  { key: 'sputum', code: 'param_tanLiang', label: '痰液量' },
] as const;

/** 明细表「排出物」列的名称映射，同样不含尿量与净超滤量 */
const OUTPUT_CODE_NAMES: Record<string, string> = {
  param_daBianAmount: '大便量',
  'param_造瘘口量': '造瘘口量',
  param_outuwuliang: '呕吐物量',
  'param_咯血': '咯血',
  param_tanLiang: '痰液量',
};

const DISPLAY_BEDSIDE_CODES = new Set<string>([
  CODE_BROUGHT, CODE_ORAL, CODE_TUBE_FEEDING,
  ULTRAFILTRATION_CODE, URINE_CODE, 'param_daBianAmount',
  'param_造瘘口量', 'param_outuwuliang', 'param_咯血', 'param_tanLiang',
  'param_外出检查', 'param_物理治疗', 'param_基础护理1', 'param_健康教育',
]);

/**
 * 历史引流编码白名单。
 * 数据库中仍存在这些code，但配置名称已修改。
 */
const LEGACY_DRAIN_CODES = new Set<string>([
  'param_tube_胃肠减压',
]);

/**
 * 判断bedside项目是否属于引流量。
 *
 * 兼容：
 * 1. 历史编码param_tube_胃肠减压；
 * 2. code中包含"引流"的项目。
 */
export function isDrainCode(code?: string): boolean {
  const normalizedCode = String(code ?? '').trim();
  if (!normalizedCode) { return false; }
  return LEGACY_DRAIN_CODES.has(normalizedCode) || normalizedCode.includes('引流');
}

export const DEFAULT_REMARK_LINES = [
  '检查：A：CT    B：核磁共振    C：胃镜    D：肠镜    E：超声检查    F：床旁胸片',
  '治疗：A：机械辅助排痰    B：气压治疗    C：雾化吸入    D：支气管镜灌洗    E：TDP照射    F：针灸治疗    G：运动治疗    H：肺复张',
  '基础护理：A：口腔护理    B：动/静脉置管护理    C：擦浴    D：会阴擦洗    E：肛周护理    F：更换引流袋    G：膀胱冲洗    H：压疮护理    I：床上洗头',
  '健康教育：A：入院指导    B：疾病知识    C：药物指导    D：饮食指导    E：肢体活动指导    F：检查指导    G：安全指导    H：心理指导    I：术前指导    J：术后指导    K：转科/出院指导    L：用氧注意事项    M：通气配合指导    N：康复指导    O：VTE预防指导',
];

/* ---- 护理日时间范围 ---- */

/** 护理日左端点：当日 07:00，本身不计入（区间左开） */
export function startOfNursingDay(selectedDate: Date): Date {
  const d = new Date(selectedDate);
  d.setHours(7, 0, 0, 0);
  return d;
}

/** 护理日右端点：次日 07:00，本身计入（区间右闭） */
export function endOfNursingDay(selectedDate: Date): Date {
  const d = startOfNursingDay(selectedDate);
  d.setDate(d.getDate() + 1);
  return d;
}

export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ---- 患者时间解析 ---- */

/**
 * 统一解析患者时间字段，使用 databaseTimeValue 处理数据库时区。
 * 返回绝对毫秒时间戳，解析失败返回 NaN。
 */
export function parsePatientDateTime(value?: string): number {
  if (!value) { return NaN; }
  const ts = databaseTimeValue(value);
  return Number.isFinite(ts) ? ts : NaN;
}

/* ---- 有效住院区间 ---- */

export function resolveActiveStayRange(
  patient: PatientContext,
  nursingDayStart: Date,
  nursingDayEnd: Date,
): ActiveStayRange {
  const admissionTs = parsePatientDateTime(patient.admissionTime);
  const dischargeTs = parsePatientDateTime(patient.dischargeTime);

  const admissionTime = Number.isFinite(admissionTs) ? new Date(admissionTs) : null;
  const dischargeTime = Number.isFinite(dischargeTs) ? new Date(dischargeTs) : null;

  const dayStartMinute = minuteInstant(nursingDayStart);
  const dayEndMinute = minuteInstant(nursingDayEnd);

  // effectiveStart = max(nursingDayStart, admissionTime)
  let effectiveStart = new Date(nursingDayStart);
  let admissionClipped = false;
  if (admissionTime && minuteInstant(admissionTime) > dayStartMinute) {
    effectiveStart = admissionTime;
    admissionClipped = true;
  }

  // effectiveEnd = min(nursingDayEnd, dischargeTime)
  let effectiveEnd = new Date(nursingDayEnd);
  let dischargeClipped = false;
  if (dischargeTime && minuteInstant(dischargeTime) < dayEndMinute) {
    effectiveEnd = dischargeTime;
    dischargeClipped = true;
  }

  // 右闭：入科时间正好等于次日 07:00 时仍属于本护理日最后一分钟
  const beforeAdmission = !!admissionTime && minuteInstant(admissionTime) > dayEndMinute;
  // 左开：出科时间正好等于当日 07:00 时本护理日已无有效区间
  const afterDischarge = !!dischargeTime && minuteInstant(dischargeTime) <= dayStartMinute;

  const startExclusive = !admissionClipped;
  const startMinute = minuteInstant(effectiveStart);
  const endMinute = minuteInstant(effectiveEnd);
  const hasValidRange = !beforeAdmission && !afterDischarge
    && (startExclusive ? endMinute > startMinute : endMinute >= startMinute);

  return {
    nursingDayStart,
    nursingDayEnd,
    effectiveStart,
    effectiveEnd,
    admissionClipped,
    dischargeClipped,
    beforeAdmission,
    afterDischarge,
    hasValidRange,
    startExclusive,
  };
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

/* ---- 时长文本 ---- */

/**
 * 计算两个时间之间的时长，始终显示"xx小时xx分钟"格式。
 * 使用 Math.floor 向下取整，避免带秒时间向上取整。
 */
export function durationText(start: Date, end: Date): string {
  const totalMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}小时${minutes}分钟`;
}

/* ---- 动态小结标题 ---- */

/**
 * 根据入科/出科截断情况和时间段类型，生成小结标题。
 */
export function buildSummaryLabel(options: {
  defaultLabel: string;
  kind: HljldSummaryKind;
  actualStart: Date;
  actualEnd: Date;
  admissionClipped: boolean;
  dischargeClipped: boolean;
}): string {
  const { kind, actualStart, actualEnd, admissionClipped, dischargeClipped } = options;

  // 出科总结：始终显示实际时长
  if (kind === 'discharge') {
    return `${durationText(actualStart, actualEnd)}总结`;
  }

  // 入科截断：显示实际时长
  if (admissionClipped) {
    if (kind === '24h') {
      return `${durationText(actualStart, actualEnd)}总结`;
    }
    return `${durationText(actualStart, actualEnd)}小结`;
  }

  // 出科截断且非入科截断：显示实际时长总结
  if (dischargeClipped) {
    return `${durationText(actualStart, actualEnd)}总结`;
  }

  // 正常情况使用默认标签
  return options.defaultLabel;
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
  if (!isValidBusinessRecord(record)) { return false; }
  if (record.code === 'param_Yishi') { return false; }
  if (!DISPLAY_BEDSIDE_CODES.has(record.code) && !isDrainCode(record.code)) { return false; }
  return hasText(record.strVal) || hasText(record.remark);
}

/** 药物/胃肠单元格：名称或量任一有值才展示，只有途径视为空数据 */
function hasNameOrAmount(item?: NameAmountRoute | NameAmount | null): boolean {
  return !!item && (hasText(item.name) || hasText(item.amount));
}

/** 排出物/引流液单元格：必须有量，只有名称无量视为空数据 */
function hasAmountValue(item?: NameAmount | null): boolean {
  return !!item && hasText(item.amount);
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

/**
 * 护理记录签名：优先取记录自带的 username，其次 trueName，
 * 最后用 userId / editUser 查账户映射。
 */
export function resolveNurseSignature(
  record: NurseRecord,
  accountMap: Map<string, string>,
): string {
  const direct = String(record.username ?? '').trim() || String(record.trueName ?? '').trim();
  if (direct) { return direct; }
  const id = String(record.userId ?? record.editUser ?? '').trim();
  return id ? (accountMap.get(id) || '') : '';
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
  const normalizedCode = String(code ?? '').trim();

  // 兼容历史code，业务显示名称已调整为"胃管负压引流量"
  if (normalizedCode === 'param_tube_胃肠减压') {
    return '胃管负压引流量';
  }

  const stripped = normalizedCode.replace(/^param_tube_/, '').replace(/^param_/, '');
  return stripped.endsWith('管') ? `${stripped.slice(0, -1)}液` : stripped.replace(/管/g, '液');
}

/**
 * 将任意时间归一到所属分钟的起始毫秒，与 minuteKey 同粒度。
 * 统计与展示都按分钟对齐，避免 07:00:30 这类秒级数据在两个护理日重复出现。
 */
export function minuteInstant(value: string | Date | number): number {
  const ts = typeof value === 'number'
    ? value
    : value instanceof Date
      ? value.getTime()
      : databaseTimeValue(value);
  return Number.isFinite(ts) ? Math.floor(ts / 60000) * 60000 : NaN;
}

/**
 * 护理日统计区间判断，默认左开右闭 (start, end]。
 *
 * 07:00 归属上一护理日的最后一分钟，07:01 起属于当前护理日，
 * 次日 07:00 为当前护理日的最后一分钟，即 07:01—次日07:00。
 *
 * startExclusive = false 用于入科截断场景：入科当分钟必须计入，区间为 [start, end]。
 */
export function inNursingRange(
  value: string | Date | number,
  start: Date | number,
  end: Date | number,
  startExclusive = true,
): boolean {
  const ts = minuteInstant(value);
  if (!Number.isFinite(ts)) { return false; }
  const startMs = minuteInstant(start);
  const endMs = minuteInstant(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) { return false; }
  return (startExclusive ? ts > startMs : ts >= startMs) && ts <= endMs;
}

function sumBedsideByCodes(records: BedsideRecord[], codes: readonly string[]): number {
  return records.filter(item => codes.includes(item.code)).reduce((sum, item) => sum + parseAmount(item.strVal), 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 金额格式化，页面与打印统一口径 */
export function formatSummaryAmount(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * 按给药途径聚合区间内的药物执行液体量。
 * routeLabel 的返回值作为 key，例如 iv、ivgtt、iv泵、im、IH、po、鼻饲、鼻饲注入。
 */
function sumDrugAmountsByRoute(
  source: HljldSourceData,
  start: Date,
  end: Date,
  startExclusive: boolean,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const execution of source.drugExecutions) {
    if (!isRenderableDrugExecution(execution)) { continue; }
    if (!inNursingRange(execution.startTime, start, end, startExclusive)) { continue; }
    const method = findDrugMethod(execution.methodCode, source.drugMethods);
    if (!method) { continue; }

    const amount = (execution.drugList ?? [])
      .reduce((sum, drug) => sum + parseAmount(drug.liquidAmount), 0);
    if (!amount) { continue; }

    const route = routeLabel(method.name);
    totals.set(route, round2((totals.get(route) ?? 0) + amount));
  }

  return totals;
}

/**
 * 生成父项下的途径明细。
 *
 * 父项金额固定取 bedside 汇总口径，保证总入量不因展示调整而变化；
 * 途径明细来自药物执行，两者存在差额时用 otherLabel 兜底，
 * 确保括号内各项之和恒等于父项金额。
 */
function buildRouteBreakdown(
  keyPrefix: string,
  parentTotal: number,
  entries: { label: string; amount: number }[],
  otherLabel: string,
  otherFirst = false,
): HljldSummaryItem[] {
  const known = entries.filter(entry => round2(entry.amount) !== 0);
  const knownTotal = round2(known.reduce((sum, entry) => sum + entry.amount, 0));
  const rest = round2(parentTotal - knownTotal);

  const items: HljldSummaryItem[] = known.map(entry => ({
    key: `${keyPrefix}-${entry.label}`,
    label: entry.label,
    amount: round2(entry.amount),
    unit: 'ml' as const,
  }));

  if (rest > 0) {
    const otherItem: HljldSummaryItem = {
      key: `${keyPrefix}-other`,
      label: otherLabel,
      amount: rest,
      unit: 'ml' as const,
    };
    if (otherFirst) { items.unshift(otherItem); } else { items.push(otherItem); }
  } else if (rest < 0) {
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
    if (isDev) {
      console.warn('[HLJLD][summary-route-mismatch]', { keyPrefix, parentTotal, knownTotal });
    }
  }

  return items;
}

/* ---- 小结文本行生成 ---- */

function pushAmount(tokens: SummaryTextToken[], label: string, amount: number): void {
  tokens.push({ text: `${label}：` });
  tokens.push({ text: `${formatSummaryAmount(amount)} ml`, strong: true });
}

/** 递归渲染明细项，形如 `名称：xx ml（子项：xx ml、…）` */
function pushItems(tokens: SummaryTextToken[], items: HljldSummaryItem[]): void {
  items.forEach((item, index) => {
    if (index > 0) { tokens.push({ text: '、' }); }
    pushAmount(tokens, item.label, item.amount);
    if (item.children?.length) {
      tokens.push({ text: '（' });
      pushItems(tokens, item.children);
      tokens.push({ text: '）' });
    }
  });
}

function buildInputLine(summary: {
  totalInput: number;
  drugTreatmentTotal: number;
  drugTreatmentItems: HljldSummaryItem[];
  gastrointestinalInputTotal: number;
  gastrointestinalInputItems: HljldSummaryItem[];
}): SummaryTextToken[] {
  const tokens: SummaryTextToken[] = [];
  pushAmount(tokens, '总入量', summary.totalInput);

  tokens.push({ text: '；' });
  pushAmount(tokens, '药物治疗', summary.drugTreatmentTotal);
  if (summary.drugTreatmentItems.length) {
    tokens.push({ text: '（' });
    pushItems(tokens, summary.drugTreatmentItems);
    tokens.push({ text: '）' });
  }

  tokens.push({ text: '；' });
  pushAmount(tokens, '胃肠摄入', summary.gastrointestinalInputTotal);
  if (summary.gastrointestinalInputItems.length) {
    tokens.push({ text: '（' });
    pushItems(tokens, summary.gastrointestinalInputItems);
    tokens.push({ text: '）' });
  }

  return tokens;
}

function buildOutputLine(summary: {
  totalOutput: number;
  urineTotal: number;
  ultrafiltrationTotal: number;
  excretionTotal: number;
  outputItems: HljldSummaryItem[];
  drainTotal: number;
  drainItems: HljldSummaryItem[];
}): SummaryTextToken[] {
  const tokens: SummaryTextToken[] = [];
  pushAmount(tokens, '总出量', summary.totalOutput);

  tokens.push({ text: '；' });
  pushAmount(tokens, '尿量', summary.urineTotal);

  tokens.push({ text: '；' });
  pushAmount(tokens, '净超滤量', summary.ultrafiltrationTotal);

  tokens.push({ text: '；' });
  pushAmount(tokens, '排出物', summary.excretionTotal);
  if (summary.outputItems.length) {
    tokens.push({ text: '（' });
    pushItems(tokens, summary.outputItems);
    tokens.push({ text: '）' });
  }

  if (summary.drainItems.length) {
    tokens.push({ text: '；' });
    pushAmount(tokens, '引流液', summary.drainTotal);
    tokens.push({ text: '（' });
    pushItems(tokens, summary.drainItems);
    tokens.push({ text: '）' });
  }

  return tokens;
}

/* ---- 收集护理日内的引流项目名称 ---- */

/**
 * 从当前护理日有效数据中收集稳定的引流项目名称和顺序。
 * 所有小结共用相同的 drainNames，确保项目结构一致。
 */
export function collectDrainNames(
  bedside: BedsideRecord[],
  effectiveStart: Date,
  effectiveEnd: Date,
  startExclusive = true,
): string[] {
  const seen = new Map<string, number>();

  for (const item of bedside) {
    if (!isValidBusinessRecord(item) || !isDrainCode(item.code) || !hasText(item.strVal)) { continue; }
    if (!inNursingRange(item.time, effectiveStart, effectiveEnd, startExclusive)) { continue; }
    const ts = minuteInstant(item.time);
    const name = drainName(item.code);
    if (!seen.has(name)) { seen.set(name, ts); }
  }

  return Array.from(seen.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
}

/* ---- 小结 ---- */

export function buildSummary(
  kind: HljldSummaryKind,
  label: string,
  patient: PatientContext,
  source: HljldSourceData,
  periodStart: Date,
  periodEnd: Date,
  drainNames: string[],
): HljldSummary {
  const stay = resolveActiveStayRange(patient, periodStart, periodEnd);
  const actualStart = stay.effectiveStart;
  const actualEnd = stay.effectiveEnd;
  const startTs = actualStart.getTime();
  const endTs = actualEnd.getTime();

  const records = source.bedside.filter(item =>
    isValidBusinessRecord(item)
    && inNursingRange(item.time, actualStart, actualEnd, stay.startExclusive));

  const summaryLabel = buildSummaryLabel({
    defaultLabel: label,
    kind,
    actualStart,
    actualEnd,
    admissionClipped: stay.admissionClipped,
    dischargeClipped: stay.dischargeClipped,
  });

  // 6 项 bedside 口径，后续会用 children 修正后的值更新
  const inputItems: HljldSummaryItem[] = INPUT_SUMMARY_DEFINITIONS.map(def => ({
    key: def.key,
    label: def.label,
    amount: round2(sumBedsideByCodes(records, def.codes)),
    unit: 'ml' as const,
  }));

  const routeTotals = sumDrugAmountsByRoute(source, actualStart, actualEnd, stay.startExclusive);
  const routeAmount = (route: string) => round2(routeTotals.get(route) ?? 0);

  const broughtTotal = round2(sumBedsideByCodes(records, [CODE_BROUGHT]));
  const oralTotal = round2(sumBedsideByCodes(records, [CODE_ORAL]));
  const tubeFeedingTotal = round2(sumBedsideByCodes(records, [CODE_TUBE_FEEDING]));
  const transfusionTotal = round2(sumBedsideByCodes(records, [CODE_TRANSFUSION]));
  const intravenousBase = round2(sumBedsideByCodes(records, [CODE_INTRAVENOUS]));
  const gastroBase = round2(sumBedsideByCodes(records, [CODE_GASTROINTESTINAL]));

  // 静脉入量 = 静脉小时汇总 + 输血入量，输血作为其首个明细项
  const intravenousBase2 = round2(intravenousBase + transfusionTotal);
  const intravenousChildren = buildRouteBreakdown(
    'intravenous',
    intravenousBase2,
    [
      { label: '输血入量', amount: transfusionTotal },
      { label: 'iv', amount: routeAmount('iv') },
      { label: 'ivgtt', amount: routeAmount('ivgtt') },
      { label: 'iv泵', amount: routeAmount('iv泵') },
      { label: 'im', amount: routeAmount('im') },
      { label: 'IH', amount: routeAmount('IH') },
    ],
    '其他静脉',
  );
  // 以 children 之和为准，避免 bedside 与 drug 执行口径不一致导致父项 ≠ 子项之和
  const intravenousTotal = round2(intravenousChildren.reduce((s, c) => s + c.amount, 0));

  // 药物治疗 = 带入药量 + 静脉入量（口服量已并入胃肠入量）
  const drugTreatmentItems: HljldSummaryItem[] = [
    { key: 'brought-medication', label: '带入药量', amount: broughtTotal, unit: 'ml' as const },
    {
      key: 'intravenous',
      label: '静脉入量',
      amount: intravenousTotal,
      unit: 'ml' as const,
      children: intravenousChildren,
    },
  ];
  const drugTreatmentTotal = round2(broughtTotal + intravenousTotal);

  // 鼻饲量：泵入部分取自肠内营养执行，差额记为手工鼻饲
  const tubeFeedingChildren = buildRouteBreakdown(
    'tube-feeding',
    tubeFeedingTotal,
    [{ label: '鼻饲泵入', amount: routeAmount('鼻饲注入') }],
    '鼻饲',
    true,
  );
  // children 之和为空则保持 bedside 原值
  const tubeFeedingAdj = tubeFeedingChildren.length
    ? round2(tubeFeedingChildren.reduce((s, c) => s + c.amount, 0))
    : tubeFeedingTotal;

  // 胃肠入量 = 胃肠小时汇总 + 口服量，po 为其明细
  const gastroBase2 = round2(gastroBase + oralTotal);
  const gastroChildren = buildRouteBreakdown(
    'gastrointestinal',
    gastroBase2,
    [{ label: 'po', amount: round2(oralTotal + routeAmount('po')) }],
    '其他胃肠',
  );
  const gastroTotal = round2(gastroChildren.reduce((s, c) => s + c.amount, 0));

  const gastrointestinalInputItems: HljldSummaryItem[] = [
    {
      key: 'tube-feeding',
      label: '鼻饲量',
      amount: tubeFeedingAdj,
      unit: 'ml' as const,
      children: tubeFeedingChildren,
    },
    {
      key: 'gastrointestinal',
      label: '胃肠入量',
      amount: gastroTotal,
      unit: 'ml' as const,
      children: gastroChildren,
    },
  ];
  const gastrointestinalInputTotal = round2(tubeFeedingAdj + gastroTotal);

  // 同步更新 inputItems 中被 children 修正的项，保证 totalInput = 药物治疗 + 胃肠摄入
  for (const item of inputItems) {
    if (item.key === 'intravenous') { item.amount = intravenousTotal; }
    if (item.key === 'tube-feeding') { item.amount = tubeFeedingAdj; }
  }
  const totalInput = round2(inputItems.reduce((sum, item) => sum + item.amount, 0));

  // 尿量、净超滤量单独统计，不再计入排出物
  const sumByCode = (code: string) => round2(
    records.filter(item => item.code === code)
      .reduce((sum, item) => sum + parseAmount(item.strVal), 0),
  );
  const urineTotal = sumByCode(URINE_CODE);
  const ultrafiltrationTotal = sumByCode(ULTRAFILTRATION_CODE);

  const outputItems: HljldSummaryItem[] = EXCRETION_SUMMARY_DEFINITIONS.map(def => ({
    key: def.key,
    label: def.label,
    amount: sumByCode(def.code),
    unit: 'ml' as const,
  }));
  const excretionTotal = round2(outputItems.reduce((sum, item) => sum + item.amount, 0));

  const drainItems: HljldSummaryItem[] = drainNames.map(name => ({
    key: `drain-${name}`,
    label: name,
    amount: round2(records
      .filter(item => isDrainCode(item.code) && drainName(item.code) === name)
      .reduce((total, item) => total + parseAmount(item.strVal), 0)),
    unit: 'ml' as const,
  }));
  const drainTotal = round2(drainItems.reduce((sum, item) => sum + item.amount, 0));

  const totalOutput = round2(urineTotal + ultrafiltrationTotal + excretionTotal + drainTotal);
  const balance = round2(totalInput - totalOutput);

  const detailLines: SummaryTextToken[][] = [
    buildInputLine({
      totalInput,
      drugTreatmentTotal,
      drugTreatmentItems,
      gastrointestinalInputTotal,
      gastrointestinalInputItems,
    }),
    buildOutputLine({
      totalOutput,
      urineTotal,
      ultrafiltrationTotal,
      excretionTotal,
      outputItems,
      drainTotal,
      drainItems,
    }),
    [{ text: '平衡量：' }, { text: `${formatSummaryAmount(balance)} ml`, strong: true }],
  ];

  return {
    kind,
    label: summaryLabel,
    periodText: `${formatTime(startTs)}—${formatTime(endTs)}`,
    plannedStart: periodStart.getTime(),
    plannedEnd: periodEnd.getTime(),
    periodStart: startTs,
    periodEnd: endTs,
    admissionClipped: stay.admissionClipped,
    dischargeClipped: stay.dischargeClipped,
    available: stay.hasValidRange,
    totalInput,
    inputItems,
    totalOutput,
    outputItems,
    drainItems,
    balance,
    drugTreatmentTotal,
    drugTreatmentItems,
    gastrointestinalInputTotal,
    gastrointestinalInputItems,
    excretionTotal,
    drainTotal,
    urineTotal,
    ultrafiltrationTotal,
    detailLines,
  };
}

/* ---- 管路护理记录 ---- */

/** 统一 valid/status 过滤 */
export function isValidBusinessRecord(record: { valid?: boolean; status?: string } | null | undefined): boolean {
  if (!record) { return false; }
  if (record.valid === false) { return false; }
  const status = String(record.status ?? '').trim().toLowerCase();
  if (status === 'invalid') { return false; }
  return true;
}

/** 格式化管路动态字段值 */
function formatTubeFieldValue(value: unknown): string {
  if (value === null || value === undefined) { return ''; }
  if (Array.isArray(value)) { return value.map(item => formatTubeFieldValue(item)).filter(Boolean).join('、'); }
  if (typeof value === 'string') { return value.trim(); }
  if (typeof value === 'number') { return Number.isFinite(value) ? String(value) : ''; }
  if (typeof value === 'boolean') { return value ? '是' : '否'; }
  return '';
}

/** 从管路配置中读取动态字段值 */
function getDynamicField(source: Record<string, unknown>, field: string): unknown {
  return source[field];
}

/** 匹配 tubeExe.type 与 configTubeView.tubeType */
export function findTubeView(type: string | undefined, views: ConfigTubeView[]): ConfigTubeView | undefined {
  const target = String(type ?? '').trim();
  if (!target) { return undefined; }
  return views.find(view => isValidBusinessRecord(view) && String(view.tubeType ?? '').trim() === target);
}

/** 生成单条管路护理记录文本 */
export function buildTubeNursingText(execution: TubeExecution, record: TubeRecord, view: ConfigTubeView): string {
  if (!isValidBusinessRecord(execution) || !isValidBusinessRecord(record) || !isValidBusinessRecord(view)) { return ''; }

  const tubeName = String(execution.name ?? view.tubeType ?? execution.type ?? '管路').trim();
  const parts: string[] = [];

  const appendConfiguredFields = (configs: TubeFieldConfig[], source: Record<string, unknown>): void => {
    for (const config of configs) {
      if (!isValidBusinessRecord(config)) { continue; }
      const name = String(config.name ?? '').trim();
      const field = String(config.field ?? '').trim();
      if (!name || !field) { continue; }
      const value = formatTubeFieldValue(getDynamicField(source, field));
      if (!value) { continue; }
      parts.push(`${name}：${value}`);
    }
  };

  appendConfiguredFields(view.tubeFieldConfigList ?? [], execution as Record<string, unknown>);
  appendConfiguredFields(view.tubeRecordFieldConfigList ?? [], record as Record<string, unknown>);

  if (!parts.length) { return ''; }
  return `${tubeName}：${parts.join('，')}`;
}

export function buildTubeNursingEntries(
  source: HljldSourceData,
  start: Date,
  end: Date,
  startExclusive = true,
): TubeNursingEntry[] {
  const entries: TubeNursingEntry[] = [];

  for (const exe of source.tubeExecutions) {
    if (!isValidBusinessRecord(exe)) { continue; }
    const view = findTubeView(exe.type, source.tubeViews);
    if (!view) {
      const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
      if (isDev) { console.warn('[HLJLD][tube-view-missing]', { tubeExecutionId: exe._id, type: exe.type }); }
      continue;
    }

    for (const record of (exe.tubeRecordList ?? [])) {
      if (!isValidBusinessRecord(record)) { continue; }
      if (!inNursingRange(String(record.time ?? ''), start, end, startExclusive)) { continue; }

      const text = buildTubeNursingText(exe, record, view);
      if (!text) { continue; }

      const ts = minuteInstant(String(record.time ?? ''));
      entries.push({
        key: `tube-${exe._id}-${record._id}-${ts}`,
        timestamp: ts,
        time: String(record.time ?? ''),
        text,
      });
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

/* ---- 时间行生成 ---- */

export function buildRows(
  source: HljldSourceData,
  start: Date,
  end: Date,
  accountMap: Map<string, string> = new Map(),
  startExclusive = true,
): HljldTimeRow[] {
  const inPeriod = (value?: string): boolean =>
    !!value && inNursingRange(value, start, end, startExclusive);

  const bedsideInPeriod = source.bedside
    .filter(item => isRenderableBedsideRecord(item) && inPeriod(item.time));
  const drugsInPeriod = source.drugExecutions
    .filter(item => isRenderableDrugExecution(item) && inPeriod(item.startTime));
  const nurseInPeriod = source.nurseRecords
    .filter(item => isValidBusinessRecord(item) && hasText(item.desc) && inPeriod(item.time));

  const uniqueKeys = Array.from(new Set([
    ...bedsideInPeriod.map(item => minuteKey(item.time)),
    ...drugsInPeriod.map(item => minuteKey(item.startTime)),
    ...nurseInPeriod.map(item => minuteKey(item.time)),
  ]))
    .filter(key => Number.isFinite(key))
    .sort((a, b) => a - b);

  const rows: HljldTimeRow[] = [];

  for (const key of uniqueKeys) {
    const timeMs = key * 60000;
    const bedside = bedsideInPeriod.filter(item => minuteKey(item.time) === key);
    const drugExecutions = drugsInPeriod.filter(item => minuteKey(item.startTime) === key);

    const medications: NameAmountRoute[] = [];
    const enteral: NameAmountRoute[] = [];

    drugExecutions.forEach(execution => {
      const method = findDrugMethod(execution.methodCode, source.drugMethods);
      if (!method) { return; }
      const isEnteral = String(method.group ?? '').trim() === '胃肠';
      const cell = drugToCell(execution, method, isEnteral);
      if (!hasNameOrAmount(cell)) { return; }
      if (isEnteral) { enteral.push(cell); } else { medications.push(cell); }
    });

    bedside
      .filter(item => item.code === CODE_BROUGHT)
      .map(bedsideInputCell)
      .filter(hasNameOrAmount)
      .forEach(cell => medications.push(cell));

    bedside
      .filter(item => item.code === CODE_ORAL || item.code === CODE_TUBE_FEEDING)
      .map(bedsideInputCell)
      .filter(hasNameOrAmount)
      .forEach(cell => enteral.push(cell));

    const values = (code: string) => bedside
      .filter(item => item.code === code)
      .map(item => displayAmount(item.strVal))
      .filter(hasText);

    // 尿量、净超滤量独立成列，只保留量
    const urines = values(URINE_CODE);
    const ultrafiltrations = values(ULTRAFILTRATION_CODE);

    const outputs: NameAmount[] = bedside
      .filter(item => Boolean(OUTPUT_CODE_NAMES[item.code]))
      .map(item => ({
        name: OUTPUT_CODE_NAMES[item.code],
        amount: displayAmount(item.strVal),
        numericAmount: parseAmount(item.strVal),
      }))
      .filter(hasAmountValue);

    const drains: NameAmount[] = bedside
      .filter(item => isDrainCode(item.code))
      .map(item => ({
        name: drainName(item.code),
        amount: displayAmount(item.strVal),
        numericAmount: parseAmount(item.strVal),
      }))
      .filter(hasAmountValue);

    const examination = values('param_外出检查');
    const treatment = values('param_物理治疗');
    const basicCare = values('param_基础护理1');
    const healthEducation = values('param_健康教育');

    const nurseRowsAtKey = nurseInPeriod.filter(item => minuteKey(item.time) === key);
    const combinedNursing = nurseRowsAtKey
      .map(item => String(item.desc).trim())
      .filter(Boolean)
      .join('；');
    const nursingRecords = combinedNursing ? [combinedNursing] : [];

    const hasContent = medications.length || enteral.length
      || urines.length || ultrafiltrations.length
      || outputs.length || drains.length
      || examination.length || treatment.length || basicCare.length
      || healthEducation.length || nursingRecords.length;
    if (!hasContent) { continue; }

    // 有护理记录时优先用护理记录的记录者，取该分钟内最后一条可解析的签名
    let signature = '';
    for (let i = nurseRowsAtKey.length - 1; i >= 0; i -= 1) {
      const name = resolveNurseSignature(nurseRowsAtKey[i], accountMap);
      if (name) { signature = name; break; }
    }
    // 没有护理记录（或护理记录无签名信息）时回退到意识记录
    if (!signature) {
      const signUserId = resolveYishiSignerId(timeMs, source.bedside);
      signature = signUserId ? (accountMap.get(signUserId) || '') : '';
    }

    rows.push({
      key: String(key),
      time: new Date(timeMs),
      timeText: formatTime(timeMs),
      medications,
      enteral,
      urines,
      ultrafiltrations,
      outputs,
      drains,
      examination,
      treatment,
      basicCare,
      healthEducation,
      nursingRecords,
      signature,
    });
  }

  return rows;
}

/* ---- 时间组展开 ---- */

export function buildDisplayGroups(sourceRows: HljldTimeRow[]): HljldTimeGroup[] {
  const sortedRows = [...sourceRows].sort((a, b) => a.time.getTime() - b.time.getTime());
  const groups: HljldTimeGroup[] = [];

  for (const row of sortedRows) {
    const medications = row.medications.filter(hasNameOrAmount);
    const enteral = row.enteral.filter(hasNameOrAmount);
    const urines = row.urines.filter(hasText);
    const ultrafiltrations = row.ultrafiltrations.filter(hasText);
    const outputs = row.outputs.filter(hasAmountValue);
    const drains = row.drains.filter(hasAmountValue);
    const examination = row.examination.filter(hasText);
    const treatment = row.treatment.filter(hasText);
    const basicCare = row.basicCare.filter(hasText);
    const healthEducation = row.healthEducation.filter(hasText);
    const nursingRecords = row.nursingRecords.filter(hasText);

    const lineCount = Math.max(
      medications.length, enteral.length,
      urines.length, ultrafiltrations.length,
      outputs.length, drains.length,
      examination.length, treatment.length, basicCare.length,
      healthEducation.length, nursingRecords.length,
    );
    if (lineCount <= 0) { continue; }

    const timestamp = row.time.getTime();
    const groupKey = row.key;
    const displayRows: HljldDisplayRow[] = [];

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const firstLine = lineIndex === 0;
      const lastLine = lineIndex === lineCount - 1;
      displayRows.push({
        key: `${groupKey}::${lineIndex}`,
        groupKey,
        timestamp,
        lineIndex,
        firstLine,
        lastLine,
        timeText: firstLine ? row.timeText : '',
        medication: medications[lineIndex],
        enteral: enteral[lineIndex],
        urine: urines[lineIndex] ?? '',
        ultrafiltration: ultrafiltrations[lineIndex] ?? '',
        output: outputs[lineIndex],
        drain: drains[lineIndex],
        examination: examination[lineIndex] ?? '',
        treatment: treatment[lineIndex] ?? '',
        basicCare: basicCare[lineIndex] ?? '',
        healthEducation: healthEducation[lineIndex] ?? '',
        nursingRecord: nursingRecords[lineIndex] ?? '',
        signature: lastLine ? row.signature : '',
      });
    }

    groups.push({ key: groupKey, timestamp, rows: displayRows });
  }

  return groups;
}

/* ---- 时间轴构建 ---- */

export function buildTimeline(
  groups: HljldTimeGroup[],
  daySummary: HljldSummary,
  shiftSummary: HljldSummary,
  fullDaySummary: HljldSummary,
  dayBoundaryMs: number,
  nextMorningBoundaryMs: number,
  nowMs: number,
  dischargeSummary?: HljldSummary,
  effectiveEndMs?: number,
): HljldTimelineItem[] {
  const result: HljldTimelineItem[] = [];
  let dayInserted = false;
  let dischargeInserted = false;

  const sortedGroups = [...groups].sort((a, b) => a.timestamp - b.timestamp);

  // 日间小结显示条件：必须有效且时间段大于0分钟
  const showDaySummary =
    daySummary.available
    && daySummary.periodEnd > daySummary.periodStart
    && nowMs >= dayBoundaryMs;

  // 次日07:00小结和24小时总结显示条件
  const showShiftSummary =
    shiftSummary.available
    && shiftSummary.periodEnd > shiftSummary.periodStart
    && nowMs >= nextMorningBoundaryMs;

  const showFullDaySummary =
    fullDaySummary.available
    && fullDaySummary.periodEnd > fullDaySummary.periodStart
    && nowMs >= nextMorningBoundaryMs;

  // 出科时间点
  const dischargeMs = dischargeSummary ? dischargeSummary.periodEnd : 0;
  const hasDischarge = !!dischargeSummary && dischargeSummary.available && dischargeMs > 0;

  // 出科在17:00之前：不插入 daySummary
  const dischargeBeforeDay = hasDischarge && dischargeMs < dayBoundaryMs;
  // 出科等于17:00：不插入 daySummary，只插入 dischargeSummary
  const dischargeAtDay = hasDischarge && dischargeMs === dayBoundaryMs;
  // 出科在17:00之后、次日07:00之前
  const dischargeBetween = hasDischarge && dischargeMs > dayBoundaryMs && dischargeMs < nextMorningBoundaryMs;
  // 出科等于或晚于次日07:00
  const dischargeAtOrAfterMorning = hasDischarge && dischargeMs >= nextMorningBoundaryMs;

  for (const group of sortedGroups) {
    // 只展示当前时间之前已经发生的数据
    if (group.timestamp > minuteInstant(nowMs)) { continue; }

    // 右闭：等于有效结束时刻的那一分钟仍要展示
    if (effectiveEndMs !== undefined && group.timestamp > minuteInstant(effectiveEndMs)) { continue; }

    // 右闭：次日 07:00 属于本护理日最后一分钟
    if (group.timestamp > minuteInstant(nextMorningBoundaryMs)) { continue; }

    // 已到17:00边界，当前组晚于17:00时，先插入日间小结
    // 但出科在17:00之前或等于17:00时不插入 daySummary
    if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay && group.timestamp > dayBoundaryMs) {
      result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
      dayInserted = true;
    }

    // 出科时间在明细之间：在出科时间前插入 daySummary（如果需要），然后插入 dischargeSummary
    if (hasDischarge && !dischargeInserted && dischargeBetween && group.timestamp >= dischargeMs && !dischargeBeforeDay && !dischargeAtDay) {
      // 先确保 daySummary 已插入
      if (showDaySummary && !dayInserted) {
        result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
        dayInserted = true;
      }
      result.push({ kind: 'discharge-summary', key: `discharge-summary-${dischargeMs}`, timestamp: dischargeMs, summary: dischargeSummary! });
      dischargeInserted = true;
    }

    result.push({ kind: 'time-group', key: group.key, timestamp: group.timestamp, group });

    // 正好17:00：先展示完整组，再展示日间小结
    if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay && group.timestamp === dayBoundaryMs) {
      result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
      dayInserted = true;
    }

    // 正好出科时间：先展示完整组，再展示出科总结
    if (hasDischarge && !dischargeInserted && group.timestamp === dischargeMs) {
      // 先确保 daySummary 已插入（出科在17:00之后的情况）
      if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay && dischargeMs > dayBoundaryMs) {
        result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
        dayInserted = true;
      }
      result.push({ kind: 'discharge-summary', key: `discharge-summary-${dischargeMs}`, timestamp: dischargeMs, summary: dischargeSummary! });
      dischargeInserted = true;
    }
  }

  // 已到17:00但之后没有明细，仍需展示日间小结（出科不在17:00之前或等于17:00）
  if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay) {
    result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
    dayInserted = true;
  }

  // 出科在17:00之前：在所有明细之后插入 dischargeSummary
  if (hasDischarge && !dischargeInserted && dischargeBeforeDay) {
    result.push({ kind: 'discharge-summary', key: `discharge-summary-${dischargeMs}`, timestamp: dischargeMs, summary: dischargeSummary! });
    dischargeInserted = true;
  }

  // 出科等于17:00：在所有明细之后插入 dischargeSummary（替代 daySummary）
  if (hasDischarge && !dischargeInserted && dischargeAtDay) {
    result.push({ kind: 'discharge-summary', key: `discharge-summary-${dischargeMs}`, timestamp: dischargeMs, summary: dischargeSummary! });
    dischargeInserted = true;
  }

  // 出科在17:00之后、次日07:00之前：如果还没插入，在最后插入
  if (hasDischarge && !dischargeInserted && dischargeBetween) {
    if (showDaySummary && !dayInserted) {
      result.push({ kind: 'day-summary', key: 'day-summary-17', timestamp: dayBoundaryMs, summary: daySummary });
    }
    result.push({ kind: 'discharge-summary', key: `discharge-summary-${dischargeMs}`, timestamp: dischargeMs, summary: dischargeSummary! });
    dischargeInserted = true;
  }

  // 次日07:00展示：夜班小结（17:00→次日07:00）+ 24小时总结
  // 次日07:00前出科：不追加；次日07:00时或之后出科：应显示
  const shouldAppendNextMorningSummaries =
    !hasDischarge || dischargeAtOrAfterMorning;
  if (shouldAppendNextMorningSummaries) {
    if (showShiftSummary) {
      result.push({ kind: 'shift-summary', key: 'shift-summary-next-07', timestamp: nextMorningBoundaryMs, summary: shiftSummary });
    }
    if (showFullDaySummary) {
      result.push({ kind: 'full-day-summary', key: 'full-day-summary-next-07', timestamp: nextMorningBoundaryMs, summary: fullDaySummary });
    }
  }

  return result;
}
