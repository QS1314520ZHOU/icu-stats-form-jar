const TZ = 'Asia/Shanghai';

/**
 * 解析数据库/API时间，兼容：
 * - ISO带Z:    2026-07-24T01:00:00.000Z
 * - ISO带偏移: 2026-07-24T09:00:00+08:00
 * - ISO无时区: 2026-07-24T01:00:00.000 / 2026-07-24 01:00:00.000
 * - Date.toString: Fri Jul 24 09:00:00 CST 2026
 * - Unix毫秒时间戳: 1753405200000
 *
 * 无时区字符串按UTC解释（数据库存UTC）。
 * 解析失败返回 null（不返回 0）。
 */
export function parseDatabaseUtcTime(value?: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  // Unix毫秒时间戳
  if (/^\d{13,}$/.test(raw)) {
    const d = new Date(Number(raw));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // 纯日期 YYYY-MM-DD（不加时区，按当天处理）
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw + 'T00:00:00Z');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO格式：带Z或偏移量，或无时区
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const normalized = raw.replace(' ', 'T');
    const hasTZ = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const src = hasTZ ? normalized : normalized + 'Z';
    const d = new Date(src);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Date.toString格式: "Fri Jul 24 09:00:00 CST 2026"
  // 先尝试直接解析（浏览器会按本地时区），再转UTC修正
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getShanghaiParts(value?: string | null): Record<string,string> | null {
  const d = parseDatabaseUtcTime(value);
  if (!d) return null;
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  });
  const r: Record<string,string> = {};
  fmt.formatToParts(d).forEach(p => { if (p.type !== 'literal') r[p.type] = p.value; });
  return r;
}

/** 返回绝对毫秒，解析失败返回 NaN（不是 0） */
export function databaseTimeValue(value?: string | null): number {
  const d = parseDatabaseUtcTime(value);
  return d ? d.getTime() : NaN;
}

export function formatShanghaiMonthDay(value?: string | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.month}-${p.day}` : '';
}
export function formatShanghaiHourMinute(value?: string | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.hour}:${p.minute}` : '';
}
export function formatShanghaiDate(value?: string | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}
export function formatShanghaiDateTime(value?: string | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}` : '';
}
export function formatShanghaiTime(value?: string | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.hour}:${p.minute}:${p.second}` : '';
}
export function shanghaiHourKey(value?: string | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}` : '';
}
