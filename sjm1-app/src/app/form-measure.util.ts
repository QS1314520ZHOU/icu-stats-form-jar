/**
 * 共享自动分页工具：使用隐藏A4测量容器计算每页最佳数据容量
 *
 * 用法：
 *   const capacity = await measureRowCapacity(hostEl, {
 *     fixedSelector: '.sheet-head,.patient-info-row,thead,.iad-footnote',
 *     rowSelector: '.data-row',
 *     sheetPadding: { top: '4mm', bottom: '12mm', left: '10mm', right: '10mm' },
 *   });
 */

const PX_PER_MM = 96 / 25.4;

export interface MeasureOptions {
  /** CSS selector for fixed elements (title, patient info, headers, footnotes, page number) */
  fixedSelector: string;
  /** CSS selector for one data row */
  rowSelector: string;
  /** Sheet padding in the print CSS */
  sheetPadding?: { top?: string; bottom?: string; left?: string; right?: string };
  /** Safety margin in px to reserve below content */
  safetyMargin?: number;
}

/** 等待字体和布局完成 */
async function waitForLayout(): Promise<void> {
  if ((document as any).fonts?.ready) {
    await (document as any).fonts.ready;
  }
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 创建隐藏的A4测量容器 */
function createMeasureContainer(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'pagination-measure';
  div.style.cssText =
    'position:fixed;left:-100000px;top:0;' +
    'width:297mm;height:210mm;' +
    'visibility:hidden;pointer-events:none;' +
    'contain:layout style;';
  div.innerHTML = '<div class="sheet" style="' +
    'box-sizing:border-box;position:relative;' +
    'width:297mm;height:210mm;' +
    'margin:0;padding:4mm 10mm 12mm;' +
    'overflow:hidden;background:#fff;color:#000;' +
    '"></div>';
  document.body.appendChild(div);
  return div;
}

/** 获取A4页面内容可用高度(px) */
function getAvailableHeight(sheet: HTMLElement): number {
  return sheet.clientHeight;
}

/** 获取A4页面内容可用宽度(px) */
function getAvailableWidth(sheet: HTMLElement): number {
  return sheet.clientWidth;
}

/**
 * 测量行方向表单的每页最佳行数
 * 返回：每页最多容纳的行数（最少1行）
 */
export async function measureRowCapacity(
  fixedHtml: string,
  rowHtml: string,
  options?: { safetyMargin?: number }
): Promise<number> {
  const safety = options?.safetyMargin ?? 8;
  const container = createMeasureContainer();
  const sheet = container.querySelector('.sheet') as HTMLElement;

  try {
    await waitForLayout();
    // 插入固定内容并测量
    sheet.innerHTML = fixedHtml;
    await waitForLayout();
    const fixedHeight = sheet.scrollHeight;

    // 插入一行数据并测量行高
    sheet.innerHTML = fixedHtml + rowHtml;
    await waitForLayout();
    const totalWithOneRow = sheet.scrollHeight;
    const rowHeight = totalWithOneRow - fixedHeight;

    if (rowHeight <= 0) return 1;

    const available = getAvailableHeight(sheet) - fixedHeight - safety;
    const capacity = Math.max(1, Math.floor(available / rowHeight));
    return capacity;
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * 测量列方向表单的每页最佳列数
 * 返回：每页最多容纳的列数（最少1列）
 */
export async function measureColCapacity(
  fixedHtml: string,
  colHtml: string,
  options?: { safetyMargin?: number }
): Promise<number> {
  const safety = options?.safetyMargin ?? 10;
  const container = createMeasureContainer();
  const sheet = container.querySelector('.sheet') as HTMLElement;

  try {
    await waitForLayout();
    // 测量固定列宽
    sheet.innerHTML = fixedHtml;
    await waitForLayout();
    const fixedWidth = sheet.scrollWidth;

    // 测量单列宽
    sheet.innerHTML = fixedHtml + colHtml;
    await waitForLayout();
    const totalWithOneCol = sheet.scrollWidth;
    const colWidth = totalWithOneCol - fixedWidth;

    if (colWidth <= 0) return 1;

    const available = getAvailableWidth(sheet) - safety;
    const capacity = Math.max(1, Math.floor(available / colWidth));
    return capacity;
  } finally {
    document.body.removeChild(container);
  }
}
