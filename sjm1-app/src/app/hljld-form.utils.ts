import {
  BedsideRecord,
  DrugExecution,
  DrugMethodConfig,
  HljldSourceData,
  HljldSummary,
  HljldTimeRow,
  NameAmount,
  NameAmountRoute,
  PatientContext,
} from './hljld-form.models';

const OUTPUT_CODE_NAMES: Record<string, string> = {
  param_chaoLvLiang: '净超滤量',
  param_niaoLiang: '尿量',
  param_daBianAmount: '大便量',
  'param_造瘘口量': '造瘘口量',
  param_outuwuliang: '呕吐物量',
  'param_咯血': '咯血',
  param_tanLiang: '痰液量',
};

const NON_DRUG_INPUT_CODES = new Set([
  'param_带入药量',
  'param_kouFu',
  'param_biSi',
  'param_YaoYeti_in_hour',
  'param_YaoStomach_in_hour',
  'param_YaoShuXue_in_hour',
]);
const INFUSION_CODES = new Set(['param_YaoYeti_in_hour']);
const DIET_CODES = new Set(['param_YaoStomach_in_hour', 'param_biSi', 'param_kouFu']);

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

export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function minuteKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) { return ''; }
  d.setSeconds(0, 0);
  return d.toISOString();
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

function normalizeCodes(code: string): string[] {
  return String(code || '')
    .split(/[、,，;；|/\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function findDrugMethod(methodCode: string | undefined, configs: DrugMethodConfig[]): DrugMethodConfig | undefined {
  const code = String(methodCode || '').trim();
  return configs.find(config => config.valid !== false && normalizeCodes(config.code).includes(code));
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

function drugToCell(exe: DrugExecution, config: DrugMethodConfig, enteral: boolean): NameAmountRoute {
  const drugList = exe.drugList || [];
  const rawName = drugList.map(item => item.name).filter(Boolean).join('、');
  const amount = drugList.reduce((sum, item) => sum + parseAmount(item.liquidAmount), 0);
  return {
    name: enteral ? enteralDisplayName(rawName) : rawName,
    amount: amount ? String(amount) : '',
    numericAmount: amount,
    route: routeLabel(config.name),
  };
}

function bedsideInputCell(record: BedsideRecord): NameAmountRoute {
  const route = record.code === 'param_kouFu' ? 'po' : record.code === 'param_biSi' ? '鼻饲' : '';
  return {
    name: record.remark || '',
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
  const value = new Date(time).getTime();
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

function sumBedside(records: BedsideRecord[], codes: Set<string>): number {
  return records.filter(item => codes.has(item.code)).reduce((sum, item) => sum + parseAmount(item.strVal), 0);
}

function outputRecords(records: BedsideRecord[]): BedsideRecord[] {
  return records.filter(item => Boolean(OUTPUT_CODE_NAMES[item.code]) || item.code.includes('引流'));
}

export function buildSummary(
  kind: 'day' | '24h',
  patient: PatientContext,
  source: HljldSourceData,
  periodStart: Date,
  periodEnd: Date,
): HljldSummary {
  const stay = activeStayBoundary(patient, periodStart, periodEnd);
  const records = source.bedside.filter(item => inRange(item.time, stay.start, stay.end));
  const totalInput = sumBedside(records, NON_DRUG_INPUT_CODES);
  const infusion = sumBedside(records, INFUSION_CODES);
  const diet = sumBedside(records, DIET_CODES);
  const output = outputRecords(records);
  const totalOutput = output.reduce((sum, item) => sum + parseAmount(item.strVal), 0);
  const urine = records.filter(item => item.code === 'param_niaoLiang').reduce((sum, item) => sum + parseAmount(item.strVal), 0);
  return {
    kind,
    label: kind === 'day' ? '日间小结' : '24小时总结',
    periodText: `${formatDateTime(stay.start)}—${formatDateTime(stay.end)}（${durationText(stay.start, stay.end)}）`,
    totalInput,
    infusion,
    diet,
    totalOutput,
    // 严格按需求文档：平衡量 = 总出量 - 总入量。
    balance: totalOutput - totalInput,
    urine,
    otherOutput: totalOutput - urine,
  };
}

export function buildRows(
  source: HljldSourceData,
  start: Date,
  end: Date,
): HljldTimeRow[] {
  const events: Array<{ time: string }> = [
    ...source.bedside.map(item => ({ time: item.time })),
    ...source.drugExecutions.map(item => ({ time: item.startTime })),
    ...source.nurseRecords.map(item => ({ time: item.time })),
    ...source.signatures.map(item => ({ time: item.time })),
  ].filter(item => inRange(item.time, start, end));

  const keys = Array.from(new Set(events.map(item => minuteKey(item.time)).filter(Boolean))).sort();

  return keys.map(key => {
    const time = new Date(key);
    const bedside = source.bedside.filter(item => minuteKey(item.time) === key);
    const drugExecutions = source.drugExecutions.filter(item => item.status !== 'invalid' && minuteKey(item.startTime) === key);
    const medications: NameAmountRoute[] = [];
    const enteral: NameAmountRoute[] = [];

    drugExecutions.forEach(exe => {
      const method = findDrugMethod(exe.methodCode, source.drugMethods);
      if (!method) { return; }
      const target = method.group === '胃肠' ? enteral : medications;
      target.push(drugToCell(exe, method, method.group === '胃肠'));
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
    const signatures = source.signatures
      .filter(item => minuteKey(item.time) === key)
      .map(item => item.signature || item.username || item.trueName || '')
      .filter(Boolean);
    if (!signatures.length) {
      signatures.push(...bedside.filter(item => minuteKey(item.time) === key).map(item => item.username || item.trueName || '').filter(Boolean));
    }

    return {
      key,
      time,
      timeText: formatDateTime(time),
      medications,
      enteral,
      outputs,
      drains,
      examination: values('param_外出检查'),
      treatment: values('param_物理治疗'),
      basicCare: values('param_基础护理1'),
      healthEducation: values('param_健康教育'),
      nursingRecords: source.nurseRecords.filter(item => item.valid !== false && minuteKey(item.time) === key).map(item => item.desc || '').filter(Boolean),
      signature: Array.from(new Set(signatures)).join('、'),
    };
  });
}
