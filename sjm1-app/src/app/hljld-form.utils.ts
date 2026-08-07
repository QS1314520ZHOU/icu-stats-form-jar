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
  PatientContext,
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

export function startOfNursingDay(selectedDate: Date): Date {
  const d = new Date(selectedDate);
  d.setHours(7, 0, 0, 0);
  return d;
}

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

/**
 * 计算患者在当前护理日内的有效区间和各种状态标志。
 * 所有时间使用左闭右开 [start, end) 判断。
 */
export function resolveActiveStayRange(
  patient: PatientContext,
  nursingDayStart: Date,
  nursingDayEnd: Date,
): ActiveStayRange {
  const admissionTs = parsePatientDateTime(patient.admissionTime);
  const dischargeTs = parsePatientDateTime(patient.dischargeTime);

  const admissionTime = Number.isFinite(admissionTs) ? new Date(admissionTs) : null;
  const dischargeTime = Number.isFinite(dischargeTs) ? new Date(dischargeTs) : null;

  // effectiveStart = max(nursingDayStart, admissionTime)
  let effectiveStart = new Date(nursingDayStart);
  let admissionClipped = false;
  if (admissionTime && admissionTime.getTime() > nursingDayStart.getTime()) {
    effectiveStart = admissionTime;
    admissionClipped = true;
  }

  // effectiveEnd = min(nursingDayEnd, dischargeTime)
  let effectiveEnd = new Date(nursingDayEnd);
  let dischargeClipped = false;
  if (dischargeTime && dischargeTime.getTime() < nursingDayEnd.getTime()) {
    effectiveEnd = dischargeTime;
    dischargeClipped = true;
  }

  // 判断整个护理日是否在入科之前
  const beforeAdmission = !!admissionTime && nursingDayEnd.getTime() <= admissionTime.getTime();

  // 判断整个护理日是否在出科之后
  const afterDischarge = !!dischargeTime && nursingDayStart.getTime() >= dischargeTime.getTime();

  // 有效区间长度 > 0
  const hasValidRange = !beforeAdmission && !afterDischarge
    && effectiveEnd.getTime() > effectiveStart.getTime();

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
  if (record.code === 'param_Yishi') { return false; }
  if (!DISPLAY_BEDSIDE_CODES.has(record.code) && !isDrainCode(record.code)) { return false; }
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
  const normalizedCode = String(code ?? '').trim();

  // 兼容历史code，业务显示名称已调整为"胃管负压引流量"
  if (normalizedCode === 'param_tube_胃肠减压') {
    return '胃管负压引流量';
  }

  const stripped = normalizedCode.replace(/^param_tube_/, '').replace(/^param_/, '');
  return stripped.endsWith('管') ? `${stripped.slice(0, -1)}液` : stripped.replace(/管/g, '液');
}

/**
 * 统一左闭右开区间判断：timestamp >= start && timestamp < end。
 */
function inRange(time: string, start: Date, end: Date): boolean {
  const value = databaseTimeValue(time);
  return Number.isFinite(value) && value >= start.getTime() && value < end.getTime();
}

