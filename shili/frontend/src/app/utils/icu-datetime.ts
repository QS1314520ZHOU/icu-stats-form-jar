/** 与后端 application.yml Jackson date-format 一致 */
export function formatBackendDateTime(d: Date | string | null | undefined): string {
  if (d == null || d === '') {
    return '';
  }
  const x = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(x.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

export function parseBackendDateTime(v: unknown): Date {
  if (v == null) {
    return new Date();
  }
  if (typeof v === 'number') {
    return new Date(v);
  }
  if (typeof v === 'string') {
    const d = new Date(v.replace(' ', 'T'));
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (v instanceof Date) {
    return v;
  }
  return new Date();
}
