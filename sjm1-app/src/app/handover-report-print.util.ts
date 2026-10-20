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
  NurseAccount,
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

// ==================== 签名解析 ====================

/**
 * 根据草稿里保存的签名值解析护士姓名。
 *
 * 兼容历史数据：
 * - 账户文档早期缺少 id（Mongo 原始文档只有 _id），界面保存的可能是 "undefined"；
 * - 或者直接保存成了护士姓名。
 *
 * @param accounts 护士账号列表
 * @param stored 草稿中保存的签名值（账号ID或姓名）
 * @returns 显示用姓名，无法解析时返回空字符串
 */
export function resolveNurseName(accounts: NurseAccount[] | undefined, stored: string | undefined): string {
  const value = (stored || '').trim();
  if (!value || value === 'undefined') { return ''; }

  const list = accounts || [];
  const matched = list.find(account => (account.id && account.id === value) || account.trueName === value);
  if (matched?.trueName) { return matched.trueName; }

  // 无法匹配时，只展示中文姓名（历史数据可能直接存了姓名）；
  // ID、账号等一律不展示，避免打印出无意义的标识。
  return /[一-龥]/.test(value) ? value : '';
}

/**
 * 把日期输入值（YYYY-MM-DD）转成中文写法（YYYY年M月D日）。
 * 非标准格式时原样返回，避免打印出空日期。
 * @param dateInput 日期输入值
 */
export function formatChineseDate(dateInput: string): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateInput || '').trim());
  if (!matched) { return (dateInput || '').trim(); }
  return `${matched[1]}年${parseInt(matched[2], 10)}月${parseInt(matched[3], 10)}日`;
}

// ==================== 主入口 ====================

/**
 * 打印交班报告。
 * @param snapshot 当前数据快照
 * @param vm 视图模型
 * @param dateInput 日期输入值
 * @param reportType 报告类型：report1=护士交接班病情报告本，report2=重症医学科病区交班报告，all=全部（默认）
 */
