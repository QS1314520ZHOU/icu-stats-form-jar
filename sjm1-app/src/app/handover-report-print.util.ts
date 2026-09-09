/**
 * 手交班报告打印工具 - 独立版本
 *
 * 创建临时只读打印 DOM，支持 A4 横向自动分页。
 * 两份报告按顺序打印，第二份从新页开始。
 *
 * A4 横向：297mm × 210mm，四边 7mm → 有效区 283mm × 196mm。
 */
import {
  DepartmentDailySnapshot,
  HandoverPatientRow,
  HandoverReportViewModel,
  MetricRow,
  ShiftKey,
} from './handover-report.models';

// ==================== 常量 ====================

/** A4 横向宽度 mm */
const PAGE_WIDTH_MM = 297;

/** A4 横向高度 mm */
const PAGE_HEIGHT_MM = 210;

/** 四边边距 mm */
const MARGIN_MM = 7;

/** 有效打印宽度 mm */
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - 2 * MARGIN_MM;

/** 有效打印高度 mm */
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - 2 * MARGIN_MM;

/** 安全间距 mm */
const SAFETY_GAP_MM = 2;

/** 最小行高 mm */
const MIN_ROW_HEIGHT_MM = 4;

/** 打印根节点 ID */
const PRINT_ROOT_ID = 'handover-print-root';

/** 打印样式 ID */
const PRINT_STYLE_ID = 'handover-print-style';

// ==================== 常量 ====================

/** px → mm（96dpi：1mm ≈ 3.7795px） */
function pxToMm(px: number): number {
  return px / 3.7795;
}

/** mm → px */
function mmToPx(mm: number): number {
  return mm * 3.7795;
}

// ==================== 主入口 ====================

/**
 * 打印交班报告。
 * @param snapshot 当前数据快照
 * @param vm 视图模型
 * @param dateInput 日期输入值
 */
export async function printHandoverReport(
  snapshot: DepartmentDailySnapshot,
  vm: HandoverReportViewModel,
  dateInput: string,
  onBeforePrint?: () => void,
  onAfterPrint?: () => void,
): Promise<void> {
  // 1. 清理旧的打印 DOM
  cleanupPrintDom();

  // 2. 创建打印样式
  createPrintStyles();

  // 3. 创建打印根节点
  const root = createPrintRoot();

  // 4. 渲染两份报告
  renderReport1(root, snapshot, vm, dateInput);
  renderReport2(root, vm, snapshot);

  // 5. 挂载到 body
  document.body.appendChild(root);

  // 6. 等待渲染稳定
  await waitForRender();

  // 7. 生命周期管理：beforeprint / afterprint
  let resolved = false;
  let handleBeforePrint: (() => void) | undefined;
  let handleAfterPrint: (() => void) | undefined;

  await new Promise<void>(resolve => {
    handleBeforePrint = () => {
      document.body.classList.add('is-printing');
      onBeforePrint?.();
    };
    handleAfterPrint = () => {
      if (!resolved) {
        resolved = true;
        document.body.classList.remove('is-printing');
        onAfterPrint?.();
        resolve();
      }
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    // 8. 触发打印
    window.print();

    // 如果浏览器不支持 afterprint，超时后直接 resolve
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 500);
  });

  // 9. 移除事件监听
  if (handleBeforePrint) window.removeEventListener('beforeprint', handleBeforePrint);
  if (handleAfterPrint) window.removeEventListener('afterprint', handleAfterPrint);

  // 10. 清理打印 DOM
  cleanupPrintDom();
}

// ==================== 打印 DOM 管理 ====================

function cleanupPrintDom(): void {
  const root = document.getElementById(PRINT_ROOT_ID);
  if (root) root.remove();
  const style = document.getElementById(PRINT_STYLE_ID);
  if (style) style.remove();
}

