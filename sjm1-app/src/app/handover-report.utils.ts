import { databaseTimeValue, formatShanghaiDateMinute } from './form-date.util';
import {
  CriticalPatient,
  DetailEventType,
  HandoverDetail,
  HandoverReportContent,
  ShiftDefinition,
  ShiftKind,
  StatusItem,
} from './handover-report.models';

/* =========================================================
   班次定义
   ========================================================= */

export const SHIFT_DEFINITIONS: ShiftDefinition[] = [
  { kind: 'night', label: '夜班', startHour: 0, endHour: 8, settlementHour: 8 },
  { kind: 'day', label: '白班', startHour: 8, endHour: 18, settlementHour: 18 },
  { kind: 'evening', label: '中班', startHour: 18, endHour: 24, settlementHour: 24 },
];

/** 根据当前时间确定当前班次 */
export function getCurrentShift(): ShiftDefinition {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 8) return SHIFT_DEFINITIONS[0];
  if (hour >= 8 && hour < 18) return SHIFT_DEFINITIONS[1];
  return SHIFT_DEFINITIONS[2];
}

/** 获取班次的时间范围（上海时间） */
export function getShiftRange(shift: ShiftKind, referenceDate: Date): { start: Date; end: Date } {
  const def = SHIFT_DEFINITIONS.find(s => s.kind === shift)!;
  const base = new Date(referenceDate);
  base.setHours(0, 0, 0, 0);

  const start = new Date(base);
  start.setHours(def.startHour, 0, 0, 0);

  const end = new Date(base);
  if (def.endHour === 24) {
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
  } else {
    end.setHours(def.endHour, 0, 0, 0);
  }

  return { start, end };
}

/** 结算时间 */
export function getSettlementTime(shift: ShiftKind, referenceDate: Date): Date {
  const def = SHIFT_DEFINITIONS.find(s => s.kind === shift)!;
  const base = new Date(referenceDate);
  base.setHours(0, 0, 0, 0);
  if (def.settlementHour === 24) {
    base.setDate(base.getDate() + 1);
    base.setHours(0, 0, 0, 0);
  } else {
    base.setHours(def.settlementHour, 0, 0, 0);
  }
  return base;
}

/* =========================================================
   有效性判断
   ========================================================= */

export function isValidRecord(record: any): boolean {
  if (!record) return false;
  if (record.valid === false) return false;
  const status = String(record.status ?? '').trim().toLowerCase();
  if (status === 'invalid') return false;
  return true;
}

/* =========================================================
   明细事件构建
   ========================================================= */

const DETAIL_SORT_ORDER: Record<DetailEventType, number> = {
  discharge: 0,
  transfer: 1,
  death: 2,
  transferIn: 3,
  admission: 4,
  critical: 5,
  surgery: 6,
};

/** 排序明细：先按事件类型优先级，再按时间升序 */
export function sortDetails(details: HandoverDetail[]): HandoverDetail[] {
  return [...details].sort((a, b) => {
    const typeDiff = (DETAIL_SORT_ORDER[a.eventType] ?? 99) - (DETAIL_SORT_ORDER[b.eventType] ?? 99);
    if (typeDiff !== 0) return typeDiff;
    const timeA = databaseTimeValue(a.time);
    const timeB = databaseTimeValue(b.time);
    return (Number.isFinite(timeA) ? timeA : 0) - (Number.isFinite(timeB) ? timeB : 0);
  });
}

/** 格式化时间为上海时间显示 */
export function formatTime(time: string | Date): string {
  const ts = typeof time === 'string' ? databaseTimeValue(time) : time.getTime();
  return Number.isFinite(ts) ? formatShanghaiDateMinute(ts) : '';
}

/* =========================================================
   状态栏指标计算
   ========================================================= */

/** 从 bedside 记录中提取代码值 */
function getBedsideValues(records: any[], code: string): (string | number)[] {
  return records
    .filter(r => isValidRecord(r) && r.code === code)
    .map(r => r.strVal)
    .filter(v => v !== null && v !== undefined && v !== '');
}

