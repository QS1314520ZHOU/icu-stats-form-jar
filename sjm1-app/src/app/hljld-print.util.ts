/**
 * 护理记录单打印分页工具
 *
 * 实现A4横向精确分页，每页包含：
 * - 标题和患者信息
 * - 表格表头
 * - 当前页护理记录
 * - 备注（每页重复）
 * - 页码（第X页 共X页）
 */

import { openPrintWindow, readyPrint, validatePrintPages } from './form-print.util';

/** A4横向尺寸常量（mm） */
const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;

/** 打印页边距（mm） */
const PAGE_PADDING_TOP = 5;
const PAGE_PADDING_BOTTOM = 4;
const PAGE_PADDING_LEFT = 7;
const PAGE_PADDING_RIGHT = 7;

/** 标题和患者信息高度（mm） */
const HEADER_HEIGHT_MM = 18;

/** 备注区域高度（mm） */
const REMARKS_HEIGHT_MM = 16;

/** 页码高度（mm） */
const PAGENO_HEIGHT_MM = 5;

/** 打印字体大小（pt） */
const PRINT_FONT_SIZE_PT = 7.5;
const PRINT_LINE_HEIGHT_PT = 9;
const PRINT_HEADER_FONT_PT = 22;
const PRINT_PAGENO_FONT_PT = 8;

/** 护理记录单打印CSS */
const PRINT_CSS_HLJLD = `
/* A4横向打印基础 */
@page { size: A4 landscape; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { color: #000; font-family: 'SimSun', '宋体', serif; }

/* 打印页容器 */
.print-page {
  box-sizing: border-box;
  width: ${A4_WIDTH_MM}mm;
  height: ${A4_HEIGHT_MM}mm;
  margin: 0;
  padding: 0;
  overflow: hidden;
  break-after: page;
  page-break-after: always;
  background: #fff;
}
.print-page:last-child {
  break-after: auto;
  page-break-after: auto;
}

/* 页面网格布局 */
.sheet {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  width: ${A4_WIDTH_MM}mm;
  height: ${A4_HEIGHT_MM}mm;
  padding: ${PAGE_PADDING_TOP}mm ${PAGE_PADDING_RIGHT}mm ${PAGE_PADDING_BOTTOM}mm ${PAGE_PADDING_LEFT}mm;
  overflow: hidden;
  background: #fff;
  color: #000;
}

/* 标题和患者信息 */
.sheet-head {
  text-align: center;
  padding-bottom: 2mm;
}

.sheet-title {
  font-family: 'SimHei', '黑体', sans-serif;
  font-weight: 700;
  font-size: ${PRINT_HEADER_FONT_PT}pt;
  line-height: 1.35;
  margin: 0 0 2mm;
  letter-spacing: 2px;
}

.patient-info {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 2mm 6mm;
  font-family: 'SimSun', '宋体', serif;
  font-size: ${PRINT_FONT_SIZE_PT}pt;
  font-weight: 400;
  line-height: 1.4;
  color: #000;
}

.patient-info b {
  font-weight: 700;
}

/* 表格内容区域 */
.sheet-content {
  min-height: 0;
  overflow: hidden;
}

.sheet-content .record-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-family: 'SimSun', '宋体', serif;
  font-size: ${PRINT_FONT_SIZE_PT}pt;
  line-height: ${PRINT_LINE_HEIGHT_PT}pt;
}

.sheet-content .record-table th,
.sheet-content .record-table td {
  border: 0.3mm solid #000;
  padding: 0.6mm;
  vertical-align: middle;
  text-align: center;
}

.sheet-content .record-table thead th {
  background: #e5edf2;
  font-weight: 600;
}

/* 备注区域 */
.sheet-remarks {
  display: grid;
  grid-template-columns: 16mm 1fr;
  border: 0.3mm solid #000;
  border-top: 0;
  break-inside: avoid;
  page-break-inside: avoid;
  font-family: 'SimSun', '宋体', serif;
  font-size: ${PRINT_FONT_SIZE_PT}pt;
  line-height: ${PRINT_LINE_HEIGHT_PT}pt;
}

.remarks-label {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1mm;
  border-right: 0.3mm solid #000;
  font-weight: 500;
}

.remarks-content {
  padding: 1mm 1.5mm;
}

.remark-line + .remark-line {
  margin-top: 0.5mm;
}

/* 页码 */
.sheet-pageno {
  position: static;
  padding-top: 2mm;
  text-align: center;
  font-family: 'SimSun', '宋体', serif;
  font-size: ${PRINT_PAGENO_FONT_PT}pt;
  line-height: 1.2;
  color: #000;
}

/* 打印隐藏 */
.no-print { display: none !important; }
`;

