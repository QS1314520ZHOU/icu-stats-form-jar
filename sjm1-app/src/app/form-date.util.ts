const TZ = 'Asia/Shanghai';

function norm(v: string): string { return v.trim().replace(' ', 'T'); }
function hasTZ(v: string): boolean { return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(v); }
function isDateOnly(v: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isNumeric(v: string): boolean { return /^\d{13,}$/.test(v); }

/**
 * 解析数据库时间为 Date。
 * 所有无时区的 datetime 字符串按 UTC 解释（数据库存 UTC）。
 * 纯日期(YYYY-MM-DD)直接按年月日处理，不拼接时区。
 */
export function parseDatabaseUtcTime(value?: string | null): Date | null {
  if (!value) return null;
  const n = norm(value);
  if (isDateOnly(n)) { const d = new Date(n + 'T00:00:00'); return Number.isNaN(d.getTime()) ? null : d; }
  if (isNumeric(n)) { const d = new Date(Number(n)); return Number.isNaN(d.getTime()) ? null : d; }
  const src = hasTZ(n) ? n : `${n}Z`;
  const d = new Date(src);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getShanghaiParts(value?: string | null): Record<string,string> | null {
  const d = parseDatabaseUtcTime(value);
  if (!d) return null;
  const fmt = new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
  const r: Record<string,string> = {};
  fmt.formatToParts(d).forEach(p => { if (p.type !== 'literal') r[p.type] = p.value; });
  return r;
}

export function databaseTimeValue(value?: string | null): number { return parseDatabaseUtcTime(value)?.getTime() ?? 0; }
export function formatShanghaiMonthDay(value?: string | null): string { const p = getShanghaiParts(value); return p ? `${p.month}-${p.day}` : ''; }
export function formatShanghaiHourMinute(value?: string | null): string { const p = getShanghaiParts(value); return p ? `${p.hour}:${p.minute}` : ''; }
export function formatShanghaiDate(value?: string | null): string { const p = getShanghaiParts(value); return p ? `${p.year}-${p.month}-${p.day}` : ''; }
export function formatShanghaiDateTime(value?: string | null): string { const p = getShanghaiParts(value); return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}` : ''; }
export function formatShanghaiTime(value?: string | null): string { const p = getShanghaiParts(value); return p ? `${p.hour}:${p.minute}:${p.second}` : ''; }

/**
 * 东八区小时键，用于签名按小时匹配。
 * 08:30 → "2026-07-24 08"
 */
export function shanghaiHourKey(value?: string | null): string {
  const p = getShanghaiParts(value);
  if (!p) return '';
  return `${p.year}-${p.month}-${p.day} ${p.hour}`;
}
