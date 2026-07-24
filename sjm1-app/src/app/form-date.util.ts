const TZ = 'Asia/Shanghai';
type DatabaseTimeSource = 'bedside' | 'score';

function norm(v: string): string { return v.trim().replace(' ', 'T'); }
function hasTZ(v: string): boolean { return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(v); }
function isDateOnly(v: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isNumeric(v: string): boolean { return /^\d{13,}$/.test(v); }

/**
 * 解析数据库时间为 Date。
 * bedside: 无时区按 UTC 解释（数据库存 UTC）
 * score:   无时区按东八区解释（数据库存本地时间）
 */
export function parseDatabaseTime(value?: string | null, source: DatabaseTimeSource = 'bedside'): Date | null {
  if (!value) return null;
  const n = norm(value);
  if (isDateOnly(n)) { const d = new Date(n + 'T00:00:00' + (source === 'score' ? '+08:00' : 'Z')); return Number.isNaN(d.getTime()) ? null : d; }
  if (isNumeric(n)) { const d = new Date(Number(n)); return Number.isNaN(d.getTime()) ? null : d; }
  if (hasTZ(n)) { const d = new Date(n); return Number.isNaN(d.getTime()) ? null : d; }
  // 无时区
  const src = source === 'score' ? `${n}+08:00` : `${n}Z`;
  const d = new Date(src);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getParts(value?: string | null, source: DatabaseTimeSource = 'bedside'): Record<string,string> | null {
  const d = parseDatabaseTime(value, source);
  if (!d) return null;
  const fmt = new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
  const r: Record<string,string> = {};
  fmt.formatToParts(d).forEach(p => { if (p.type !== 'literal') r[p.type] = p.value; });
  return r;
}

export function databaseTimeValue(value?: string | null, source: DatabaseTimeSource = 'bedside'): number { return parseDatabaseTime(value, source)?.getTime() ?? 0; }

// bedside shortcuts
export function parseBedsideTime(value?: string | null): Date | null { return parseDatabaseTime(value, 'bedside'); }
export function bedsideTimeValue(value?: string | null): number { return databaseTimeValue(value, 'bedside'); }
export function formatBedsideMonthDay(value?: string | null): string { const p = getParts(value, 'bedside'); return p ? `${p.month}-${p.day}` : ''; }
export function formatBedsideHourMinute(value?: string | null): string { const p = getParts(value, 'bedside'); return p ? `${p.hour}:${p.minute}` : ''; }
export function formatBedsideDate(value?: string | null): string { const p = getParts(value, 'bedside'); return p ? `${p.year}-${p.month}-${p.day}` : ''; }

// score shortcuts
export function parseScoreTime(value?: string | null): Date | null { return parseDatabaseTime(value, 'score'); }
export function scoreTimeValue(value?: string | null): number { return databaseTimeValue(value, 'score'); }
export function formatScoreDate(value?: string | null): string { const p = getParts(value, 'score'); return p ? `${p.year}-${p.month}-${p.day}` : ''; }
export function formatScoreMonthDay(value?: string | null): string { const p = getParts(value, 'score'); return p ? `${p.month}-${p.day}` : ''; }
export function formatScoreHourMinute(value?: string | null): string { const p = getParts(value, 'score'); return p ? `${p.hour}:${p.minute}` : ''; }

/**
 * 东八区小时键，用于签名按小时匹配。
 * 08:30 → "2026-07-24 08"
 */
export function shanghaiHourKey(value?: string | null, source: DatabaseTimeSource = 'bedside'): string {
  const p = getParts(value, source);
  if (!p) return '';
  return `${p.year}-${p.month}-${p.day} ${p.hour}`;
}

/** 通用格式化（非 bedside/score 专用，按浏览器时区） */
export function fmtDate(v?: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fmtTime(v?: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