/**
 * 打印护理记录单的配置
 */
export interface HljldPrintConfig {
  /** 宿主元素，用于提取患者信息 */
  hostElement: HTMLElement;
  /** 备注行 */
  remarkLines: string[];
}

/**
 * 打印护理记录单的业务块
 */
interface PrintBlock {
  /** 块类型 */
  kind: 'time-group' | 'summary';
  /** 块的HTML内容 */
  html: string;
  /** 块的测量元素 */
  element?: HTMLElement;
  /** 块的高度（px） */
  height: number;
}

/**
 * 打印护理记录单
 */
export async function printHljldRecord(config: HljldPrintConfig): Promise<void> {
  const { hostElement, remarkLines } = config;

  // 1. 提取患者信息
  const patientInfo = extractPatientInfo(hostElement);

  // 2. 提取表格结构
  const tableStructure = extractTableStructure(hostElement);

  // 3. 提取业务块
  const blocks = extractBlocks(hostElement);

  if (blocks.length === 0) {
    throw new Error('无可打印的护理记录数据');
  }

  // 4. 打开打印窗口
  const printWin = openPrintWindow('', PRINT_CSS_HLJLD);
  if (!printWin) {
    throw new Error('打印窗口被拦截，请允许弹出窗口');
  }

  // 5. 等待字体加载
  try {
    const doc = printWin.document as any;
    if (doc.fonts?.ready) {
      await doc.fonts.ready;
    }
  } catch {
    // 字体加载失败继续
  }

  // 6. 构建所有页面
  const pages = buildPrintPages(
    printWin.document,
    patientInfo,
    tableStructure,
    blocks,
    remarkLines,
  );

  // 7. 更新总页数
  updatePageNumbers(pages);

  // 8. 验证打印页
  const isValid = validatePrintPages(printWin);
  if (!isValid) {
    console.error('[HLJLD][print] 打印页验证失败');
    printWin.close();
    throw new Error('打印页验证失败，内容可能溢出，请检查数据');
  }

  // 9. 执行打印
  readyPrint(printWin, () => {
    try {
      printWin.print();
    } catch (error) {
      console.error('[HLJLD][print] 打印执行失败', error);
    }
  });
}

/**
 * 提取患者信息
 */
function extractPatientInfo(hostElement: HTMLElement): {
  title: string;
  bedNo: string;
  name: string;
  mrn: string;
  sex: string;
  age: string;
  diagnosis: string;
} {
  const titleEl = hostElement.querySelector('h1');
  const title = titleEl?.textContent?.trim() || '重钢总医院重症医学科护理记录单';

  // 提取患者信息
  const patientStrip = hostElement.querySelector('.patient-strip');
  const spans = patientStrip?.querySelectorAll('span') || [];

  let bedNo = '';
  let name = '';
  let mrn = '';
  let sex = '';
  let age = '';
  let diagnosis = '';

  spans.forEach(span => {
    const text = span.textContent || '';
    if (text.startsWith('床号：')) {
      bedNo = text.replace('床号：', '').trim();
    } else if (text.startsWith('姓名：')) {
      name = text.replace('姓名：', '').trim();
    } else if (text.startsWith('住院号：')) {
      mrn = text.replace('住院号：', '').trim();
    } else if (text.startsWith('性别：')) {
      sex = text.replace('性别：', '').trim();
    } else if (text.startsWith('年龄：')) {
      age = text.replace('年龄：', '').trim();
    } else if (text.startsWith('诊断：')) {
      diagnosis = text.replace('诊断：', '').trim();
    }
  });

  return { title, bedNo, name, mrn, sex, age, diagnosis };
}

/**
 * 提取表格结构
 */
function extractTableStructure(hostElement: HTMLElement): {
  colgroupHtml: string;
  theadHtml: string;
} {
  const table = hostElement.querySelector('.record-table');
  if (!table) {
    throw new Error('未找到护理记录表格');
  }

  const colgroup = table.querySelector('colgroup');
  const thead = table.querySelector('thead');

  return {
    colgroupHtml: colgroup?.outerHTML || '',
    theadHtml: thead?.outerHTML || '',
  };
}

/**
 * 提取业务块
 */