export async function printHandoverReport(
  snapshot: DepartmentDailySnapshot,
  vm: HandoverReportViewModel,
  dateInput: string,
  onBeforePrint?: () => void,
  onAfterPrint?: () => void,
  reportType: 'report1' | 'report2' | 'all' = 'all',
): Promise<void> {
  // 1. 清理旧的打印 DOM
  cleanupPrintDom();

  // 2. 创建打印样式（页脚统一输出页码，报告1/2 通用）
  createPrintStyles();

  // 3. 创建打印根节点
  const root = createPrintRoot();

  // 4. 按类型渲染报告
  if (reportType === 'report1' || reportType === 'all') {
    renderReport1(root, snapshot, vm, dateInput);
  }
  if (reportType === 'report2' || reportType === 'all') {
    renderReport2(root, vm, snapshot, dateInput);
  }

  // 5. 挂载到 body（测量态：离屏可见，供报告1分页拆分测量真实行高）
  document.body.appendChild(root);
  root.classList.add('is-measuring');

  // 6. 等待渲染稳定
  await waitForRender();

  // 6.5 报告1：第一页放不下的患者行拆到续表，续表每页重复"科室/日期/护士长签名"单头行
  try {
    splitReport1PatientTable(root, snapshot, dateInput);
  } catch (err) {
    console.warn('[HANDOVER] 报告1分页拆分失败，保持整表由浏览器分页', err);
  }
  root.classList.remove('is-measuring');

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

/**
 * 创建打印样式。
 * 页脚统一输出页码（第X页），报告1/2 通用。
 */
function createPrintStyles(): void {
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @page {
      size: A4 landscape;
      margin: ${MARGIN_MM}mm;
      @bottom-center {
        content: "第" counter(page) "页";
        font-size: 9pt;
        color: #111;
      }
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

    /* 测量态：离屏可见，供报告1分页拆分测量真实行高 */
    #${PRINT_ROOT_ID}.is-measuring {
      display: block !important;
      position: absolute !important;
      left: -10000px !important;
      top: 0 !important;
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

    /* 报告1续表：从新页开始；thead（元数据行+列头行）打印时每页顶部重复 */
    .print-continuation-page {
      page-break-before: always;
      break-before: page;
    }

    /* 表格基础样式 */
    .print-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border-bottom: 2px solid #2b2b2b;
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

    /* 修复跨页时最后一行底部边框缺失 */
    .print-table tr:last-child td,
    .print-table tr:last-child th {
      border-bottom: 2px solid #2b2b2b;
    }

    .print-table tfoot td,
    .print-table tfoot th {
      border-bottom: 2px solid #2b2b2b;
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

    /* 报告2 标题行：标题居中，右侧同一行写日期（年 月 日）
       作为 thead 首行放入表格，打印分页时每页重复（第二页右上角也有时间） */
    .print-report-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: baseline;
      /* 上边距收紧，标题整体上移 */
      padding: 1mm 0 3mm;
    }

    .print-report-header .print-report-title {
      grid-column: 2;
      margin: 0;
      padding: 0;
    }

    .print-report-date {
      grid-column: 3;
      justify-self: end;
      font-size: 12pt;
      letter-spacing: 1px;
      white-space: nowrap;
    }

    /* 标题行单元格去边框：保持标题浮于表格上方的外观，列头行的顶边线作为分隔 */
    .print-table thead tr.print-report-header-row > th {
      border: none;
      padding: 0;
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

    /* 班次内容列（白班/中班/夜班）左对齐 */
    .print-table td.print-shift-cell {
      text-align: left;
    }

    /* 分类单元格 - 黑色文字 */
    .print-table td.print-category-cell {
      text-align: center;
      vertical-align: middle;
      font-weight: 600;
      color: #111;
      border-bottom: 0;
    }

    /*
     * 分类列每行使用独立单元格（不使用 rowspan，保证分页时行可独立断开）。
     * 通过去掉分类块内部横线来保持合并单元格的外观：
     * - 首行单元格（print-category-cell）：底边为 0，顶边保留（与表头/上一分类分隔）；
     * - 续行单元格（print-category-cont）：顶边、底边均为 0；
     * - 边框合并规则取相邻两边较宽者，因此内部边线消失、分类间分隔线保留。
     */
    .print-table td.print-category-cont {
      border-top: 0;
    }

    /*
     * 预分页（仅报告2安全表，打印前由脚本测量后打标）：
     * - 分段末行分类单元格恢复底边，在分页处封住分类列；
     * - 分段起始行强制换页，避免浏览器自然分页落在分类块中间。
     * 两条规则均声明在 print-category-cell 之后，同特异性时以后者为准。
     */
    .print-table td.print-category-seal {
      border-bottom: 1px solid #2b2b2b;
    }

    .print-table tr.print-force-break {
      page-break-before: always;
      break-before: page;
    }

    /* 分类标签 - 黑色文字 */
    .print-metric-label {
      text-align: left;
      font-weight: 500;
      color: #111;
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

    /* 修复表格跨页时最后一行底部边框缺失 - 已在 .print-table 基础样式中处理 */
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
  renderPatientTable(report, vm.rows, snapshot, vm);

  root.appendChild(report);
}

function renderReport1Header(
  container: HTMLDivElement,
  snapshot: DepartmentDailySnapshot,
  vm: HandoverReportViewModel,
  dateInput: string,
): void {
  // 标题（独立于表格）
  const title = document.createElement('h2');
  title.className = 'print-report-title';
  title.textContent = '护士交接班病情报告本';
  container.appendChild(title);

  const table = document.createElement('table');
  table.className = 'print-table';

  // 元数据行（第一页顶部，布局保持不变）
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

    const statusDisplay = ['死亡', '转入', '入院', '手术'].some(k => row.status.includes(k))
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

function renderPatientTable(
  container: HTMLDivElement,
  rows: HandoverPatientRow[],
  snapshot: DepartmentDailySnapshot,
  vm: HandoverReportViewModel,
): void {
  const table = document.createElement('table');
  table.className = 'print-table print-patient-table';

  // 设置列宽
  const colWidths = ['5%', '6%', '5%', '10%', '22%', '17%', '17%', '18%'];
  const colgroup = document.createElement('colgroup');
  colWidths.forEach(width => {
    const col = document.createElement('col');
    col.style.width = width;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  // 表头（第一页布局保持原样；续表的每页单头在 splitReport1PatientTable 中追加）
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
      const tr = createPatientRow(row, vm);
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

  const shifts: ShiftKey[] = ['day', 'evening', 'night'];
  shifts.forEach(shift => {
    const td = document.createElement('td');
    const nurseName = resolveNurseName(snapshot.nurseAccounts, snapshot.draft?.shiftSignatures?.[shift]);
    td.textContent = nurseName ? `护士签名：${nurseName}` : '护士签名：';
    signatureRow.appendChild(td);
  });

  tfoot.appendChild(signatureRow);
  table.appendChild(tfoot);

  container.appendChild(table);
}

/**
 * 报告1分页拆分：第一页放不下的患者行移入续表，续表 thead 重复
 * "科室 / 日期 / 护士长签名"元数据行 —— 打印时 thead 每页顶部重复，
 * 因此从第二页起每页开头都有这一行；第一页布局保持原样。
 *
 * 续表通过 page-break-before: always 从新页开始；签名行（tfoot）随
 * 续表走，仍只在最终页显示。
 *
 * 调用前提：root 处于 is-measuring（离屏可见）状态、字体已加载、
 * 渲染已稳定。测量失败时抛错，由调用方兜底保持整表由浏览器分页。
 */
function splitReport1PatientTable(
  root: HTMLElement,
  snapshot: DepartmentDailySnapshot,
  dateInput: string,
): void {
  const patientTable = root.querySelector('.print-patient-table') as HTMLTableElement | null;
  if (!patientTable) { return; } // 仅打印报告2时不存在患者表

  const tbody = patientTable.tBodies[0];
  if (!tbody) { return; }

  const rows = Array.from(tbody.rows);
  if (rows.length === 0) { return; }

  // 第一页在患者表之前已占用的高度（标题+统计表及其上边距，从打印根量起）
  const rootRect = root.getBoundingClientRect();
  const tableRect = patientTable.getBoundingClientRect();
  const usedHeight = pxToMm(tableRect.top - rootRect.top);

  const theadHeight = patientTable.tHead
    ? pxToMm(patientTable.tHead.getBoundingClientRect().height)
    : 0;
  const tfootHeight = patientTable.tFoot
    ? pxToMm(patientTable.tFoot.getBoundingClientRect().height)
    : 0;

  const rowHeights = rows.map(tr => pxToMm(tr.getBoundingClientRect().height));
  const totalRowsHeight = rowHeights.reduce((sum, h) => sum + h, 0);

  // 第一页患者表可用高度（签名行随续表走，不占第一页）
  const available = CONTENT_HEIGHT_MM - usedHeight - theadHeight - SAFETY_GAP_MM;

  // 全部行 + 签名行都放得下：不拆分，保持现状
  if (totalRowsHeight + tfootHeight <= available + 0.5) { return; }

  // 贪心累加第一页能完整放下的行数
  let splitIndex = 0;
  let acc = 0;
  for (const h of rowHeights) {
    if (acc + h <= available + 0.5) {
      acc += h;
      splitIndex += 1;
    } else {
      break;
    }
  }
  // 行全部放得下、只是签名行放不下（或仅 1 行）：
  // 最后一行随续表走，避免第一页结尾被签名行挤爆/续表为空
  if (splitIndex === rows.length) {
    splitIndex = rows.length - 1;
  }

  // ---- 构建续表（外包一层 div，page-break 在块级元素上更可靠） ----
  const contWrap = document.createElement('div');
  contWrap.className = 'print-continuation-page';

  const contTable = document.createElement('table');
  contTable.className = 'print-table print-patient-table';

  const colgroup = patientTable.querySelector('colgroup');
  if (colgroup) { contTable.appendChild(colgroup.cloneNode(true)); }

  const contThead = document.createElement('thead');

  // 元数据行（8 列布局：科室 | 科室名 | 日期 | 日期值 | 护士长签名 | 签名）
  const metaRow = document.createElement('tr');
  metaRow.className = 'print-meta-row';
  const metaCells: Array<{ tag: 'th' | 'td'; text: string; colSpan: number }> = [
    { tag: 'th', text: '科室', colSpan: 1 },
    { tag: 'td', text: snapshot.departmentName || snapshot.departmentId, colSpan: 2 },
    { tag: 'th', text: '日期', colSpan: 1 },
    { tag: 'td', text: dateInput, colSpan: 1 },
    { tag: 'th', text: '护士长签名', colSpan: 1 },
    { tag: 'td', text: snapshot.draft.headNurseSignature || '', colSpan: 2 },
  ];
  metaCells.forEach(cell => {
    // 分支字面量调用，确保拿到 HTMLTableCellElement 类型
    const el = cell.tag === 'th' ? document.createElement('th') : document.createElement('td');
    el.colSpan = cell.colSpan;
    el.textContent = cell.text;
    metaRow.appendChild(el);
  });
  contThead.appendChild(metaRow);

  // 列头行（床号/姓名/…，克隆原表头）
  const headRow = patientTable.tHead?.rows[0];
  if (headRow) { contThead.appendChild(headRow.cloneNode(true) as HTMLTableRowElement); }
  contTable.appendChild(contThead);

  // 剩余患者行移入续表（appendChild 移动节点而非复制）
  const contTbody = document.createElement('tbody');
  rows.slice(splitIndex).forEach(tr => contTbody.appendChild(tr));
  contTable.appendChild(contTbody);

  // 签名行移到续表末尾（仍只在最终页显示）
  if (patientTable.tFoot) { contTable.appendChild(patientTable.tFoot); }

  contWrap.appendChild(contTable);

  // 续表插在原表位置（报告1容器内），再移除空壳原表，
  // 保证打印"全部"时代续表不会落到报告2之后
  patientTable.insertAdjacentElement('afterend', contWrap);
  if (splitIndex === 0) {
    // 第一页一行都放不下：移除空壳原表，第一页只保留标题+统计表
    patientTable.remove();
  }
}

function createPatientRow(row: HandoverPatientRow, vm: HandoverReportViewModel): HTMLTableRowElement {
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
    td.className = 'print-shift-cell';
    td.textContent = row.shiftTexts[shift] || '';

    // 夜班列添加生命体征和出入量总结（仅入院、转入、病危患者）
    if (shift === 'night' && ['转入', '入院', '病危'].some(k => row.status.includes(k))) {
      // 生命体征
      if (row.nightVitalSigns && hasVitalSignsData(row.nightVitalSigns)) {
        const vitalDiv = document.createElement('div');
        vitalDiv.style.marginTop = '4px';
        vitalDiv.style.fontSize = '8pt';
        vitalDiv.style.lineHeight = '1.4';
        vitalDiv.innerHTML = buildVitalSignsText(row.nightVitalSigns);
        td.appendChild(vitalDiv);
      }

      // 出入量总结
      if (row.nightFluidSummary && (row.nightFluidSummary.totalInput > 0 || row.nightFluidSummary.totalOutput > 0)) {
        const fluidDiv = document.createElement('div');
        fluidDiv.style.marginTop = '4px';
        fluidDiv.style.fontSize = '8pt';
        fluidDiv.style.lineHeight = '1.4';
        fluidDiv.innerHTML = buildFluidSummaryText(row.nightFluidSummary, row.fluidHours);
        td.appendChild(fluidDiv);
      }
    }

    tr.appendChild(td);
  });

  return tr;
}

/**
 * 检查生命体征数据是否有值
 */
function hasVitalSignsData(vitalSigns: any): boolean {
  return vitalSigns.temperature || vitalSigns.heartRate || vitalSigns.respiration
    || vitalSigns.spO2 || vitalSigns.nibpSystolic || vitalSigns.ibpSystolic || vitalSigns.cvp;
}

/**
 * 构建生命体征文本
 */
function buildVitalSignsText(vitalSigns: any): string {
  const parts: string[] = [];

  if (vitalSigns.temperature) {
    parts.push(`体温：${vitalSigns.temperature}℃`);
  }
  if (vitalSigns.heartRate) {
    parts.push(`心率：${vitalSigns.heartRate}次/分`);
  }
  if (vitalSigns.respiration) {
    parts.push(`呼吸：${vitalSigns.respiration}次/分`);
  }
  if (vitalSigns.spO2) {
    parts.push(`血氧饱和度：${vitalSigns.spO2}%`);
  }
  if (vitalSigns.nibpSystolic && vitalSigns.nibpDiastolic) {
    parts.push(`血压：${vitalSigns.nibpSystolic}/${vitalSigns.nibpDiastolic}mmHg`);
  } else if (vitalSigns.ibpSystolic && vitalSigns.ibpDiastolic) {
    parts.push(`血压：${vitalSigns.ibpSystolic}/${vitalSigns.ibpDiastolic}mmHg`);
  }
  if (vitalSigns.cvp) {
    parts.push(`中心静脉压：${vitalSigns.cvp}cmH2O`);
  }

  return `生命体征：${parts.join('；')}`;
}

/**
 * 构建出入量总结文本
 */
function buildFluidSummaryText(summary: any, fluidHours?: number): string {
  const hoursText = fluidHours ? `${fluidHours.toFixed(1)}小时` : '';
  const enteralDetail = summary.gastrointestinalInput > 0 ? `（胃肠入量：${summary.gastrointestinalInput}ml）` : '';
  const excretionDetail = summary.excretionItems?.length > 0 ? `（${summary.excretionItems.map((i: any) => `${i.name}：${i.amount}ml`).join('、')}）` : '';
  const drainageDetail = summary.drainageItems?.length > 0 ? `（${summary.drainageItems.map((i: any) => `${i.name}：${i.amount}ml`).join('、')}）` : '';
  const parts = [
    `总入量：${summary.totalInput}ml；药物治疗：${summary.medicationInput}ml；胃肠入量：${summary.gastrointestinalInput}ml${enteralDetail}`,
    `总出量：${summary.totalOutput}ml；尿量：${summary.urineOutput}ml；净超滤量：${summary.ultrafiltrationOutput}ml；排出物：${summary.excretionOutput}ml${excretionDetail}；引流液：${summary.drainageOutput}ml${drainageDetail}`,
    `平衡量：${summary.balance}ml`,
  ];

  return `${hoursText}出入量总结：${parts.join('；')}`;
}

// ==================== 报告2：重症医学科病区交班报告 ====================

function renderReport2(
  root: HTMLDivElement,
  vm: HandoverReportViewModel,
  snapshot: DepartmentDailySnapshot,
  dateInput: string,
): void {
  const report = document.createElement('div');
  report.className = 'print-report';

  // 安全指标表格（无 rowspan，支持分页）；标题+日期作为 thead 首行随每页重复
  renderSafetyTable(report, vm.metrics, snapshot, dateInput);

  root.appendChild(report);
}

/**
 * 安全表预分页：
 * 打印前用同一渲染引擎离屏测量表头与各行高度，按内容区可用高度预分配分页，
 * 并在分段边界打标：
 * - 分段末行分类单元格加 print-category-seal（恢复底边），封住分页处的分类列；
 * - 分段起始行加 print-force-break（break-before: page），避免浏览器自然分页
 *   落在分类块中间导致合并外观断裂。
 * 测量与预览同引擎同会话，漂移极小；若仍有偏差，浏览器自然分页兜底
 * （该页分类列封口缺失，thead 照常重复）。
 */
function paginateSafetyTable(table: HTMLTableElement): void {
  const theadRows = table.tHead ? Array.from(table.tHead.rows) : [];
  const bodyRows = table.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];
  if (bodyRows.length === 0) {
    return;
  }

  const measureHost = document.createElement('div');
  measureHost.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;width:${CONTENT_WIDTH_MM}mm;`;
  document.body.appendChild(measureHost);
  measureHost.appendChild(table);

  try {
    const headerMm = theadRows.reduce((sum, row) => sum + pxToMm(row.getBoundingClientRect().height), 0);
    const available = CONTENT_HEIGHT_MM - headerMm - SAFETY_GAP_MM;
    const heights = bodyRows.map(row => pxToMm(row.getBoundingClientRect().height));

    let used = 0;
    let endIndex = -1;
    heights.forEach((height, index) => {
      if (used + height > available && endIndex >= 0) {
        const sealCell = bodyRows[endIndex].querySelector('td.print-category-cell');
        if (sealCell) {
          sealCell.classList.add('print-category-seal');
        }
        bodyRows[index].classList.add('print-force-break');
        used = height;
        endIndex = index;
      } else {
        used += height;
        endIndex = index;
      }
    });
  } finally {
    measureHost.removeChild(table);
    document.body.removeChild(measureHost);
  }
}

function renderSafetyTable(
  container: HTMLDivElement,
  metrics: MetricRow[],
  snapshot: DepartmentDailySnapshot,
  dateInput: string,
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

  const thead = document.createElement('thead');

  // 标题行：标题居中，右侧同一行写日期（年 月 日）。
  // 放入 thead 首行后随表头每页重复，第二页右上角同样展示时间。
  const reportHeaderRow = document.createElement('tr');
  reportHeaderRow.className = 'print-report-header-row';

  const reportHeaderTh = document.createElement('th');
  reportHeaderTh.colSpan = 5;

  const header = document.createElement('div');
  header.className = 'print-report-header';

  const title = document.createElement('h2');
  title.className = 'print-report-title';
  title.textContent = '重症医学科病区交班报告';
  header.appendChild(title);

  const date = document.createElement('span');
  date.className = 'print-report-date';
  date.textContent = formatChineseDate(dateInput);
  header.appendChild(date);

  reportHeaderTh.appendChild(header);
  reportHeaderRow.appendChild(reportHeaderTh);
  thead.appendChild(reportHeaderRow);

  // 列头
  const columnHeaderRow = document.createElement('tr');
  const headers = ['分类', '项目', '白班', '中班', '夜班'];
  headers.forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    columnHeaderRow.appendChild(th);
  });
  thead.appendChild(columnHeaderRow);
  table.appendChild(thead);

  // 表体
  const tbody = document.createElement('tbody');
  const shifts: ShiftKey[] = ['day', 'evening', 'night'];

  // 分类列每行渲染独立单元格，不使用 rowspan：
  // rowspan 分组在打印分页时会被浏览器作为不可拆分的整体处理，
  // 放不下第一页剩余空间时整组被推到下一页，导致第一页只剩标题和第一行、大片空白。
  // 仅分类首行显示分类名，其余行留空并由 CSS 隐藏分类块内部横线，保持合并外观。
  const seenCategories = new Set<string>();

  metrics.forEach(metric => {
    const tr = document.createElement('tr');

    if (!metric.category) {
      // 独立项目：分类列合并到项目列
      const th = document.createElement('th');
      th.colSpan = 2;
      th.textContent = metric.label;
      tr.appendChild(th);
    } else {
      // 分类项目：每行都有分类单元格，首行显示分类名
      const categoryTd = document.createElement('td');
      categoryTd.className = 'print-category-cell';
      if (seenCategories.has(metric.category)) {
        categoryTd.classList.add('print-category-cont');
      } else {
        categoryTd.textContent = metric.category;
        seenCategories.add(metric.category);
      }
      tr.appendChild(categoryTd);

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
    td.textContent = resolveNurseName(snapshot.nurseAccounts, snapshot.draft?.shiftSignatures?.[shift]);
    signatureRow.appendChild(td);
  });

  tbody.appendChild(signatureRow);

  table.appendChild(tbody);

  // 预分页：分段末行封住分类列 + 分段起始行强制换页（见 paginateSafetyTable）
  paginateSafetyTable(table);

  container.appendChild(table);
}

// ==================== 导出 ====================

export { cleanupPrintDom, waitForRender };