function createPrintStyles(): void {
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @page {
      size: A4 landscape;
      margin: ${MARGIN_MM}mm;
    }

    @media print {
      body > *:not(#${PRINT_ROOT_ID}) {
        display: none !important;
      }

      #${PRINT_ROOT_ID} {
        display: block !important;
        position: static !important;
        z-index: auto !important;
      }

      body.is-printing {
        position: static !important;
      }
    }

    @media screen {
      #${PRINT_ROOT_ID} {
        display: none !important;
      }
    }

    #${PRINT_ROOT_ID} {
      position: relative;
      left: 0;
      top: 0;
      width: ${CONTENT_WIDTH_MM}mm;
      min-height: ${CONTENT_HEIGHT_MM}mm;
      padding: 0;
      margin: 0;
      font-family: "Microsoft YaHei", "Noto Sans SC", "PingFang SC", Arial, sans-serif;
      font-size: 9pt;
      color: #111;
      background: #fff;
      box-sizing: border-box;
    }

    /* 报告容器 */
    .print-report {
      width: 100%;
      box-sizing: border-box;
    }

    .print-report + .print-report {
      page-break-before: always;
      break-before: page;
    }

    /* 表格基础样式 */
    .print-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .print-table th,
    .print-table td {
      border: 1px solid #2b2b2b;
      padding: 1mm 2mm;
      text-align: center;
      vertical-align: top;
      font-size: 9pt;
      line-height: 1.4;
      word-break: break-word;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .print-table th {
      background: transparent;
      font-weight: 600;
    }

    /* 报告标题 */
    .print-report-title {
      text-align: center;
      font-family: SimHei, "黑体", "Microsoft YaHei", sans-serif;
      font-size: 18pt;
      font-weight: 600;
      letter-spacing: 2px;
      padding: 3mm 0;
      background: #fff;
    }

    /* 报告元数据行 */
    .print-meta-row td,
    .print-meta-row th {
      height: 6mm;
      padding: 0.5mm 2mm;
    }

    /* 特级护理列头 */
    .print-special-care-header {
      color: #e60012;
      font-weight: 600;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    /* 患者状态单元格 */
    .print-status-cell {
      color: #e60012;
      font-weight: 600;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    /* 签名行 */
    .print-signature-row td,
    .print-signature-row th {
      background: #fff;
    }

    /* 分类单元格 */
    .print-category-cell {
      text-align: center;
      vertical-align: middle;
      font-weight: 600;
      color: #475569;
    }

    /* 分类标签 */
    .print-metric-label {
      text-align: left;
      font-weight: 500;
    }

    /* 强调单元格 */
    .print-emphasis {
      color: #dc2626;
      font-weight: 600;
    }

    /* 续行标识 */
    .print-continuation {
      font-size: 8pt;
      color: #666;
    }

    /* 表头重复 */
    .print-table thead {
      display: table-header-group;
    }

    /* 表格行避免跨页 */
    .print-table tr {
      break-inside: auto;
      page-break-inside: auto;
    }

    /* 表格整体允许分页 */
    .print-table {
      page-break-inside: auto;
      break-inside: auto;
    }

    /* 避免表格标题后立即分页 */
    .print-report-title {
      page-break-after: avoid;
      break-after: avoid;
    }
  `;
  document.head.appendChild(style);
}

function createPrintRoot(): HTMLDivElement {
  const root = document.createElement('div');
  root.id = PRINT_ROOT_ID;
  return root;
}

async function waitForRender(): Promise<void> {
  try { await document.fonts.ready; } catch { /* 静默跳过 */ }
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

// ==================== 报告1：护士交接班病情报告本 ====================

function renderReport1(
  root: HTMLDivElement,
  snapshot: DepartmentDailySnapshot,
  vm: HandoverReportViewModel,
  dateInput: string,
): void {
  const report = document.createElement('div');
  report.className = 'print-report';

  // 渲染标题和统计表
  renderReport1Header(report, snapshot, vm, dateInput);

  // 渲染患者交班表
  renderPatientTable(report, vm.rows, snapshot);

  root.appendChild(report);
}

function renderReport1Header(
  container: HTMLDivElement,
  snapshot: DepartmentDailySnapshot,
  vm: HandoverReportViewModel,
  dateInput: string,
): void {
  const table = document.createElement('table');
  table.className = 'print-table';

  // 标题行
  const titleRow = document.createElement('tr');
  const titleCell = document.createElement('th');
  titleCell.colSpan = 11;
  titleCell.className = 'print-report-title';
  titleCell.textContent = '护士交接班病情报告本';
  titleRow.appendChild(titleCell);
  table.appendChild(titleRow);

  // 元数据行
  const metaRow = document.createElement('tr');
  metaRow.className = 'print-meta-row';

  const deptTh = document.createElement('th');
  deptTh.textContent = '科室';
  metaRow.appendChild(deptTh);

  const deptTd = document.createElement('td');
  deptTd.colSpan = 3;
  deptTd.textContent = snapshot.departmentName || snapshot.departmentId;
  metaRow.appendChild(deptTd);

  const dateTh = document.createElement('th');
  dateTh.textContent = '日期';
  metaRow.appendChild(dateTh);

  const dateTd = document.createElement('td');
  dateTd.colSpan = 3;
  dateTd.textContent = dateInput;
  metaRow.appendChild(dateTd);

  const nurseTh = document.createElement('th');
  nurseTh.colSpan = 2;
  nurseTh.textContent = '护士长签名';
  metaRow.appendChild(nurseTh);

  const nurseTd = document.createElement('td');
  nurseTd.textContent = snapshot.draft.headNurseSignature || '';
  metaRow.appendChild(nurseTd);

  table.appendChild(metaRow);

  // 班次统计表头
  const headerRow = document.createElement('tr');
  const headers = ['班别', '病人总数', '出院', '转出', '死亡', '转入', '入院', '手术', '病危', '特级护理', '备注'];
  headers.forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    if (text === '特级护理') {
      th.className = 'print-special-care-header';
    }
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  // 班次统计数据
  const shifts: ShiftKey[] = ['day', 'evening', 'night'];
  const shiftLabels: Record<ShiftKey, string> = { day: '白班', evening: '中班', night: '夜班' };

  shifts.forEach(shift => {
    const row = document.createElement('tr');
    const stats = vm.statistics[shift];

    const shiftTh = document.createElement('th');
    shiftTh.textContent = shiftLabels[shift];
    row.appendChild(shiftTh);

    const values = [
      stats.total,
      stats.discharged ?? 0,
      stats.transferredOut ?? 0,
      stats.death ?? 0,
      stats.transferredIn ?? 0,
      stats.admission ?? 0,
      stats.operation ?? 0,
      stats.critical,
      stats.specialCare ?? 0,
    ];

    values.forEach(val => {
      const td = document.createElement('td');
      td.textContent = String(val);
      row.appendChild(td);
    });

    // 备注
    const remarkTd = document.createElement('td');
    remarkTd.textContent = snapshot.draft.remarks?.[shift] || '';
    row.appendChild(remarkTd);

    table.appendChild(row);
  });

  container.appendChild(table);
}

// ==================== 患者交班表 ====================

/**
 * 测量患者行高度（Fix 2：DOM 测量用于检测超高行）。
 * 创建屏幕外测量容器，使用打印样式测量每行实际高度。
 */
function measurePatientRowHeights(rows: HandoverPatientRow[]): number[] {
  const heights: number[] = [];

  // 创建测量容器
  const measureHost = document.createElement('div');
  measureHost.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;font-family:"Microsoft YaHei","Noto Sans SC","PingFang SC",Arial,sans-serif;font-size:9pt;';
  document.body.appendChild(measureHost);

  // 创建测量表格（使用与打印相同的列宽和样式）
  const table = document.createElement('table');
  table.className = 'print-table';
  table.style.cssText = 'width:283mm;border-collapse:collapse;table-layout:fixed;';

  const colWidths = ['5%', '6%', '5%', '10%', '22%', '17%', '17%', '18%'];
  const colgroup = document.createElement('colgroup');
  colWidths.forEach(w => {
    const col = document.createElement('col');
    col.style.width = w;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  // 表头（用于测量表头高度）
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['床号', '姓名', '状态', '住院号', '诊断', '白班', '中班', '夜班'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    th.style.cssText = 'border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;font-size:9pt;line-height:1.4;background:transparent;font-weight:600;';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  measureHost.appendChild(table);

  // 测量每行高度
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'break-inside:auto;page-break-inside:auto;';

    const statusDisplay = ['死亡', '转入', '入院', '手术'].includes(row.status)
      ? `"${row.status}"` : row.status;

    const cells = [
      row.bedNo ? (row.bedNo.endsWith('床') ? row.bedNo : row.bedNo + '床') : '',
      row.name,
      statusDisplay,
      row.mrn,
      row.diagnosis,
      row.shiftTexts.day || '',
      row.shiftTexts.evening || '',
      row.shiftTexts.night || '',
    ];

    cells.forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      td.style.cssText = 'border:1px solid #2b2b2b;padding:1mm 2mm;text-align:center;vertical-align:top;font-size:9pt;line-height:1.4;word-break:break-word;overflow-wrap:anywhere;white-space:pre-wrap;';
      if (i >= 5) {
        td.style.whiteSpace = 'pre-wrap';
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
    heights.push(pxToMm(tr.getBoundingClientRect().height));
    tbody.removeChild(tr);
  }

  document.body.removeChild(measureHost);
  return heights;
}

function renderPatientTable(container: HTMLDivElement, rows: HandoverPatientRow[], snapshot: DepartmentDailySnapshot): void {
  const table = document.createElement('table');
  table.className = 'print-table';

  // 设置列宽
  const colWidths = ['5%', '6%', '5%', '10%', '22%', '17%', '17%', '18%'];
  const colgroup = document.createElement('colgroup');
  colWidths.forEach(width => {
    const col = document.createElement('col');
    col.style.width = width;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  // 表头
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = ['床号', '姓名', '状态', '住院号', '诊断', '白班', '中班', '夜班'];
  headers.forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 表体
  const tbody = document.createElement('tbody');

  if (rows.length === 0) {
    // 空患者处理
    const emptyRow = document.createElement('tr');
    const emptyTd = document.createElement('td');
    emptyTd.colSpan = 8;
    emptyTd.textContent = '无患者数据';
    emptyTd.style.textAlign = 'center';
    emptyRow.appendChild(emptyTd);
    tbody.appendChild(emptyRow);
  } else {
    rows.forEach((row, idx) => {
      const tr = createPatientRow(row);
      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);

  // 签名行（仅最终页显示，使用真实护士姓名）
  const tfoot = document.createElement('tfoot');
  const signatureRow = document.createElement('tr');
  signatureRow.className = 'print-signature-row';

  const sigTd1 = document.createElement('td');
  sigTd1.colSpan = 5;
  signatureRow.appendChild(sigTd1);

  // 构建护士签名查找表
  const nurseNameMap = new Map<string, string>();
  if (snapshot.nurseAccounts) {
    for (const account of snapshot.nurseAccounts) {
      nurseNameMap.set(account.id, account.trueName);
    }
  }

  const shifts: ShiftKey[] = ['day', 'evening', 'night'];
  shifts.forEach(shift => {
    const td = document.createElement('td');
    const accountId = snapshot.draft?.shiftSignatures?.[shift] || '';
    const nurseName = accountId ? nurseNameMap.get(accountId) || '' : '';
    td.textContent = nurseName ? `护士签名：${nurseName}` : '护士签名：';
    signatureRow.appendChild(td);
  });

  tfoot.appendChild(signatureRow);
  table.appendChild(tfoot);

  container.appendChild(table);
}

function createPatientRow(row: HandoverPatientRow): HTMLTableRowElement {
  const tr = document.createElement('tr');

  // 固定信息列
  const bedTd = document.createElement('td');
  bedTd.textContent = row.bedNo ? (row.bedNo.endsWith('床') ? row.bedNo : row.bedNo + '床') : '';
  tr.appendChild(bedTd);

  const nameTd = document.createElement('td');
  nameTd.textContent = row.name;
  tr.appendChild(nameTd);

  const statusTd = document.createElement('td');
  statusTd.className = 'print-status-cell';
  statusTd.textContent = row.status;
  tr.appendChild(statusTd);

  const mrnTd = document.createElement('td');
  mrnTd.textContent = row.mrn;
  tr.appendChild(mrnTd);

  const diagTd = document.createElement('td');
  diagTd.textContent = row.diagnosis;
  tr.appendChild(diagTd);

  // 班次文本
  const shifts: ShiftKey[] = ['day', 'evening', 'night'];
  shifts.forEach(shift => {
    const td = document.createElement('td');
    td.textContent = row.shiftTexts[shift] || '';
    tr.appendChild(td);
  });

  return tr;
}

// ==================== 报告2：重症医学科病区交班报告 ====================

function renderReport2(root: HTMLDivElement, vm: HandoverReportViewModel, snapshot: DepartmentDailySnapshot): void {
  const report = document.createElement('div');
  report.className = 'print-report';

  // 标题
  const title = document.createElement('h2');
  title.className = 'print-report-title';
  title.textContent = '重症医学科病区交班报告';
  title.style.margin = '0';
  title.style.padding = '3mm 0';
  report.appendChild(title);

  // 安全指标表格（无 rowspan，支持分页）
  renderSafetyTable(report, vm.metrics, snapshot);

  root.appendChild(report);
}

function renderSafetyTable(
  container: HTMLDivElement,
  metrics: MetricRow[],
  snapshot: DepartmentDailySnapshot,
): void {
  const table = document.createElement('table');
  table.className = 'print-table';

  // 设置列宽
  const colgroup = document.createElement('colgroup');
  const colWidths = ['80px', '180px', 'calc((100% - 260px) / 3)', 'calc((100% - 260px) / 3)', 'calc((100% - 260px) / 3)'];
  colWidths.forEach(width => {
    const col = document.createElement('col');
    col.style.width = width;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  // 表头
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = ['分类', '项目', '白班', '中班', '夜班'];
  headers.forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 表体
  const tbody = document.createElement('tbody');
  const shifts: ShiftKey[] = ['day', 'evening', 'night'];

  // 构建护士签名查找表
  const nurseNameMap = new Map<string, string>();
  if (snapshot.nurseAccounts) {
    for (const account of snapshot.nurseAccounts) {
      nurseNameMap.set(account.id, account.trueName);
    }
  }

  // 计算每个分类的行跨度（rowspan）
  const categoryRowSpans = new Map<string, number>();
  const categoryStartIndices = new Map<string, number>();

  // 预处理：统计每个分类的行数
  metrics.forEach((metric, index) => {
    if (metric.category) {
      if (!categoryRowSpans.has(metric.category)) {
        categoryRowSpans.set(metric.category, 0);
        categoryStartIndices.set(metric.category, index);
      }
      categoryRowSpans.set(metric.category, categoryRowSpans.get(metric.category)! + 1);
    }
  });

  // 渲染行
  const processedCategories = new Set<string>();

  metrics.forEach((metric, index) => {
    const tr = document.createElement('tr');

    if (!metric.category) {
      // 独立项目：分类列合并到项目列
      const th = document.createElement('th');
      th.colSpan = 2;
      th.textContent = metric.label;
      tr.appendChild(th);
    } else {
      // 分类项目：仅在分类首次出现时渲染分类单元格
      if (!processedCategories.has(metric.category)) {
        const categoryTd = document.createElement('td');
        categoryTd.className = 'print-category-cell';
        categoryTd.textContent = metric.category;
        const rowspan = categoryRowSpans.get(metric.category) || 1;
        categoryTd.rowSpan = rowspan;
        tr.appendChild(categoryTd);
        processedCategories.add(metric.category);
      }

      const labelTh = document.createElement('th');
      labelTh.className = 'print-metric-label';
      labelTh.textContent = metric.label;
      tr.appendChild(labelTh);
    }

    // 数值（Fix 5：手动指标从 draft.manualMetrics 读取最新值）
    shifts.forEach(shift => {
      const td = document.createElement('td');
      let value: string;
      if (metric.mode === 'manual' && metric.key && snapshot.draft?.manualMetrics?.[metric.key]) {
        value = snapshot.draft.manualMetrics[metric.key][shift] ?? '';
      } else {
        value = metric.values[shift] ?? '';
      }
      td.textContent = value;

      if (metric.emphasize && value) {
        td.className = 'print-emphasis';
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // 签名行（Fix 4：解析真实护士姓名）
  const signatureRow = document.createElement('tr');
  signatureRow.className = 'print-signature-row';

  const sigTh = document.createElement('th');
  sigTh.colSpan = 2;
  sigTh.textContent = '护士签名';
  signatureRow.appendChild(sigTh);

  shifts.forEach(shift => {
    const td = document.createElement('td');
    const accountId = snapshot.draft?.shiftSignatures?.[shift] || '';
    const nurseName = accountId ? nurseNameMap.get(accountId) || '' : '';
    td.textContent = nurseName;
    signatureRow.appendChild(td);
  });

  tbody.appendChild(signatureRow);

  table.appendChild(tbody);
  container.appendChild(table);
}

// ==================== 导出 ====================

export { cleanupPrintDom, waitForRender };
