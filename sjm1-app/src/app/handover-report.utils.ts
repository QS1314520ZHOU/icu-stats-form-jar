import {
  BedsideRecord,
  DepartmentDailySnapshot,
  DepartmentPatient,
  HandoverPatientRow,
  HandoverReportViewModel,
  HandoverStatus,
  NightFluidSummary,
  NightVitalSigns,
  ShiftKey,
  ShiftRange,
  ShiftStatistics,
} from './handover-report.models';
import { buildSafetyMetrics } from './handover-report.metrics';

const SHIFT_KEYS: ShiftKey[] = ['day', 'evening', 'night'];

const STATUS_ORDER: Record<HandoverStatus, number> = {
  '出院': 1, '转出': 2, '死亡': 3, '转入': 4, '入院': 5, '病危': 6, '手术': 7,
};

export function buildShiftRanges(selectedDate: Date): Record<ShiftKey, ShiftRange> {
  const at = (dayOffset: number, hour: number, minute = 0): Date =>
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + dayOffset, hour, minute, 0, 0);

  return {
    day: { key: 'day', label: '白班', start: at(0, 8), end: at(0, 18, 1), settlementTime: at(0, 18) },
    evening: { key: 'evening', label: '中班', start: at(0, 18, 1), end: at(1, 0), settlementTime: at(1, 0) },
    night: { key: 'night', label: '夜班', start: at(1, 0), end: at(1, 8), settlementTime: at(1, 8) },
  };
}

function timeValue(value?: string): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function inShift(value: string | undefined, range: ShiftRange): boolean {
  const ts = timeValue(value);
  return Number.isFinite(ts) && ts >= range.start.getTime() && ts < range.end.getTime();
}

function resolveShift(value: string | undefined, ranges: Record<ShiftKey, ShiftRange>): ShiftKey | undefined {
  return SHIFT_KEYS.find(key => inShift(value, ranges[key]));
}

function isInDepartmentAt(patient: DepartmentPatient, settlementTime: Date): boolean {
  const settlement = settlementTime.getTime();
  const admission = patient.icuAdmissionTime ? timeValue(patient.icuAdmissionTime) : Number.NEGATIVE_INFINITY;
  const discharge = patient.icuDischargeTime ? timeValue(patient.icuDischargeTime) : Number.POSITIVE_INFINITY;
  return admission <= settlement && settlement < discharge;
}

function patientId(patient: DepartmentPatient): string {
  return String(patient.id ?? patient._id ?? '').trim();
}

function nurseRecordPid(patient: DepartmentPatient): string {
  return String(patient.nurseRecordPid ?? patient.id ?? patient._id ?? '').trim();
}

function bedNo(patient: DepartmentPatient): string {
  const raw = String(patient.hisBed || patient.bedNo || '').trim();
  return raw.endsWith('床') ? raw : raw ? `${raw}床` : '';
}

