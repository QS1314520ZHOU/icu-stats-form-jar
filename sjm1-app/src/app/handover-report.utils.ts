import {
  DepartmentDailySnapshot,
  DepartmentPatient,
  HandoverPatientRow,
  HandoverReportViewModel,
  HandoverStatus,
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
    night: { key: 'night', label: '夜班', start: at(0, 0), end: at(0, 8), settlementTime: at(0, 8) },
    day: { key: 'day', label: '白班', start: at(0, 8), end: at(0, 18, 1), settlementTime: at(0, 18) },
    evening: { key: 'evening', label: '中班', start: at(0, 18, 1), end: at(1, 0), settlementTime: at(1, 0) },
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

function createRow(patient: DepartmentPatient, status: HandoverStatus, eventShift: ShiftKey, eventTime: number): HandoverPatientRow {
  const id = patientId(patient);
  const editable = ['转入', '入院', '病危', '手术'].includes(status);
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
      rows.push(createRow(patient, outStatus, outShift, timeValue(patient.icuDischargeTime)));
    }

    const inStatus = admissionStatus(patient.admissionType);
    const inShift = resolveShift(patient.icuAdmissionTime, ranges);
    if (inStatus && inShift) {
      rows.push(createRow(patient, inStatus, inShift, timeValue(patient.icuAdmissionTime)));
    }

    for (const op of patient.patientOperations || []) {
      if (op.valid === false || !op.endTime) continue;
      const opShift = resolveShift(op.endTime, ranges);
      if (!opShift) continue;
      rows.push(createRow(patient, '手术', opShift, timeValue(op.endTime)));
    }
  }

  for (const selection of snapshot.draft.criticalPatients || []) {
    const patient = snapshot.patients.find(p => patientId(p) === selection.patientId);
    if (!patient) continue;
    const row = createRow(patient, '病危', 'night', ranges.night.settlementTime.getTime());
    row.editableShifts = ['night', 'day', 'evening'];
    row.shiftTexts = {};
    rows.push(row);
  }

  for (const row of rows) {
    for (const shift of SHIFT_KEYS) {
      const override = snapshot.draft.patientTextOverrides[`${row.key}.${shift}`];
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