function sumBedsideByCodes(records: BedsideRecord[], codes: readonly string[]): number {
  return records.filter(item => codes.includes(item.code)).reduce((sum, item) => sum + parseAmount(item.strVal), 0);
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
): string[] {
  const startMs = effectiveStart.getTime();
  const endMs = effectiveEnd.getTime();
  const seen = new Map<string, number>(); // name → first occurrence timestamp

  for (const item of bedside) {
    if (item.valid === false || !isDrainCode(item.code) || !hasText(item.strVal)) { continue; }
    const ts = databaseTimeValue(item.time);
    if (!Number.isFinite(ts) || ts < startMs || ts >= endMs) { continue; }
    const name = drainName(item.code);
    if (!seen.has(name)) {
      seen.set(name, ts);
    }
  }

  // 按首次出现时间排序，相同名称合并
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
  // 关键：每个小结必须按自己的 periodStart/periodEnd 计算有效范围，
  // 不能复用整个护理日的 stayRange。
  const stay = resolveActiveStayRange(patient, periodStart, periodEnd);
  const actualStart = stay.effectiveStart;
  const actualEnd = stay.effectiveEnd;
  const startTs = actualStart.getTime();
  const endTs = actualEnd.getTime();

  const plannedStartTs = periodStart.getTime();
  const plannedEndTs = periodEnd.getTime();

  // 左闭右开：timestamp >= start && timestamp < end
  const records = source.bedside.filter(item => {
    if (item.valid === false) { return false; }
    const ts = databaseTimeValue(item.time);
    return Number.isFinite(ts) && ts >= startTs && ts < endTs;
  });

  // 动态标题
  const summaryLabel = buildSummaryLabel({
    defaultLabel: label,
    kind,
    actualStart,
    actualEnd,
    admissionClipped: stay.admissionClipped,
    dischargeClipped: stay.dischargeClipped,
  });

  // 入量分类 - 固定使用定义
  const inputItems: HljldSummaryItem[] = INPUT_SUMMARY_DEFINITIONS.map(def => ({
    key: def.key,
    label: def.label,
    amount: sumBedsideByCodes(records, def.codes),
    unit: 'ml' as const,
  }));
  const totalInput = inputItems.reduce((sum, item) => sum + item.amount, 0);

  // 排出物分类 - 固定使用定义，不按当前区间过滤
  const outputItems: HljldSummaryItem[] = OUTPUT_SUMMARY_DEFINITIONS
    .map(def => ({
      key: def.key,
      label: def.label,
      amount: records.filter(item => item.code === def.code).reduce((sum, item) => sum + parseAmount(item.strVal), 0),
      unit: 'ml' as const,
    }));
  const outputTotal = outputItems.reduce((sum, item) => sum + item.amount, 0);

  // 引流液分类 - 使用固定的 drainNames
  const drainItems: HljldSummaryItem[] = drainNames.map(name => ({
    key: `drain-${name}`,
    label: name,
    amount: records
      .filter(item => isDrainCode(item.code) && drainName(item.code) === name)
      .reduce((total, item) => total + parseAmount(item.strVal), 0),
    unit: 'ml' as const,
  }));
  const drainTotal = drainItems.reduce((sum, item) => sum + item.amount, 0);

  const totalOutput = outputTotal + drainTotal;

  return {
    kind,
    label: summaryLabel,
    periodText: `${formatTime(startTs)}—${formatTime(endTs)}`,
    plannedStart: plannedStartTs,
    plannedEnd: plannedEndTs,
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
    balance: totalOutput - totalInput,
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

/** 从 tubeExe 构建管路护理条目 */
export function buildTubeNursingEntries(source: HljldSourceData, start: Date, end: Date): TubeNursingEntry[] {
  const entries: TubeNursingEntry[] = [];
  const startMs = start.getTime();
  const endMs = end.getTime();

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
      const ts = databaseTimeValue(record.time);
      // 左闭右开
      if (!Number.isFinite(ts) || ts < startMs || ts >= endMs) { continue; }

      const text = buildTubeNursingText(exe, record, view);
      if (!text) { continue; }

      entries.push({
        key: `tube-${exe._id}-${record._id}-${Math.floor(ts)}`,
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
): HljldTimeRow[] {
  const tubeEntries = buildTubeNursingEntries(source, start, end);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const events: Array<{ timestamp: number }> = [
    ...source.bedside.filter(isRenderableBedsideRecord).map(item => ({ timestamp: minuteKey(item.time) })),
    ...source.drugExecutions.filter(isRenderableDrugExecution).map(item => ({ timestamp: minuteKey(item.startTime) })),
    ...source.nurseRecords.filter(item => item.valid !== false && !!item.time && hasText(item.desc)).map(item => ({ timestamp: minuteKey(item.time) })),
    ...tubeEntries.map(item => ({ timestamp: minuteKey(item.time) })),
  ].filter(item => Number.isFinite(item.timestamp) && item.timestamp * 60000 >= startMs && item.timestamp * 60000 < endMs);

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
      .filter(item => isDrainCode(item.code))
      .map(item => ({ name: drainName(item.code), amount: displayAmount(item.strVal), numericAmount: parseAmount(item.strVal) }));

    const values = (code: string) => bedside.filter(item => item.code === code).map(item => displayAmount(item.strVal)).filter(Boolean);

    // 签名：只使用 param_Yishi 的 editUser
    const signUserId = resolveYishiSignerId(timeMs, source.bedside);
    const signature = signUserId ? (accountMap.get(signUserId) || '') : '';

    // 普通护理记录 + 管路护理记录拼接
    const normalNursing = source.nurseRecords
      .filter(item => isValidBusinessRecord(item) && minuteKey(item.time) === key && hasText(item.desc))
      .map(item => String(item.desc).trim())
      .filter(Boolean);
    const tubeNursing = tubeEntries
      .filter(item => minuteKey(item.time) === key)
      .map(item => item.text)
      .filter(Boolean);
    const combinedNursing = [...normalNursing, ...tubeNursing].filter(Boolean).join('；');

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
      nursingRecords: combinedNursing ? [combinedNursing] : [],
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
    if (group.timestamp > nowMs) { continue; }

    // 明细不能越过有效结束时间
    if (effectiveEndMs !== undefined && group.timestamp >= effectiveEndMs) { continue; }

    // 明细不能越过次日07:00
    if (group.timestamp >= nextMorningBoundaryMs) { continue; }

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

  // 出科等于或晚于次日07:00：正常时间轴处理，不出科总结
  // 只有到次日07:00才展示 shift + 24h 总结
  // 但如果次日07:00前已出科，则不再追加这两个总结
  if (!hasDischarge) {
    if (showShiftSummary) {
      result.push({ kind: 'shift-summary', key: 'shift-summary-next-07', timestamp: nextMorningBoundaryMs, summary: shiftSummary });
    }
    if (showFullDaySummary) {
      result.push({ kind: 'full-day-summary', key: 'full-day-summary-next-07', timestamp: nextMorningBoundaryMs, summary: fullDaySummary });
    }
  }

  return result;
}
