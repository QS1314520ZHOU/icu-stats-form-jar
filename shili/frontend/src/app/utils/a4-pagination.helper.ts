/**
 * A4 高度分页：与 .a4-landscape-container + .a4-page-measure 测量块配合使用。
 * DOM 中需存在隐藏的 .a4-page-measure（内嵌与正式页相同的表格结构）及 .medical-table。
 */

export function contentBottomY(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const m = el.getBoundingClientRect();
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
  return m.bottom - borderBottom - padBottom;
}

export function applyA4Pagination<T>(records: T[]): {
  pagedRecords: T[][];
  effectiveRowsPerPage: number;
} {
  const total = records.length;
  if (!total) {
    return { pagedRecords: [[]], effectiveRowsPerPage: 24 };
  }

  const measure = document.querySelector('.a4-page-measure') as HTMLElement | null;
  const table = measure?.querySelector('.medical-table .ant-table-content table') as HTMLTableElement | null;
  const tbody = table?.querySelector('tbody') as HTMLElement | null;
  const tr = table?.querySelector('tbody tr') as HTMLElement | null;

  let rowsPerPage = 24;
  if (measure && tbody && tr) {
    const contentBottom = contentBottomY(measure);
    const tbodyTop = tbody.getBoundingClientRect().top;
    const rowH = Math.max(1, tr.getBoundingClientRect().height);
    const available = Math.max(0, contentBottom - tbodyTop - 1);
    rowsPerPage = Math.max(1, Math.floor(available / rowH));
  }

  const pages: T[][] = [];
  for (let i = 0; i < total; i += rowsPerPage) {
    pages.push(records.slice(i, i + rowsPerPage));
  }
  return {
    pagedRecords: pages.length ? pages : [[]],
    effectiveRowsPerPage: rowsPerPage,
  };
}

/** 首屏留白修正单步；若 didRefine 为 true，可再 requestAnimationFrame 调用直至 false */
export function refineFirstPageGapOnce<T>(
  records: T[],
  pagedRecords: T[][],
  effectiveRowsPerPage: number,
  refineGapPass: number,
): {
  pagedRecords: T[][];
  effectiveRowsPerPage: number;
  refineGapPass: number;
  didRefine: boolean;
} {
  if (!records.length || refineGapPass >= 2) {
    return { pagedRecords, effectiveRowsPerPage, refineGapPass, didRefine: false };
  }
  const first = document.querySelector('.a4-landscape-container:not(.a4-page-measure)') as HTMLElement | null;
  if (!first) {
    return { pagedRecords, effectiveRowsPerPage, refineGapPass, didRefine: false };
  }
  const table = first.querySelector('.medical-table .ant-table-content table');
  const tbody = table?.querySelector('tbody');
  const tr = tbody?.querySelector('tr');
  if (!tbody || !tr) {
    return { pagedRecords, effectiveRowsPerPage, refineGapPass, didRefine: false };
  }

  const contentBottom = contentBottomY(first);
  const tbodyBottom = tbody.getBoundingClientRect().bottom;
  const rowH = Math.max(1, tr.getBoundingClientRect().height);
  const gap = contentBottom - tbodyBottom;

  if (gap < rowH * 0.45) {
    return { pagedRecords, effectiveRowsPerPage, refineGapPass, didRefine: false };
  }

  /* floor((gap-2)/rowH) 在「留白约一整行」时常为 0，首屏少一行，屏幕/打印第一页底部会多出一行高度的空白 */
  let extra = Math.max(0, Math.floor((gap - 2) / rowH));
  if (extra === 0 && gap >= rowH * 0.88) {
    extra = 1;
  }
  
  /* 针对 CRRT 等多列表格：如果加上这一行后总高度超过了可用高度，就不要加，否则会被 overflow:hidden 裁掉 */
  if (extra > 0) {
    const predictedGap = gap - extra * rowH;
    if (predictedGap < 0) {
      extra = Math.max(0, extra - 1);
    }
  }

  if (extra < 1) {
    return { pagedRecords, effectiveRowsPerPage, refineGapPass, didRefine: false };
  }

  const cur0 = pagedRecords[0]?.length ?? 0;
  const newRpp = Math.min(cur0 + extra, records.length);
  if (newRpp <= cur0) {
    return { pagedRecords, effectiveRowsPerPage, refineGapPass, didRefine: false };
  }

  const total = records.length;
  const pages: T[][] = [];
  for (let i = 0; i < total; i += newRpp) {
    pages.push(records.slice(i, i + newRpp));
  }
  return {
    pagedRecords: pages.length ? pages : [[]],
    effectiveRowsPerPage: newRpp,
    refineGapPass: refineGapPass + 1,
    didRefine: true,
  };
}

/**
 * 将每页行数按 factor 放大再切片（历史上用于「打印前塞更多行」）。
 * 浏览器打印依赖多个 `.a4-landscape-container` + page-break，若合并成单页会导致整表挤在一页、分页错乱，故表单打印勿再使用。
 */
export function applyPrintDensePagination<T>(records: T[], effectiveRowsPerPage: number, factor = 1.42): T[][] {
  const total = records.length;
  if (!total) {
    return [[]];
  }
  const base = Math.max(1, effectiveRowsPerPage);
  const rpp = Math.min(total, Math.max(1, Math.floor(base * factor)));
  const pages: T[][] = [];
  for (let i = 0; i < total; i += rpp) {
    pages.push(records.slice(i, i + rpp));
  }
  return pages.length ? pages : [[]];
}
