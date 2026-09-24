import { parseDatabaseUtcTime } from './form-date.util';

/**
 * 诊断历史解析工具。
 *
 * 规则（2026-09-24 改造）：
 * 1. 旧逻辑门槛：status === 'discharged' 且出科时间 < 2026-09-24 13:00+08:00 → 保持各表单原输出（legacyText）不动。
 * 2. 新逻辑：按 patient.diagnosisHistoryList[].time 时间区间取诊断，再取第一诊断。
 *    - 匹配：取 time ≤ queryTime 的最后一条；都晚于则取第一条；仅 1 条时不判时间。
 *    - 第一诊断：按 ; ； , ， | ｜ 拆分取第一段。
 *    - 历史为空 → 回退 clinicalDiagnosis → diagnosis → admissionDiagnosis，用新拆分。
 * 3. queryTime 约定：
 *    - 护理记录单：所选护理日次日 07:00+08 − 1ms（整日共用一个诊断）。
 *    - 其它表单：该页第一条数据的精确时间戳（每页独立）。
 */

/** 旧/新逻辑分界点：2026-09-24 13:00 北京时间 */
export const DIAGNOSIS_LOGIC_CUTOFF_MS = Date.parse('2026-09-24T13:00:00+08:00');

const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

export interface DiagnosisHistoryEntry {
  time?: any;
  editor?: any;
  editorId?: any;
  diagnosis?: any;
  diagnosisCodeList?: any;
}

/**
 * 是否启用新诊断逻辑。
 * false → 旧逻辑（已出科且出科时间早于截止点，输出保持逐字不变）。
 * 门槛按用户确认：status === 'discharged'（trim/小写）且出科时间可解析且 < 截止点。
 */
export function useNewDiagnosisLogic(patient: any): boolean {
  if (!patient) return true;
  const status = String(patient.status ?? '').trim().toLowerCase();
  const raw = patient.icuDischargeTime ?? patient.dischargeTime;
  const ts = toTimeMs(raw);
  const legacy = status === 'discharged' && Number.isFinite(ts) && ts < DIAGNOSIS_LOGIC_CUTOFF_MS;
  return !legacy;
}

/** 取第一诊断段。mode='new' 拆 ;；,,|｜ ；mode='legacy' 仅 ;；,,（与旧 formatDiagnosis 一致） */
export function firstDiagnosisSegment(raw: string | null | undefined, mode: 'new' | 'legacy'): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const seps = mode === 'new' ? [';', '；', ',', '，', '|', '｜'] : [';', '；', ',', '，'];
  let idx = -1;
  for (const sep of seps) {
    const cur = value.indexOf(sep);
    if (cur >= 0 && (idx < 0 || cur < idx)) idx = cur;
  }
  return idx >= 0 ? value.substring(0, idx).trim() : value;
}

/** 历史匹配：升序；len===1 直通；最后一条 time≤queryTime；都晚于则第一条 */
export function matchDiagnosisHistory(
  history: DiagnosisHistoryEntry[] | null | undefined,
  queryTimeMs: number,
): DiagnosisHistoryEntry | null {
  const list = normalizeHistory(history);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const q = Number.isFinite(queryTimeMs) ? queryTimeMs : Date.now();
  let matched: DiagnosisHistoryEntry | null = null;
  for (const entry of list) {
    const t = toTimeMs(entry.time);
    if (Number.isFinite(t) && t <= q) matched = entry;
  }
  return matched ?? list[0];
}

/**
 * 核心解析。
 * legacyText = 该表单当前对本患者展示的原样输出（旧逻辑患者逐字透传，含 Braden 完整串等特例）。
 */
export function resolveDiagnosisDisplay(
  patient: any,
  queryTimeMs: number | null | undefined,
  legacyText: string,
): string {
  if (!patient || !useNewDiagnosisLogic(patient)) return legacyText ?? '';
  const hist = normalizeHistory(patient.diagnosisHistoryList);
  if (hist.length) {
    const q = Number.isFinite(queryTimeMs as number) ? (queryTimeMs as number) : Date.now();
    const entry = matchDiagnosisHistory(hist, q);
    return firstDiagnosisSegment(entry?.diagnosis, 'new');
  }
  const raw = patient.clinicalDiagnosis ?? patient.diagnosis ?? patient.admissionDiagnosis ?? '';
  return firstDiagnosisSegment(String(raw), 'new');
}