/** 计算状态栏指标 */
export function calculateStatusItems(
  bedside: any[],
  tubeExecutions: any[],
  shift: ShiftDefinition,
  referenceDate: Date,
): StatusItem[] {
  const { start, end } = getShiftRange(shift.kind, referenceDate);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const records = bedside.filter(r => {
    if (!isValidRecord(r)) return false;
    const ts = databaseTimeValue(r.time);
    return Number.isFinite(ts) && ts >= startMs && ts < endMs;
  });

  const items: StatusItem[] = [];

  // 体温 ≥ 38℃
  const temps = getBedsideValues(records, 'param_tiWen').map(Number).filter(v => !isNaN(v));
  items.push({ label: '体温≥38℃', value: temps.some(t => t >= 38) ? '有' : '', isRed: temps.some(t => t >= 38) });

  // 血糖 < 3.9
  const sugars = getBedsideValues(records, 'param_xueTang').map(Number).filter(v => !isNaN(v));
  items.push({ label: '血糖<3.9', value: sugars.some(s => s < 3.9) ? '有' : '', isRed: sugars.some(s => s < 3.9) });

  // 膀胱冲洗
  const bladder = getBedsideValues(records, 'param_pangGuangChongXi');
  items.push({ label: '膀胱冲洗', value: bladder.length > 0 ? '有' : '', isRed: bladder.length > 0 });

  // 有创通气
  const invasive = getBedsideValues(records, 'param_youChuangTongQi');
  items.push({ label: '有创通气', value: invasive.length > 0 ? '有' : '', isRed: invasive.length > 0 });

  // 新增鼻肠管/气管插管/气切
  const ngTube = getBedsideValues(records, 'param_biChangGuan');
  const etTube = getBedsideValues(records, 'param_qiGuanChaGuan');
  const trach = getBedsideValues(records, 'param_qiQie');
  const hasNewTube = ngTube.length > 0 || etTube.length > 0 || trach.length > 0;
  items.push({ label: '新增鼻肠管/气管插管/气切', value: hasNewTube ? '有' : '', isRed: hasNewTube });

  // 脱机
  const weaning = getBedsideValues(records, 'param_tuoJi');
  items.push({ label: '脱机', value: weaning.length > 0 ? '有' : '', isRed: weaning.length > 0 });

  // 48h再插管
  const reintubation = getBedsideValues(records, 'param_48hZaiChaGuan');
  items.push({ label: '48h再插管', value: reintubation.length > 0 ? '有' : '', isRed: reintubation.length > 0 });

  // IBP
  const ibp = getBedsideValues(records, 'param_IBP');
  items.push({ label: 'IBP', value: ibp.length > 0 ? '有' : '', isRed: ibp.length > 0 });

  // CRRT
  const crrt = getBedsideValues(records, 'param_CRRT');
  items.push({ label: 'CRRT', value: crrt.length > 0 ? '有' : '', isRed: crrt.length > 0 });

  // 俯卧位
  const prone = getBedsideValues(records, 'param_fuWoWei');
  items.push({ label: '俯卧位', value: prone.length > 0 ? '有' : '', isRed: prone.length > 0 });

  // IABP
  const iabp = getBedsideValues(records, 'param_IABP');
  items.push({ label: 'IABP', value: iabp.length > 0 ? '有' : '', isRed: iabp.length > 0 });

  // PICCO
  const picco = getBedsideValues(records, 'param_PICCO');
  items.push({ label: 'PICCO', value: picco.length > 0 ? '有' : '', isRed: picco.length > 0 });

  // ECMO
  const ecmo = getBedsideValues(records, 'param_ECMO');
  items.push({ label: 'ECMO', value: ecmo.length > 0 ? '有' : '', isRed: ecmo.length > 0 });

  // 解除隔离
  const isolation = getBedsideValues(records, 'param_jieChuGeLi');
  items.push({ label: '解除隔离', value: isolation.length > 0 ? '有' : '', isRed: isolation.length > 0 });

  // 高风险：跌倒
  const fall = getBedsideValues(records, 'param_dieDaoFengXian');
  items.push({ label: '高风险-跌倒', value: fall.length > 0 ? '有' : '', isRed: fall.length > 0 });

  // 高风险：压疮
  const pressure = getBedsideValues(records, 'param_yaChuangFengXian');
  items.push({ label: '高风险-压疮', value: pressure.length > 0 ? '有' : '', isRed: pressure.length > 0 });

  // 高风险：管道滑脱
  const tubeSlip = getBedsideValues(records, 'param_guanDaoHuaTuo');
  items.push({ label: '高风险-管道滑脱', value: tubeSlip.length > 0 ? '有' : '', isRed: tubeSlip.length > 0 });

  // 高风险：自杀
  const suicide = getBedsideValues(records, 'param_ziShaFengXian');
  items.push({ label: '高风险-自杀', value: suicide.length > 0 ? '有' : '', isRed: suicide.length > 0 });

  // 非计划转入ICU
  const unplanned = getBedsideValues(records, 'param_feiJiHuaZhuanRu');
  items.push({ label: '非计划转入ICU', value: unplanned.length > 0 ? '有' : '', isRed: unplanned.length > 0 });

  return items;
}

