const TZ = 'Asia/Shanghai';

function norm(v: string): string { return v.trim().replace(' ', 'T'); }

/** bedside.time: 数据库UTC时间 → 任何格式均按UTC解析，再转东八区显示 */
export function parseBedsideTime(value?: string | null): Date | null {
  if (!value) return null;
  const n = norm(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) { const d = new Date(n + 'T00:00:00+08:00'); return Number.isNaN(d.getTime()) ? null : d; }
  // has timezone? parse as-is. Otherwise treat as UTC
  const hasTZ = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(n);
  const src = hasTZ ? n : n + 'Z';
  const d = new Date(src);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parts(value?: string | null): Record<string,string> | null {
  const d = parseBedsideTime(value);
  if (!d) return null;
  const fmt = new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
  const r: Record<string,string> = {};
  fmt.formatToParts(d).forEach(p => { if (p.type !== 'literal') r[p.type] = p.value; });
  return r;
}

export function bedsideTimeValue(value?: string | null): number { return parseBedsideTime(value)?.getTime() ?? 0; }
export function formatBedsideMonthDay(value?: string | null): string { const p = parts(value); return p ? `${p.month}-${p.day}` : ''; }
export function formatBedsideHourMinute(value?: string | null): string { const p = parts(value); return p ? `${p.hour}:${p.minute}` : ''; }
export function formatBedsideDate(value?: string | null): string { const p = parts(value); return p ? `${p.year}-${p.month}-${p.day}` : ''; }

/** 原有工具（非bedside时间继续可用） */
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
