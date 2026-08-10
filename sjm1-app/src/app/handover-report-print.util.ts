/**
 * 打印工具：患者交班表 DOM 度量与分页。
 *
 * A4 横向：纸张 297mm × 210mm，7mm 四边边距 → 有效 283mm × 196mm。
 */
import { HandoverPatientRow, MetricRow, ShiftKey } from './handover-report.models';

// ==================== 常量 ====================

/** A4 横向有效打印宽度 283mm → px（@page margin: 7mm） */
export const PAGE_WIDTH_MM = 283;
/** A4 横向有效打印高度 196mm → px（@page margin: 7mm） */
export const PAGE_HEIGHT_MM = 196;

/** 报告标题 + 元信息行 + 统计表合计预估高度 mm */
export const REPORT_HEADER_HEIGHT_MM = 64;
/** 报告标题 + 统计表（无签名）预估高度 mm（用于患者表首页） */
export const PATIENT_TABLE_HEADER_HEIGHT_MM = 64;
/** 签名行预估高度 mm */
export const SIGNATURE_HEIGHT_MM = 12;
/** 患者交班表与安全报告之间的间隔 mm */
export const SECTION_GAP_MM = 8;

/** 列宽 CSS 自定义属性默认值（%） */
export const COLUMN_WIDTH_DEFAULTS = {
  bed: 6,
  name: 7,
  status: 6,
  mrn: 10,
  diagnosis: 17,
  shift: 18,  // 三个班次列各占 18% = 54%
} as const;

// ==================== 接口 ====================

export interface HandoverPrintPage {
  pageIndex: number;
  rows: HandoverPatientRow[];
  showReportHeader: boolean;
  showSignature: boolean;
}

/**
 * DOM 度量结果（单位 mm）。
 */
export interface PatientTableMeasurement {
  /** 每行实际高度 mm */
  rowHeights: number[];
  /** 表头高度 mm */
  headerHeight: number;
  /** 签名行高度 mm */
  signatureHeight: number;
  /** 可用页面高度 mm（排除报告头部和签名） */
  usablePageHeight: number;
  /** 每页能容纳的最大内容高度 mm（不含签名，签名只在最后一页） */
  firstPageUsableHeight: number;
  /** 续页可用高度 mm */
  continuationPageUsableHeight: number;
}

// ==================== 度量函数 ====================

/**
 * px → mm 换算。
 * window.print() 会使用 CSS @page 规则中的 mm 单位，
 * 但 getBoundingClientRect() 返回 px，需要换算。
 */
function pxToMm(px: number): number {
  // 96dpi 标准：1mm ≈ 3.7795px
  return px / 3.7795;
}

/**
 * mm → px 换算。
 */
export function mmToPx(mm: number): number {
  return mm * 3.7795;
}

/**
 * 创建打印度量容器。
 * 该容器在屏幕外渲染，用于测量每行患者交班表的实际高度。
 */
export function createMeasurementContainer(doc: Document): HTMLDivElement {
  const container = doc.createElement('div');
  container.className = 'handover-measurement-container';
  // 内联样式确保不可见且不影响布局
  container.style.cssText =
    'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;' +
    'width:283mm;font-family:"Microsoft YaHei","Noto Sans SC","PingFang SC",Arial,sans-serif;' +
    'font-size:8pt;line-height:1.4;';
  doc.body.appendChild(container);
  return container;
}

/**
 * 销毁度量容器。
 */
export function destroyMeasurementContainer(container: HTMLElement | null): void {
  container?.parentElement?.removeChild(container);
}

/**
 * 度量患者交班表每行的高度。
 *
 * 工作原理：
 * 1. 在度量容器中创建一个与打印样式完全一致的表格克隆
 * 2. 为每个患者行单独渲染并测量高度
 * 3. 收集表头、签名行高度
 */
