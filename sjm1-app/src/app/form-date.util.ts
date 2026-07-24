const TZ = 'Asia/Shanghai';
const CST_OFFSET_MS = 8 * 3600 * 1000;

/**
 * 解析数据库/API时间。
 * 无时区字符串按UTC解释（数据库存UTC）。
 * 失败返回 null（绝不返回 0）。
 */
export function parseDatabaseUtcTime(value?: string | number | null): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = value.trim();
  if (!raw) return null;

  // Unix毫秒时间戳
  if (/^\d{13,}$/.test(raw)) {
    const d = new Date(Number(raw));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // 纯日期 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw + 'T00:00:00Z');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Legacy Java Date.toString(): "Fri Jul 24 09:00:00 CST 2026"
  // CST = China Standard Time (UTC+8)
  const legacy = parseLegacyCstString(raw);
  if (legacy) return legacy;

  // ISO格式：带Z/偏移量，或无时区
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const normalized = raw.replace(' ', 'T');
    const hasTZ = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const src = hasTZ ? normalized : normalized + 'Z';
    const d = new Date(src);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // 其他格式：尝试原生解析
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 解析 "Fri Jul 24 09:00:00 CST 2026" 格式。
 * CST = China Standard Time (UTC+8)，手工解析避免浏览器歧义。
 */
function parseLegacyCstString(raw: string): Date | null {
  const m = raw.match(
    /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+[A-Za-z]{2,5}\s+(\d{4})$/
  );
  if (!m) return null;
  const [, mon, day, hh, mm, ss, year] = m;
  const months: Record<string, number> = {
    Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11
  };
  const mi = months[mon];
  if (mi === undefined) return null;
  // 按 CST (UTC+8) 解析：减去8小时得到UTC
  const localMs = Date.UTC(Number(year), mi, Number(day), Number(hh), Number(mm), Number(ss));
  const utcMs = localMs - CST_OFFSET_MS;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getShanghaiParts(value?: string | number | null): Record<string,string> | null {
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

/** 返回绝对毫秒，解析失败返回 NaN */
export function databaseTimeValue(value?: string | number | null): number {
  const d = parseDatabaseUtcTime(value);
  return d ? d.getTime() : NaN;
}

export function formatShanghaiMonthDay(value?: string | number | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.month}-${p.day}` : '';
}
export function formatShanghaiHourMinute(value?: string | number | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.hour}:${p.minute}` : '';
}
export function formatShanghaiDate(value?: string | number | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}
export function formatShanghaiDateTime(value?: string | number | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}` : '';
}
export function formatShanghaiTime(value?: string | number | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.hour}:${p.minute}:${p.second}` : '';
}
export function shanghaiHourKey(value?: string | number | null): string {
  const p = getShanghaiParts(value);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}` : '';
}