/**
 * 提取记录时间戳（毫秒），失败返回 NaN。
 * 支持：number 毫秒（timeInstants）、TimePoint{instant}、Date、各字段名候选。
 */
export function extractRecordTimeMs(record: any, timeFields: string[]): number {
  if (record === null || record === undefined) return NaN;
  if (typeof record === 'number') return Number.isFinite(record) ? record : NaN;
  if (typeof record.instant === 'number' && Number.isFinite(record.instant)) return record.instant;
  const direct = toTimeMs(record);
  if (Number.isFinite(direct)) return direct;
  for (const field of timeFields) {
    const ts = toTimeMs(record[field]);
    if (Number.isFinite(ts)) return ts;
  }
  return NaN;
}

/** 按页解析：queryTime = 该页第一条记录的时间戳 */
export function resolvePageDiagnosis(
  patient: any,
  firstRecord: any,
  timeFields: string[],
  legacyText: string,
): string {
  return resolveDiagnosisDisplay(patient, extractRecordTimeMs(firstRecord, timeFields), legacyText);
}

/**
 * 护理记录单：queryTime = 所选护理日次日 07:00（+08:00）− 1ms。
 * 护理日为 [07:00, 次日07:00)，与 hljld 现有时间语义一致。
 */
export function resolveNursingDayDiagnosis(
  patient: any,
  selectedDate: Date | string | number | null | undefined,
  legacyText: string,
): string {
  const queryTimeMs = nursingDayEndMs(selectedDate) - 1;
  return resolveDiagnosisDisplay(patient, queryTimeMs, legacyText);
}

/** 护理日结束时刻（次日 07:00+08:00）的毫秒值；selectedDate 无效时返回 NaN */
export function nursingDayEndMs(selectedDate: Date | string | number | null | undefined): number {
  const base = toTimeMs(selectedDate);
  if (!Number.isFinite(base)) return NaN;
  const d = new Date(base);
  // 取上海日历日，再取次日 07:00+08:00
  const parts = shanghaiDateParts(d);
  if (!parts) return NaN;
  const nextDayUtc = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 7, 0, 0, 0) - SHANGHAI_OFFSET_MS;
  return nextDayUtc;
}

/** 仅日期字段（如 sggrfkcs 的 recordDate）→ 当日 23:59:59.999+08:00 */
export function endOfShanghaiDayMs(dayValue: Date | string | number | null | undefined): number {
  const base = toTimeMs(dayValue);
  if (!Number.isFinite(base)) return NaN;
  const parts = shanghaiDateParts(new Date(base));
  if (!parts) return NaN;
  return Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999) - SHANGHAI_OFFSET_MS;
}

/** Braden 旧路径专用：数组/对象完整串归一（新逻辑仅作为 legacyText 透传） */
export function legacyBradenDiagnosis(v: any): string {
  if (!v) return '';
  if (Array.isArray(v)) {
    return v
      .map(x => (typeof x === 'string' ? x : x?.name || x?.diagnosisName || x?.text || ''))
      .filter(Boolean)
      .join('、');
  }
  if (typeof v === 'object') return v.name || v.diagnosisName || v.text || '';
  return String(v);
}

function normalizeHistory(history: any): DiagnosisHistoryEntry[] {
  if (!Array.isArray(history)) return [];
  const list: DiagnosisHistoryEntry[] = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const t = toTimeMs((item as any).time);
    if (!Number.isFinite(t)) continue;
    list.push({ ...(item as DiagnosisHistoryEntry), time: t });
  }
  list.sort((a, b) => Number(a.time) - Number(b.time));
  return list;
}

function toTimeMs(value: any): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? NaN : value.getTime();
  if (typeof value === 'string') {
    // datetime-local（YYYY-MM-DDTHH:mm，无秒/无时区）= 上海墙上时间，不能按 UTC 解析
    const local = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (local) {
      return Date.UTC(+local[1], +local[2] - 1, +local[3], +local[4], +local[5], 0, 0) - SHANGHAI_OFFSET_MS;
    }
  }
  const d = parseDatabaseUtcTime(value);
  return d ? d.getTime() : NaN;
}

function shanghaiDateParts(d: Date): { year: number; month: number; day: number } | null {
  const text = d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
  // 格式示例：9/24/2026, 7:00:00 AM
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return { month: Number(m[1]), day: Number(m[2]), year: Number(m[3]) };
}