export function measurePatientTableRows(
  rows: HandoverPatientRow[],
  container: HTMLDivElement,
  doc: Document,
): PatientTableMeasurement {
  // 清空度量容器
  container.innerHTML = '';

  // 创建度量用表格
  const table = doc.createElement('table');
  table.className = 'handover-measurement-table patient-table';
  table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;';

  // CSS 自定义属性（与打印样式一致）
  table.style.setProperty('--bed-width', `${COLUMN_WIDTH_DEFAULTS.bed}%`);
  table.style.setProperty('--name-width', `${COLUMN_WIDTH_DEFAULTS.name}%`);
  table.style.setProperty('--status-width', `${COLUMN_WIDTH_DEFAULTS.status}%`);
  table.style.setProperty('--mrn-width', `${COLUMN_WIDTH_DEFAULTS.mrn}%`);
  table.style.setProperty('--diagnosis-width', `${COLUMN_WIDTH_DEFAULTS.diagnosis}%`);
  table.style.setProperty('--shift-width', `${COLUMN_WIDTH_DEFAULTS.shift}%`);

  // 表头
  const thead = doc.createElement('thead');
  thead.innerHTML = `<tr>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">床号</th>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">姓名</th>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">状态</th>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">住院号</th>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">诊断</th>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">白班</th>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">中班</th>
    <th style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;background:#edf3f7;">夜班</th>
  </tr>`;
  table.appendChild(thead);
  container.appendChild(table);

  const headerHeight = pxToMm(thead.getBoundingClientRect().height);

  // 签名行
  const sigTable = doc.createElement('table');
  sigTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:8pt;';
  const sigRow = doc.createElement('tr');
  sigRow.innerHTML = `
    <td style="border:1px solid #2b2b2b;padding:1mm 2mm;font-size:8pt;" colspan="5"></td>
    <td style="border:1px solid #2b2b2b;padding:1mm 2mm;font-size:8pt;">护士签名：</td>
    <td style="border:1px solid #2b2b2b;padding:1mm 2mm;font-size:8pt;">护士签名：</td>
    <td style="border:1px solid #2b2b2b;padding:1mm 2mm;font-size:8pt;">护士签名：</td>`;
  sigTable.appendChild(sigRow);
  const sigWrap = doc.createElement('div');
  sigWrap.appendChild(sigTable);
  container.appendChild(sigWrap);
  const signatureHeight = pxToMm(sigWrap.getBoundingClientRect().height);
  sigWrap.remove();

  // 度量每行高度
  const rowHeights: number[] = [];

  for (const row of rows) {
    const tr = doc.createElement('tr');
    tr.style.cssText = 'break-inside:avoid;page-break-inside:avoid;';
    const statusText = ['死亡', '转入', '入院', '手术'].includes(row.status) ? `"${row.status}"` : row.status;

    tr.innerHTML = `
      <td style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;vertical-align:top;">${escapeHtml(row.bedNo)}</td>
      <td style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;vertical-align:top;">${escapeHtml(row.name)}</td>
      <td class="patient-status-cell" style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;vertical-align:top;color:#e60012;font-weight:600;">${escapeHtml(statusText)}</td>
      <td style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;vertical-align:top;">${escapeHtml(row.mrn)}</td>
      <td style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word;">${escapeHtml(row.diagnosis)}</td>
      ${(['day', 'evening', 'night'] as ShiftKey[]).map(shift => {
        const text = row.shiftTexts[shift] || '';
        return `<td style="border:1px solid #2b2b2b;padding:1mm 2mm;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(text)}</td>`;
      }).join('')}
    `;

    // 使用 tbody 添加单行以测量
    const tempTbody = doc.createElement('tbody');
    tempTbody.appendChild(tr);
    table.appendChild(tempTbody);

    const rowHeight = pxToMm(tr.getBoundingClientRect().height);
    rowHeights.push(rowHeight);

    // 移除临时 tbody
    table.removeChild(tempTbody);
  }

  container.innerHTML = '';

  // A4 横向有效高度 196mm
  const usablePageHeight = PAGE_HEIGHT_MM;
  // 首页：扣除报告头部（统计表 + 间距）
  const firstPageUsableHeight = usablePageHeight - PATIENT_TABLE_HEADER_HEIGHT_MM;
  // 续页：扣除签名行预留
  const continuationPageUsableHeight = usablePageHeight - SIGNATURE_HEIGHT_MM;

  return {
    rowHeights,
    headerHeight,
    signatureHeight,
    usablePageHeight,
    firstPageUsableHeight,
    continuationPageUsableHeight,
  };
}

// ==================== 分页函数 ====================

/**
 * 根据度量结果将患者行分配到多个打印页面。
 *
 * 算法：
 * 1. 首页先放报告标题 + 统计表，然后放患者行直到空间不足
 * 2. 续页只放患者表头 + 患者行
 * 3. 最后一页显示签名行
 * 4. 单行超高时仍然单独占一页（避免截断）
 * 5. 空患者列表时返回单页（显示空表）
 */
export function paginatePatientTable(
  rows: HandoverPatientRow[],
  measurement: PatientTableMeasurement,
): HandoverPrintPage[] {
  const pages: HandoverPrintPage[] = [];

  if (rows.length === 0) {
    pages.push({
      pageIndex: 0,
      rows: [],
      showReportHeader: true,
      showSignature: true,
    });
    return pages;
  }

  let currentPageRows: HandoverPatientRow[] = [];
  let usedHeight = 0;  // 当前页已用高度 mm
  let pageIdx = 0;

  // 首页：报告标题 + 统计表高度 + 患者表头高度
  usedHeight = PATIENT_TABLE_HEADER_HEIGHT_MM + measurement.headerHeight;
  let isFirstPage = true;

  for (let i = 0; i < rows.length; i++) {
    const rowHeight = measurement.rowHeights[i];
    const isLastRow = i === rows.length - 1;

    // 签名行预估（只在最后一页添加）
    const signatureReserve = isLastRow ? measurement.signatureHeight : 0;

    const pageCapacity = isFirstPage
      ? measurement.firstPageUsableHeight
      : measurement.continuationPageUsableHeight;

    // 检查当前行是否能放入当前页
    const availableHeight = pageCapacity - usedHeight - signatureReserve;
    const rowFits = rowHeight <= availableHeight + 0.5; // 0.5mm 容差

    if (!rowFits && currentPageRows.length > 0) {
      // 当前行放不下，当前页结束（不含签名，因为不是最后一页）
      pages.push({
        pageIndex: pageIdx++,
        rows: currentPageRows,
        showReportHeader: isFirstPage,
        showSignature: false,
      });

      // 新页
      currentPageRows = [];
      usedHeight = measurement.headerHeight; // 续页表头
      isFirstPage = false;
    }

    currentPageRows.push(rows[i]);
    usedHeight += rowHeight;

    // 最后一行处理完后，输出最后一页
    if (isLastRow) {
      pages.push({
        pageIndex: pageIdx++,
        rows: currentPageRows,
        showReportHeader: isFirstPage,
        showSignature: true, // 最后一页显示签名
      });
    }
  }

  return pages;
}

// ==================== DOM 生成 ====================

/**
 * 根据分页结果生成显式打印页面的 HTML。
 * 生成的 HTML 会被注入到打印容器中，替换原始表格。
 */
export function generatePrintPagesHtml(
  pages: HandoverPrintPage[],
  vm: { statistics: Record<ShiftKey, { total: number; discharged?: number; transferredOut?: number; death?: number; transferredIn?: number; admission?: number; operation?: number; critical: number; specialCare?: number }>; metrics: MetricRow[] },
  snapshot: { departmentName?: string; departmentId?: string; draft: { headNurseSignature?: string; shiftSignatures: Partial<Record<ShiftKey, string>>; remarks?: Partial<Record<ShiftKey, string>>; manualMetrics?: Record<string, Partial<Record<ShiftKey, string>>> } },
  dateInput: string,
  signatureNameFn: (shift: ShiftKey) => string,
  metricShifts: ShiftKey[],
  metricShiftLabelFn: (shift: ShiftKey) => string,
): string {
  const htmlParts: string[] = [];

  for (const page of pages) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'handover-print-page';
    pageDiv.setAttribute('data-page', String(page.pageIndex + 1));

    let html = '';

    // 报告头部（首页）
    if (page.showReportHeader) {
      html += generateReportHeaderHtml(vm, snapshot, dateInput);
    }

    // 患者交班表
    html += '<table class="patient-table handover-print-patient-table">';

    // colgroup：严格等宽的三个班次列
    html += `<colgroup>
      <col style="width:var(--bed-width,6%)" />
      <col style="width:var(--name-width,7%)" />
      <col style="width:var(--status-width,6%)" />
      <col style="width:var(--mrn-width,10%)" />
      <col style="width:var(--diagnosis-width,17%)" />
      <col class="patient-shift-col" style="width:var(--shift-width,18%)" />
      <col class="patient-shift-col" style="width:var(--shift-width,18%)" />
      <col class="patient-shift-col" style="width:var(--shift-width,18%)" />
    </colgroup>`;

    // 表头（每页重复）
    html += `<thead><tr>
      <th>床号</th><th>姓名</th><th>状态</th><th>住院号</th><th>诊断</th>
      <th>白班</th><th>中班</th><th>夜班</th>
    </tr></thead>`;

    // 数据行
    html += '<tbody>';
    for (const row of page.rows) {
      const statusText = ['死亡', '转入', '入院', '手术'].includes(row.status) ? `"${row.status}"` : row.status;
      const criticalClass = row.status === '病危' ? ' critical-row' : '';
      html += `<tr class="${criticalClass}">`;
      html += `<td>${escapeHtml(row.bedNo)}</td>`;
      html += `<td>${escapeHtml(row.name)}</td>`;
      html += `<td class="patient-status-cell">${escapeHtml(statusText)}</td>`;
      html += `<td>${escapeHtml(row.mrn)}</td>`;
      html += `<td style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(row.diagnosis)}</td>`;
      for (const shift of ['day', 'evening', 'night'] as ShiftKey[]) {
        const text = row.shiftTexts[shift] || '';
        html += `<td style="white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(text)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';

    // 签名行（最后一页）
    if (page.showSignature) {
      html += '<tfoot><tr>';
      html += '<td colspan="5"></td>';
      for (const shift of ['day', 'evening', 'night'] as ShiftKey[]) {
        html += `<td>护士签名：${escapeHtml(signatureNameFn(shift))}</td>`;
      }
      html += '</tr></tfoot>';
    }

    html += '</table>';
    html += '</div>';

    htmlParts.push(html);
  }

  // 安全报告分页（始终独立一页，从数据生成，避免 DOM 重复）
  htmlParts.push(generateSafetyReportHtml(vm.metrics, snapshot, metricShifts, metricShiftLabelFn, signatureNameFn));

  return htmlParts.join('');
}