/* =========================================================
   危重患者信息
   ========================================================= */

export function buildCriticalPatientInfo(
  bedside: any[],
  tubeExecutions: any[],
  patient: any,
  shift: ShiftDefinition,
  referenceDate: Date,
): CriticalPatient {
  const { start, end } = getShiftRange(shift.kind, referenceDate);
  const startMs = start.getTime();
  const endMs = end.getTime();

  // 06:00 生命体征（夜班）
  const vitalRecords = bedside.filter(r => {
    if (!isValidRecord(r)) return false;
    const ts = databaseTimeValue(r.time);
    return Number.isFinite(ts) && ts >= startMs && ts < endMs;
  });

  const vitalSigns = [
    `体温：${getBedsideValues(vitalRecords, 'param_tiWen').join('/') || '—'}`,
    `心率：${getBedsideValues(vitalRecords, 'param_xinLv').join('/') || '—'}`,
    `呼吸：${getBedsideValues(vitalRecords, 'param_huXi').join('/') || '—'}`,
    `血压：${getBedsideValues(vitalRecords, 'param_xueYa').join('/') || '—'}`,
    `血氧：${getBedsideValues(vitalRecords, 'param_xueYang').join('/') || '—'}`,
  ].join('；');

  // 24h出入量
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const dayRecords = bedside.filter(r => {
    if (!isValidRecord(r)) return false;
    const ts = databaseTimeValue(r.time);
    return Number.isFinite(ts) && ts >= dayStart.getTime() && ts < dayEnd.getTime();
  });

  const totalInput = dayRecords.filter(r => ['param_YaoYeti_in_hour', 'param_YaoStomach_in_hour', 'param_YaoShuXue_in_hour', 'param_kouFu', 'param_biSi', 'param_带入药量'].includes(r.code))
    .reduce((sum, r) => sum + Number(r.strVal || 0), 0);
  const totalOutput = dayRecords.filter(r => ['param_niaoLiang', 'param_daBianAmount', 'param_chaoLvLiang'].includes(r.code) || String(r.code || '').includes('引流'))
    .reduce((sum, r) => sum + Number(r.strVal || 0), 0);

  // 在科时长
  const admissionTs = databaseTimeValue(patient?.admissionTime || patient?.inTime);
  const durationHours = Number.isFinite(admissionTs) ? Math.floor((Date.now() - admissionTs) / 3600000) : null;
  const duration = durationHours !== null && durationHours < 24 ? `${durationHours}小时` : undefined;

  return {
    pid: patient?.id || patient?._id || '',
    bedNo: String(patient?.hisBed ?? patient?.bedNo ?? ''),
    patientName: String(patient?.name ?? patient?.patientName ?? ''),
    hospitalNo: String(patient?.mrn ?? patient?.hospitalNo ?? ''),
    diagnosis: String(patient?.clinicalDiagnosis ?? patient?.diagnosis ?? ''),
    admissionTime: patient?.admissionTime || patient?.inTime || '',
    duration,
    vitalSigns,
    io24h: `入量：${totalInput}ml，出量：${totalOutput}ml`,
  };
}