function extractBlocks(hostElement: HTMLElement): PrintBlock[] {
  const blocks: PrintBlock[] = [];

  // 查找所有带data-print-kind属性的tr
  const rows = hostElement.querySelectorAll('tr[data-print-kind]');
  const processedGroups = new Set<string>();

  rows.forEach(row => {
    const kind = row.getAttribute('data-print-kind');
    const groupKey = row.getAttribute('data-print-group') || '';

    // 时间组：只处理第一个tr，然后收集同组所有tr
    if (kind === 'time-group' && !processedGroups.has(groupKey)) {
      processedGroups.add(groupKey);

      // 收集同组所有tr
      const groupRows = Array.from(rows).filter(
        r => r.getAttribute('data-print-group') === groupKey
      );

      const html = groupRows.map(r => r.outerHTML).join('\n');
      blocks.push({
        kind: 'time-group',
        html,
        height: 0, // 后续测量
      });
    }

    // 总结行：直接作为独立块
    if (kind === 'summary' && !processedGroups.has(groupKey)) {
      processedGroups.add(groupKey);
      blocks.push({
        kind: 'summary',
        html: row.outerHTML,
        height: 0,
      });
    }
  });

  // 如果没有找到带属性的行，尝试从旧版表格提取
  if (blocks.length === 0) {
    const tbody = hostElement.querySelector('.record-table tbody');
    if (tbody) {
      // 提取所有非remark行
      const allRows = Array.from(tbody.querySelectorAll('tr'));
      const remarkRow = tbody.querySelector('.remark-row');

      const dataRows = allRows.filter(row => row !== remarkRow && !row.classList.contains('remark-row'));

      if (dataRows.length > 0) {
        // 按时间组分组
        let currentGroupKey = '';
        let currentGroupRows: HTMLElement[] = [];

        dataRows.forEach(row => {
          const timeCell = row.querySelector('.time-cell');
          const timeText = timeCell?.textContent?.trim() || '';

          if (timeText && !row.classList.contains('continuation-row')) {
            // 新的时间组
            if (currentGroupRows.length > 0) {
              blocks.push({
                kind: 'time-group',
                html: currentGroupRows.map(r => r.outerHTML).join('\n'),
                height: 0,
              });
            }
            currentGroupKey = `group-${Date.now()}-${Math.random()}`;
            currentGroupRows = [row];
          } else if (row.classList.contains('continuation-row')) {
            // 延续行
            currentGroupRows.push(row);
          } else if (row.classList.contains('summary-row')) {
            // 总结行
            if (currentGroupRows.length > 0) {
              blocks.push({
                kind: 'time-group',
                html: currentGroupRows.map(r => r.outerHTML).join('\n'),
                height: 0,
              });
              currentGroupRows = [];
            }
            blocks.push({
              kind: 'summary',
              html: row.outerHTML,
              height: 0,
            });
          }
        });

        // 处理最后一组
        if (currentGroupRows.length > 0) {
          blocks.push({
            kind: 'time-group',
            html: currentGroupRows.map(r => r.outerHTML).join('\n'),
            height: 0,
          });
        }
      }
    }
  }

  return blocks;
}

/**
 * 构建打印页面
 */
function buildPrintPages(
  doc: Document,
  patientInfo: ReturnType<typeof extractPatientInfo>,
  tableStructure: ReturnType<typeof extractTableStructure>,
  blocks: PrintBlock[],
  remarkLines: string[],
): HTMLElement[] {
  const pages: HTMLElement[] = [];

  // 创建测量容器
  const measureContainer = doc.createElement('div');
  measureContainer.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;';
  doc.body.appendChild(measureContainer);

  // 创建测量表格结构
  const measureTableHtml = `
    <table class="record-table">
      ${tableStructure.colgroupHtml}
      ${tableStructure.theadHtml}
      <tbody id="measure-tbody"></tbody>
    </table>
  `;

  // 计算可用高度
  const availableHeight = A4_HEIGHT_MM - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM
    - HEADER_HEIGHT_MM - REMARKS_HEIGHT_MM - PAGENO_HEIGHT_MM;
  const availableHeightPx = mmToPx(availableHeight);

  // 逐块分页
  let currentPage = createEmptyPage(doc, patientInfo, tableStructure, remarkLines);
  let currentHeight = 0;
  let measureTbody = currentPage.querySelector('#measure-tbody') as HTMLElement;

  for (const block of blocks) {
    // 测量块高度
    const blockHeight = measureBlockHeight(doc, measureContainer, measureTableHtml, block);

    // 检查是否需要新页
    if (currentHeight + blockHeight > availableHeightPx && currentHeight > 0) {
      // 当前页结束，创建新页
      pages.push(currentPage);
      currentPage = createEmptyPage(doc, patientInfo, tableStructure, remarkLines);
      currentHeight = 0;
      measureTbody = currentPage.querySelector('#measure-tbody') as HTMLElement;
    }

    // 添加块到当前页
    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = `<table class="record-table">${tableStructure.colgroupHtml}${tableStructure.theadHtml}<tbody>${block.html}</tbody></table>`;
    const tbody = tempDiv.querySelector('tbody');
    if (tbody) {
      Array.from(tbody.children).forEach(tr => {
        measureTbody.appendChild(tr.cloneNode(true));
      });
    }

    currentHeight += blockHeight;
  }

  // 添加最后一页
  pages.push(currentPage);

  // 清理测量容器
  doc.body.removeChild(measureContainer);

  // 添加所有页面到文档
  pages.forEach(page => doc.body.appendChild(page));

  return pages;
}