/**
 * 生成报告头部 HTML（标题 + 元信息 + 统计表）。
 */
function generateReportHeaderHtml(
  vm: { statistics: Record<ShiftKey, { total: number; discharged?: number; transferredOut?: number; death?: number; transferredIn?: number; admission?: number; operation?: number; critical: number; specialCare?: number }> },
  snapshot: { departmentName?: string; departmentId?: string; draft: { headNurseSignature?: string; remarks?: Partial<Record<ShiftKey, string>> } },
  dateInput: string,
): string {
  const dept = escapeHtml(snapshot.departmentName || snapshot.departmentId || '');
  const headNurse = escapeHtml(snapshot.draft.headNurseSignature || '');

  let html = '<table class="summary-table handover-print-summary-table">';
  html += '<colgroup><col class="shift-col" /><col class="total-col" /><col span="6" class="count-col" /><col class="critical-col" /><col class="special-care-col" /><col class="remark-col" /></colgroup>';
  html += '<thead>';
  html += '<tr class="report-title-row"><th colspan="11">护士交接班病情报告本</th></tr>';
  html += `<tr class="report-meta-row"><th>科室</th><td colspan="3">${dept}</td><th>日期</th><td colspan="3">${escapeHtml(dateInput)}</td><th colspan="2">护士长签名</th><td>${headNurse}</td></tr>`;
  html += '<tr><th>班别</th><th>病人总数</th><th>出院</th><th>转出</th><th>死亡</th><th>转入</th><th>入院</th><th>手术</th><th>病危</th><th class="special-care-header">特级护理</th><th>备注</th></tr>';
  html += '</thead><tbody>';

  for (const shift of ['day', 'evening', 'night'] as ShiftKey[]) {
    const s = vm.statistics[shift];
    const shiftLabel = shift === 'day' ? '白班' : shift === 'evening' ? '中班' : '夜班';
    const remark = snapshot.draft.remarks?.[shift] || '';
    html += `<tr><th>${shiftLabel}</th><td>${s.total}</td><td>${s.discharged ?? 0}</td><td>${s.transferredOut ?? 0}</td><td>${s.death ?? 0}</td><td>${s.transferredIn ?? 0}</td><td>${s.admission ?? 0}</td><td>${s.operation ?? 0}</td><td>${s.critical}</td><td>${s.specialCare ?? 0}</td><td><div class="print-text">${escapeHtml(remark)}</div></td></tr>`;
  }

  html += '</tbody></table>';
  return html;
}