function bedNumber(value: string): number {
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function diagnosis(patient: DepartmentPatient): string {
  return String(patient.clinicalDiagnosis || patient.diagnosis || '').trim();
}

function formatChineseDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dischargeStatus(dischargedType?: string): '出院' | '转出' | '死亡' | undefined {
  const v = String(dischargedType || '');
  if (v.includes('死亡')) return '死亡';
  if (v.includes('转出') || v.includes('转科')) return '转出';
  if (v.includes('出院')) return '出院';
  return undefined;
}

function admissionStatus(admissionType?: string): '转入' | '入院' | undefined {
  const v = String(admissionType || '');
  if (v.includes('转入')) return '转入';
  if (v.includes('入院')) return '入院';
  return undefined;
}

function defaultEventText(patient: DepartmentPatient, status: HandoverStatus): string {
  switch (status) {
    case '出院': return `患者于${formatChineseDateTime(patient.icuDischargeTime)}出院。`;
    case '转出': return `患者转${patient.dischargedDepartment || '相关科室'}继续治疗。`;
    case '死亡': return `患者于${formatChineseDateTime(patient.icuDischargeTime)}死亡。`;
    default: return '';
  }
}

/**
 * 页面交班书写顺序：白班 → 中班 → 夜班。
 * 转入、入院等患者从事件发生班次开始，允许在当前班次及后续班次插入护理记录。
 */
function editableShiftsFrom(eventShift: ShiftKey): ShiftKey[] {
  const order: ShiftKey[] = ['day', 'evening', 'night'];
  const index = order.indexOf(eventShift);
  return index < 0 ? [] : order.slice(index);
}

function createRow(
  patient: DepartmentPatient,
  status: HandoverStatus,
  eventShift: ShiftKey,
  eventTime: number,
  bedsideRecords: BedsideRecord[],
  ranges: Record<ShiftKey, ShiftRange>,
): HandoverPatientRow {
  const id = patientId(patient);
  const editable = ['转入', '入院', '病危', '手术'].includes(status);
  const isCritical = status === '病危';

  // 为每个患者计算生命体征和出入量总结
  const nightVitalSigns = extractPatientNightVitalSigns(patient, bedsideRecords, ranges);
  const { summary: nightFluidSummary, hours: fluidHours } = calculatePatientNightFluidSummary(patient, bedsideRecords, ranges, isCritical);

  return {
    key: `${status}:${id}:${eventTime}`,
    patientId: id,
    nurseRecordPid: nurseRecordPid(patient),
    bedNo: bedNo(patient),
    name: patient.name || '',
    mrn: patient.mrn || '',
    diagnosis: diagnosis(patient),
    status,
    eventTime,
    eventShift,
    editableShifts: editable ? editableShiftsFrom(eventShift) : [],
    shiftTexts: { [eventShift]: defaultEventText(patient, status) },
    nightVitalSigns,
    nightFluidSummary,
    fluidHours,
  };
}

function emptyStatistics(): ShiftStatistics {
  return { total: 0, discharged: 0, transferredOut: 0, death: 0, transferredIn: 0, admission: 0, operation: 0, critical: 0, specialCare: 0 };
}

function buildPatientRows(snapshot: DepartmentDailySnapshot, ranges: Record<ShiftKey, ShiftRange>): HandoverPatientRow[] {
  const rows: HandoverPatientRow[] = [];

  for (const patient of snapshot.patients) {
    const outStatus = dischargeStatus(patient.dischargedType);
    const outShift = resolveShift(patient.icuDischargeTime, ranges);
    if (outStatus && outShift) {
      rows.push(createRow(patient, outStatus, outShift, timeValue(patient.icuDischargeTime), snapshot.bedsideRecords, ranges));
    }

    const inStatus = admissionStatus(patient.admissionType);
    const inShift = resolveShift(patient.icuAdmissionTime, ranges);
    if (inStatus && inShift) {
      rows.push(createRow(patient, inStatus, inShift, timeValue(patient.icuAdmissionTime), snapshot.bedsideRecords, ranges));
    }

    for (const op of patient.patientOperations || []) {
      if (op.valid === false || !op.endTime) continue;
      const opShift = resolveShift(op.endTime, ranges);
      if (!opShift) continue;
      rows.push(createRow(patient, '手术', opShift, timeValue(op.endTime), snapshot.bedsideRecords, ranges));
    }
  }

  for (const selection of snapshot.draft.criticalPatients || []) {
    const patient = snapshot.patients.find(p => patientId(p) === selection.patientId);
    if (!patient) continue;
    const row = createRow(patient, '病危', 'night', ranges.night.settlementTime.getTime(), snapshot.bedsideRecords, ranges);
    row.editableShifts = ['night', 'day', 'evening'];
    row.shiftTexts = {};
    rows.push(row);
  }

  // 从嵌套结构读取患者交班文本
  for (const row of rows) {
    const patientTexts = snapshot.draft.patientTexts[row.key];
    if (!patientTexts) continue;
    for (const shift of SHIFT_KEYS) {
      const override = patientTexts[shift];
      if (override !== undefined) row.shiftTexts[shift] = override;
    }
  }

  return rows.sort((a, b) => {
    const sd = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (sd !== 0) return sd;
    if (a.status === '病危') return bedNumber(a.bedNo) - bedNumber(b.bedNo);
    return a.eventTime - b.eventTime || bedNumber(a.bedNo) - bedNumber(b.bedNo);
  });
}

function buildStatistics(snapshot: DepartmentDailySnapshot, ranges: Record<ShiftKey, ShiftRange>, rows: HandoverPatientRow[]): Record<ShiftKey, ShiftStatistics> {
  const result: Record<ShiftKey, ShiftStatistics> = { night: emptyStatistics(), day: emptyStatistics(), evening: emptyStatistics() };
  for (const shift of SHIFT_KEYS) {
    const s = result[shift];
    s.total = snapshot.patients.filter(p => isInDepartmentAt(p, ranges[shift].settlementTime)).length;
    s.critical = s.total;
    for (const row of rows.filter(r => r.eventShift === shift)) {
      switch (row.status) {
        case '出院': s.discharged++; break;
        case '转出': s.transferredOut++; break;
        case '死亡': s.death++; break;
        case '转入': s.transferredIn++; break;
        case '入院': s.admission++; break;
        case '手术': s.operation++; break;
      }
    }
  }
  return result;
}

export function buildHandoverReport(snapshot: DepartmentDailySnapshot, selectedDate: Date): HandoverReportViewModel {
  const ranges = buildShiftRanges(selectedDate);
  const rows = buildPatientRows(snapshot, ranges);
  const statistics = buildStatistics(snapshot, ranges, rows);
  const metrics = buildSafetyMetrics(snapshot, ranges);
  return { ranges, rows, statistics, metrics };
}

/**
 * 为单个患者提取6点整的生命体征数据
 */
function extractPatientNightVitalSigns(
  patient: DepartmentPatient,
  bedsideRecords: BedsideRecord[],
  ranges: Record<ShiftKey, ShiftRange>,
): NightVitalSigns {
  const pid = String(patient.nurseRecordPid ?? patient.id ?? patient._id ?? '').trim();
  if (!pid) {
    console.warn('[HANDOVER] 患者缺少PID:', patient.name, patient);
    return {};
  }

  // 夜班时间范围：使用night shift的时间范围（次日00:00 ~ 08:00）
  const nightStart = new Date(ranges.night.start);
  const nightEnd = new Date(ranges.night.end);

  const vitalSigns: NightVitalSigns = {};

  // 定义需要提取的生命体征代码
  const vitalSignCodes = {
    temperature: 'param_T',
    heartRate: 'param_HR',
    respiration: 'param_resp',
    spO2: 'param_spo2',
    nibpSystolic: 'param_nibp_s',
    nibpDiastolic: 'param_nibp_d',
    ibpSystolic: 'param_ibp_s',
    ibpDiastolic: 'param_ibp_d',
    cvp: 'param_cvp',
  };

  // 过滤该患者在夜班时间范围内的记录（次日00:00 ~ 08:00）
  const patientRecords = bedsideRecords.filter(record => {
    if (record.valid === false) return false;
    if (record.pid !== pid) return false;
    const recordTime = new Date(record.time).getTime();
    return recordTime >= nightStart.getTime() && recordTime < nightEnd.getTime();
  });

  // 调试：输出匹配的记录
  console.info('[HANDOVER][vital-signs]', {
    patientName: patient.name,
    pid,
    nightStart: nightStart.toISOString(),
    nightEnd: nightEnd.toISOString(),
    totalBedsideRecords: bedsideRecords.length,
    matchedRecords: patientRecords.length,
  });

  // 查找6点整（06:00:00 - 06:00:59）的记录
  const sixOClockRecords = patientRecords.filter(record => {
    const recordDate = new Date(record.time);
    return recordDate.getHours() === 6;
  });

  // 调试：输出6点的记录
  console.info('[HANDOVER][vital-signs-6am]', {
    patientName: patient.name,
    sixOClockRecords: sixOClockRecords.length,
    records: sixOClockRecords.map(r => ({ code: r.code, strVal: r.strVal, time: r.time })),
    allCodes: [...new Set(sixOClockRecords.map(r => r.code))],
  });

  // 提取各生命体征数据
  for (const field in vitalSignCodes) {
    const code = vitalSignCodes[field as keyof typeof vitalSignCodes];
    const record = sixOClockRecords.find(r => r.code === code);
    if (record && record.strVal !== undefined && record.strVal !== '') {
      (vitalSigns as any)[field] = String(record.strVal);
    }
  }

  // 调试：输出提取结果
  console.info('[HANDOVER][vital-signs-result]', {
    patientName: patient.name,
    vitalSigns,
    hasData: Object.values(vitalSigns).some(v => v !== undefined && v !== ''),
  });

  return vitalSigns;
}

/**
 * 为单个患者计算出入量总结
 * 普通患者：当天08:00 ~ 次日08:00（24小时，8-8左闭右开）
 * 入院患者：入科时间 ~ 次日08:00（不足24小时）
 * 病危患者：当天08:00 ~ 次日08:00（24小时）
 */
function calculatePatientNightFluidSummary(
  patient: DepartmentPatient,
  bedsideRecords: BedsideRecord[],
  ranges: Record<ShiftKey, ShiftRange>,
  isCritical: boolean = false,
): { summary: NightFluidSummary; hours: number } {
  const pid = String(patient.nurseRecordPid ?? patient.id ?? patient._id ?? '').trim();
  if (!pid) {
    return { summary: { totalInput: 0, drugInput: 0, enteralInput: 0, totalOutput: 0, urineOutput: 0, drainageOutput: 0, excretionOutput: 0, balance: 0 }, hours: 0 };
  }

  // 出入量统计时间范围：当天08:00 ~ 次日08:00（北京时间）
  const day8am = new Date(ranges.day.start); // 当天08:00
  const nextDay8am = new Date(ranges.night.end); // 次日08:00

  // 确定实际起点
  let actualStart = day8am;
  if (!isCritical && patient.icuAdmissionTime) {
    const admTime = new Date(patient.icuAdmissionTime);
    // 入科时间在当天08:00之后，使用入科时间作为起点
    if (admTime.getTime() > day8am.getTime()) {
      actualStart = admTime;
    }
  }

  // 计算小时数（满30分钟进1，不满舍去）
  const rawHours = (nextDay8am.getTime() - actualStart.getTime()) / (1000 * 60 * 60);
  const hours = Math.round(rawHours);

  // 该患者在时间范围内的床旁记录
  const patientBedsideRecords = bedsideRecords.filter(record => {
    if (record.valid === false) return false;
    if (record.pid !== pid) return false;
    const recordTime = new Date(record.time).getTime();
    return recordTime >= actualStart.getTime() && recordTime < nextDay8am.getTime();
  });

  // 调试：输出匹配的记录
  console.info('[HANDOVER][fluid-summary]', {
    patientName: patient.name,
    pid,
    actualStart: actualStart.toISOString(),
    nextDay8am: nextDay8am.toISOString(),
    hours,
    isCritical,
    matchedRecords: patientBedsideRecords.length,
  });

  // 入量统计
  const inputCodes = [
    'param_带入药量',   // 带入药量
    'param_kouFu',      // 口服
    'param_biSi',       // 鼻饲
  ];

  let drugInput = 0;
  let enteralInput = 0;

  for (const record of patientBedsideRecords) {
    if (record.code === 'param_带入药量' || record.code === 'param_kouFu') {
      drugInput += parseAmount(record.strVal);
    } else if (record.code === 'param_biSi') {
      enteralInput += parseAmount(record.strVal);
    }
  }

  const totalInput = drugInput + enteralInput;

  // 出量统计
  let urineOutput = 0;
  let drainageOutput = 0;
  let excretionOutput = 0;

  // 尿量
  const urineCode = 'param_niaoLiang';
  const urineRecords = patientBedsideRecords.filter(r => r.code === urineCode);
  urineOutput = urineRecords.reduce((sum, r) => sum + parseAmount(r.strVal), 0);

  // 引流量（包含所有param_tube_开头的代码）
  const drainageRecords = patientBedsideRecords.filter(r => r.code.startsWith('param_tube_'));
  drainageOutput = drainageRecords.reduce((sum, r) => sum + parseAmount(r.strVal), 0);

  // 排出物（大便、呕吐物、痰液等）
  const excretionCodes = [
    'param_daBianAmount',  // 大便量
    'param_outuwuliang',   // 呕吐物量
    'param_tanLiang',      // 痰液量
  ];
  const excretionRecords = patientBedsideRecords.filter(r => excretionCodes.includes(r.code));
  excretionOutput = excretionRecords.reduce((sum, r) => sum + parseAmount(r.strVal), 0);

  const totalOutput = urineOutput + drainageOutput + excretionOutput;
  const balance = totalInput - totalOutput;

  return {
    summary: {
      totalInput,
      drugInput,
      enteralInput,
      totalOutput,
      urineOutput,
      drainageOutput,
      excretionOutput,
      balance,
    },
    hours,
  };
}

/**
 * 解析数量值
 */
function parseAmount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }
  const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}