/**
 * 创建空页面
 */
function createEmptyPage(
  doc: Document,
  patientInfo: ReturnType<typeof extractPatientInfo>,
  tableStructure: ReturnType<typeof extractTableStructure>,
  remarkLines: string[],
): HTMLElement {
  const page = doc.createElement('section');
  page.className = 'print-page';

  const remarksHtml = remarkLines
    .map(line => `<div class="remark-line">${escapeHtml(line)}</div>`)
    .join('');

  page.innerHTML = `
    <article class="sheet">
      <header class="sheet-head">
        <h1 class="sheet-title">${escapeHtml(patientInfo.title)}</h1>
        <div class="patient-info">
          <span>床号：<b>${escapeHtml(patientInfo.bedNo || '—')}</b></span>
          <span>姓名：<b>${escapeHtml(patientInfo.name || '—')}</b></span>
          <span>住院号：<b>${escapeHtml(patientInfo.mrn || '—')}</b></span>
          <span>性别：<b>${escapeHtml(patientInfo.sex || '—')}</b></span>
          <span>年龄：<b>${escapeHtml(patientInfo.age || '—')}</b></span>
          <span>诊断：<b>${escapeHtml(patientInfo.diagnosis || '—')}</b></span>
        </div>
      </header>

      <main class="sheet-content">
        <table class="record-table">
          ${tableStructure.colgroupHtml}
          ${tableStructure.theadHtml}
          <tbody id="measure-tbody"></tbody>
        </table>
      </main>

      <section class="sheet-remarks">
        <div class="remarks-label">备注</div>
        <div class="remarks-content">${remarksHtml}</div>
      </section>

      <footer class="sheet-pageno">
        第<span class="page-current"></span>页 共<span class="page-total"></span>页
      </footer>
    </article>
  `;

  return page;
}

/**
 * 测量业务块高度
 */
function measureBlockHeight(
  doc: Document,
  container: HTMLElement,
  tableHtml: string,
  block: PrintBlock,
): number {
  container.innerHTML = tableHtml;
  const tbody = container.querySelector('#measure-tbody') as HTMLElement;
  if (!tbody) return 0;

  // 添加块内容
  const tempDiv = doc.createElement('div');
  tempDiv.innerHTML = `<table class="record-table"><tbody>${block.html}</tbody></table>`;
  const sourceTbody = tempDiv.querySelector('tbody');
  if (sourceTbody) {
    Array.from(sourceTbody.children).forEach(tr => {
      tbody.appendChild(tr.cloneNode(true));
    });
  }

  // 测量高度
  const table = container.querySelector('.record-table');
  if (!table) return 0;

  return (table as HTMLElement).scrollHeight;
}

/**
 * 更新页码
 */
function updatePageNumbers(pages: HTMLElement[]): void {
  const totalPages = pages.length;

  pages.forEach((page, index) => {
    const current = page.querySelector('.page-current');
    const total = page.querySelector('.page-total');

    if (current) {
      current.textContent = String(index + 1);
    }
    if (total) {
      total.textContent = String(totalPages);
    }
  });
}

/**
 * 毫米转像素
 */
function mmToPx(mm: number): number {
  // 96dpi时，1mm ≈ 3.78px
  return mm * 3.78;
}

/**
 * HTML转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