/**
 * 从数据生成安全报告打印 HTML（无 rowspan，支持分页）。
 */
function generateSafetyReportHtml(
  metrics: MetricRow[],
  snapshot: { draft: { shiftSignatures: Partial<Record<ShiftKey, string>>; manualMetrics?: Record<string, Partial<Record<ShiftKey, string>>> } },
  metricShifts: ShiftKey[],
  metricShiftLabelFn: (shift: ShiftKey) => string,
  signatureNameFn: (shift: ShiftKey) => string,
): string {
  let html = '<div class="safety-report-section">';
  html += '<h2>重症医学科病区交班报告</h2>';
  html += '<table class="safety-report-table print-safety-table">';

  // colgroup
  html += '<colgroup><col class="category-column" /><col class="metric-name-column" />';
  for (let i = 0; i < metricShifts.length; i++) {
    html += '<col />';
  }
  html += '</colgroup>';

  // thead
  html += '<thead><tr>';
  html += '<th class="category-column">分类</th>';
  html += '<th class="metric-name-column">项目</th>';
  for (const shift of metricShifts) {
    html += `<th>${escapeHtml(metricShiftLabelFn(shift))}</th>`;
  }
  html += '</tr></thead>';

  // tbody
  html += '<tbody>';
  for (const metric of metrics) {
    html += '<tr>';
    if (!metric.category) {
      // 独立指标：合并前两列
      html += `<th colspan="2" class="standalone-metric-cell">${escapeHtml(metric.label)}</th>`;
    } else {
      // 分类指标：显示分类和项目名（无 rowspan，每行独立）
      const categoryText = metric.showCategory ? escapeHtml(metric.category) : '';
      html += `<td class="print-category-cell">${categoryText}</td>`;
      html += `<th class="metric-label-cell">${escapeHtml(metric.label)}</th>`;
    }
    for (const shift of metricShifts) {
      const value = metric.values[shift] || '—';
      const emphasisClass = metric.emphasize && value && value !== '—' ? ' metric-emphasis' : '';
      html += `<td><span class="metric-auto-value${emphasisClass}">${escapeHtml(value)}</span></td>`;
    }
    html += '</tr>';
  }

  // 签名行
  html += '<tr class="signature-row">';
  html += '<th colspan="2" scope="row">护士签名</th>';
  for (const shift of metricShifts) {
    html += `<td>${escapeHtml(signatureNameFn(shift))}</td>`;
  }
  html += '</tr>';

  html += '</tbody></table>';
  html += '</div>';
  return html;
}

// ==================== 打印流程辅助 ====================

/**
 * 等待字体加载完成。
 */
export async function waitForFonts(doc: Document): Promise<void> {
  try {
    await doc.fonts.ready;
  } catch {
    // fonts API 不可用时静默跳过
  }
}

/**
 * 等待浏览器渲染稳定（两次 rAF 之间无变化）。
 */
export function waitForStableRender(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

// ==================== 工具 ====================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
