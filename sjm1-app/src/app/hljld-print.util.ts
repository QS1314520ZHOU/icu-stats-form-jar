/**
 * 护理记录单打印分页工具 v2
 *
 * A4横向精确分页，每页一个完整<table>：
 * - <thead> 固定表头
 * - <tbody> 当前页数据 + 填充行
 * - <tfoot> 备注行（colspan=16）
 *
 * 使用真实DOM高度测量，支持长文本跨页续打。
 */

import { openPrintWindow, readyPrint } from './form-print.util';

// ==================== 常量 ====================

const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;

const PAGE_PADDING_TOP_MM = 4;
const PAGE_PADDING_BOTTOM_MM = 3;
const PAGE_PADDING_LEFT_MM = 7;
const PAGE_PADDING_RIGHT_MM = 7;

const SAFETY_GAP_PX = 2;

const PRINT_FONT_SIZE_PT = 7.5;
const PRINT_LINE_HEIGHT_PT = 9;
const PRINT_HEADER_FONT_PT = 22;
const PRINT_PAGENO_FONT_PT = 8;

const COL_COUNT = 17;

// ==================== 接口 ====================

export interface HljldPrintConfig {
  hostElement: HTMLElement;
  remarkLines: string[];
}

interface PrintBlock {
  key: string;
  kind: 'time-group' | 'summary';
  rows: HTMLTableRowElement[];
  splittable: boolean;
}

interface PatientInfo {
  title: string;
  bedNo: string;
  name: string;
  mrn: string;
  sex: string;
  age: string;
  diagnosis: string;
}

interface TableStructure {
  colgroupHtml: string;
  theadHtml: string;
}

interface PageElements {
  sheet: HTMLElement;
  thead: HTMLElement;
  tbody: HTMLElement;
  tfoot: HTMLElement;
  pageno: HTMLElement;
}

// ==================== CSS ====================

const PRINT_CSS = `
@page { size: A4 landscape; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { color: #000; font-family: 'SimSun', '宋体', serif; }

.print-page {
  box-sizing: border-box;
  width: ${A4_WIDTH_MM}mm;
  height: ${A4_HEIGHT_MM}mm;
  margin: 0;
  padding: 0;
  overflow: visible;
  break-after: page;
  page-break-after: always;
  background: #fff;
}
.print-page:last-child {
  break-after: auto;
  page-break-after: auto;
}

.sheet {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: ${A4_WIDTH_MM}mm;
  height: ${A4_HEIGHT_MM}mm;
  padding: ${PAGE_PADDING_TOP_MM}mm ${PAGE_PADDING_RIGHT_MM}mm ${PAGE_PADDING_BOTTOM_MM}mm ${PAGE_PADDING_LEFT_MM}mm;
  overflow: visible;
  background: #fff;
  color: #000;
}

.sheet-head {
  text-align: center;
  padding-bottom: 1.5mm;
}

.sheet-title {
  font-family: 'SimHei', '黑体', sans-serif;
  font-weight: 700;
  font-size: ${PRINT_HEADER_FONT_PT}pt;
  line-height: 1.35;
  margin: 0 0 1.5mm;
  letter-spacing: 2px;
}

.patient-info {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1.5mm 5mm;
  font-family: 'SimSun', '宋体', serif;
  font-size: ${PRINT_FONT_SIZE_PT}pt;
  font-weight: 400;
  line-height: 1.4;
  color: #000;
}

.patient-info b { font-weight: 700; }

.print-table-slot {
  min-height: 0;
  overflow: visible;
}

.print-record-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid #000;
}

.print-record-table th,
.print-record-table td {
  box-sizing: border-box;
  border: 1px solid #000;
  overflow: visible;
  text-overflow: clip;
  word-break: break-word;
  overflow-wrap: anywhere;
  vertical-align: middle;
  padding: 0.4mm 0.5mm;
  font-family: 'SimSun', '宋体', serif;
  font-size: ${PRINT_FONT_SIZE_PT}pt;
  line-height: ${PRINT_LINE_HEIGHT_PT}pt;
  color: #000;
}

.print-record-table thead th {
  background: #e5edf2;
  font-weight: 600;
}

.print-record-table thead {
  display: table-header-group;
}

.print-record-table tfoot {
  display: table-footer-group;
}

.print-filler-row td {
  height: var(--filler-height, 0);
  padding: 0;
  border-top: 0;
  border-bottom: 0;
  border-left: 1px solid #000;
  border-right: 1px solid #000;
}

.print-remark-row {
  break-inside: avoid;
  page-break-inside: avoid;
}

.print-remark-row th {
  font-weight: 500;
  text-align: center;
  width: 16mm;
}

.print-remark-row td {
  text-align: left;
  padding: 0.5mm 1mm;
}

.remark-line + .remark-line {
  margin-top: 0.3mm;
}

.sheet-pageno {
  padding-top: 1.5mm;
  text-align: center;
  font-family: 'SimSun', '宋体', serif;
  font-size: ${PRINT_PAGENO_FONT_PT}pt;
  line-height: 1.2;
  color: #000;
}

.nursing-cell {
  text-align: left !important;
}

.continuation-row .time-cell,
.continuation-row .sign-cell {
  color: transparent;
}

.no-print { display: none !important; }
`;

// ==================== 主入口 ====================

export async function printHljldRecord(config: HljldPrintConfig): Promise<void> {
  const { hostElement, remarkLines } = config;

  const patientInfo = extractPatientInfo(hostElement);
  const tableStructure = extractTableStructure(hostElement);
  const blocks = extractBlocks(hostElement);

  if (blocks.length === 0) {
    throw new Error('无可打印的护理记录数据');
  }

  const printWin = openPrintWindow('', PRINT_CSS);
  if (!printWin) {
    throw new Error('打印窗口被拦截，请允许弹出窗口');
  }

  const doc = printWin.document;
  try {
    if ((doc as any).fonts?.ready) {
      await (doc as any).fonts.ready;
    }
  } catch { /* 字体加载失败继续 */ }

  const pages = buildAllPages(doc, patientInfo, tableStructure, blocks, remarkLines);
  updatePageNumbers(pages);

  const isValid = validatePrintPages(printWin, pages);
  if (!isValid) {
    console.error('[HLJLD][print] 打印分页校验失败');
    printWin.close();
    throw new Error('打印分页校验失败，存在未完整显示的护理记录');
  }

  readyPrint(printWin, () => {
    try { printWin.print(); }
    catch (e) { console.error('[HLJLD][print] 打印执行失败', e); }
  });
}

// ==================== 提取患者信息 ====================

function extractPatientInfo(host: HTMLElement): PatientInfo {
  const titleEl = host.querySelector('h1');
  const title = titleEl?.textContent?.trim() || '重钢总医院重症医学科护理记录单';

  const strip = host.querySelector('.patient-strip');
  const spans = strip?.querySelectorAll('span') || [];

  const info: PatientInfo = { title, bedNo: '', name: '', mrn: '', sex: '', age: '', diagnosis: '' };

  spans.forEach(span => {
    const t = span.textContent || '';
    if (t.startsWith('床号：')) info.bedNo = t.slice(4).trim();
    else if (t.startsWith('姓名：')) info.name = t.slice(4).trim();
    else if (t.startsWith('住院号：')) info.mrn = t.slice(5).trim();
    else if (t.startsWith('性别：')) info.sex = t.slice(4).trim();
    else if (t.startsWith('年龄：')) info.age = t.slice(4).trim();
    else if (t.startsWith('诊断：')) info.diagnosis = t.slice(4).trim();
  });

  return info;
}

// ==================== 提取表格结构 ====================

function extractTableStructure(host: HTMLElement): TableStructure {
  const table = host.querySelector('.record-table');
  if (!table) throw new Error('未找到护理记录表格');

  const colgroup = table.querySelector('colgroup');
  const thead = table.querySelector('thead');

  return {
    colgroupHtml: colgroup?.outerHTML || '',
    theadHtml: thead?.outerHTML || '',
  };
}

// ==================== 提取业务块 ====================

function extractBlocks(host: HTMLElement): PrintBlock[] {
  const blocks: PrintBlock[] = [];
  const rows = host.querySelectorAll('tr[data-print-kind]');
  const processed = new Set<string>();

  rows.forEach(row => {
    const kind = row.getAttribute('data-print-kind') as string;
    const groupKey = row.getAttribute('data-print-group') || '';

    if (processed.has(groupKey) && kind === 'time-group') return;
    if (kind === 'time-group') {
      processed.add(groupKey);
      const groupRows = Array.from(rows).filter(
        r => r.getAttribute('data-print-group') === groupKey
      ) as HTMLTableRowElement[];
      blocks.push({ key: groupKey, kind: 'time-group', rows: groupRows, splittable: true });
    }

    if (kind === 'summary') {
      processed.add(groupKey);
      blocks.push({ key: groupKey, kind: 'summary', rows: [row as HTMLTableRowElement], splittable: false });
    }
  });

  // 兼容旧版：无 data-print-kind 属性
  if (blocks.length === 0) {
    const tbody = host.querySelector('.record-table tbody');
    if (tbody) {
      const allRows = Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[];
      let currentKey = '';
      let currentRows: HTMLTableRowElement[] = [];

      allRows.forEach(row => {
        if (row.classList.contains('remark-row')) return;

        if (row.classList.contains('summary-row')) {
          if (currentRows.length > 0) {
            blocks.push({ key: currentKey, kind: 'time-group', rows: currentRows, splittable: true });
            currentRows = [];
          }
          blocks.push({ key: `summary-${blocks.length}`, kind: 'summary', rows: [row], splittable: false });
          return;
        }

        const timeCell = row.querySelector('.time-cell');
        const timeText = timeCell?.textContent?.trim() || '';

        if (timeText && !row.classList.contains('continuation-row')) {
          if (currentRows.length > 0) {
            blocks.push({ key: currentKey, kind: 'time-group', rows: currentRows, splittable: true });
          }
          currentKey = `group-${blocks.length}`;
          currentRows = [row];
        } else {
          currentRows.push(row);
        }
      });

      if (currentRows.length > 0) {
        blocks.push({ key: currentKey, kind: 'time-group', rows: currentRows, splittable: true });
      }
    }
  }

  return blocks;
}

// ==================== 构建所有页面 ====================

function buildAllPages(
  doc: Document,
  patientInfo: PatientInfo,
  tableStructure: TableStructure,
  blocks: PrintBlock[],
  remarkLines: string[],
): PageElements[] {
  const pages: PageElements[] = [];

  // 创建离屏测量容器
  const measureSlot = doc.createElement('div');
  measureSlot.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;';
  doc.body.appendChild(measureSlot);

  // 创建第一页
  let currentPage = createPage(doc, patientInfo, tableStructure, remarkLines);
  doc.body.appendChild(currentPage.sheet);
  pages.push(currentPage);

  // 测量固定区域高度
  const fixedHeight = measureFixedAreas(currentPage);
  const bodyAvailableHeight = fixedHeight.bodyAvailable;

  // 逐块分页
  let currentBodyHeight = 0;

  for (const block of blocks) {
    if (block.kind === 'summary') {
      // 总结块：不可拆分
      const blockHeight = measureBlockHeight(doc, measureSlot, tableStructure, block);

      if (currentBodyHeight + blockHeight > bodyAvailableHeight && currentBodyHeight > 0) {
        // 当前页放不下，添加填充行后换页
        addFillerRow(currentPage.tbody, bodyAvailableHeight - currentBodyHeight);
        currentPage = createPage(doc, patientInfo, tableStructure, remarkLines);
        doc.body.appendChild(currentPage.sheet);
        pages.push(currentPage);
        currentBodyHeight = 0;
      }

      // 检查总结本身是否超长
      if (blockHeight > bodyAvailableHeight) {
        console.warn(`[HLJLD][print] 总结块 ${block.key} 高度 ${blockHeight}px 超过可用高度 ${bodyAvailableHeight}px`);
      }

      appendBlockToTbody(currentPage.tbody, block);
      currentBodyHeight += blockHeight;

    } else {
      // 时间组：逐行处理
      for (const tr of block.rows) {
        const trHeight = measureRowHeight(doc, measureSlot, tableStructure, tr);

        if (trHeight <= bodyAvailableHeight) {
          // 整行能放入当前页
          if (currentBodyHeight + trHeight > bodyAvailableHeight && currentBodyHeight > 0) {
            addFillerRow(currentPage.tbody, bodyAvailableHeight - currentBodyHeight);
            currentPage = createPage(doc, patientInfo, tableStructure, remarkLines);
            doc.body.appendChild(currentPage.sheet);
            pages.push(currentPage);
            currentBodyHeight = 0;
          }
          currentPage.tbody.appendChild(tr.cloneNode(true));
          currentBodyHeight += trHeight;
        } else {
          // 单行超长，需要拆分
          if (currentBodyHeight > 0) {
            addFillerRow(currentPage.tbody, bodyAvailableHeight - currentBodyHeight);
            currentPage = createPage(doc, patientInfo, tableStructure, remarkLines);
            doc.body.appendChild(currentPage.sheet);
            pages.push(currentPage);
            currentBodyHeight = 0;
          }

          const fragments = splitOversizedRow(doc, measureSlot, tableStructure, tr, bodyAvailableHeight);
          for (let i = 0; i < fragments.length; i++) {
            if (i > 0) {
              // 新 fragment 需要新页
              currentPage = createPage(doc, patientInfo, tableStructure, remarkLines);
              doc.body.appendChild(currentPage.sheet);
              pages.push(currentPage);
              currentBodyHeight = 0;
            }
            currentPage.tbody.appendChild(fragments[i]);
            currentBodyHeight += measureRowHeight(doc, measureSlot, tableStructure, fragments[i]);
          }
        }
      }
    }
  }

  // 最后一页添加填充行
  if (currentBodyHeight < bodyAvailableHeight) {
    addFillerRow(currentPage.tbody, bodyAvailableHeight - currentBodyHeight);
  }

  // 清理测量容器
  doc.body.removeChild(measureSlot);

  return pages;
}

// ==================== 创建单页 ====================

function createPage(
  doc: Document,
  patientInfo: PatientInfo,
  tableStructure: TableStructure,
  remarkLines: string[],
): PageElements {
  const sheet = doc.createElement('section');
  sheet.className = 'print-page';

  const remarksHtml = remarkLines
    .map(line => `<div class="remark-line">${escapeHtml(line)}</div>`)
    .join('');

  sheet.innerHTML = `
    <article class="sheet">
      <header class="sheet-head">
        <div class="sheet-title">${escapeHtml(patientInfo.title)}</div>
        <div class="patient-info">
          <span>床号：<b>${escapeHtml(patientInfo.bedNo || '—')}</b></span>
          <span>姓名：<b>${escapeHtml(patientInfo.name || '—')}</b></span>
          <span>住院号：<b>${escapeHtml(patientInfo.mrn || '—')}</b></span>
          <span>性别：<b>${escapeHtml(patientInfo.sex || '—')}</b></span>
          <span>年龄：<b>${escapeHtml(patientInfo.age || '—')}</b></span>
          <span>诊断：<b>${escapeHtml(patientInfo.diagnosis || '—')}</b></span>
        </div>
      </header>

      <div class="print-table-slot">
        <table class="print-record-table">
          ${tableStructure.colgroupHtml}
          ${tableStructure.theadHtml}
          <tbody></tbody>
          <tfoot>
            <tr class="print-remark-row">
              <th>备注</th>
              <td colspan="${COL_COUNT - 1}">${remarksHtml}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer class="sheet-pageno">
        第<span class="page-current"></span>页 共<span class="page-total"></span>页
      </footer>
    </article>
  `;

  const article = sheet.querySelector('.sheet') as HTMLElement;
  const thead = article.querySelector('thead') as HTMLElement;
  const tbody = article.querySelector('tbody') as HTMLElement;
  const tfoot = article.querySelector('tfoot') as HTMLElement;
  const pageno = article.querySelector('.sheet-pageno') as HTMLElement;

  return { sheet, thead, tbody, tfoot, pageno };
}

// ==================== 测量固定区域 ====================

function measureFixedAreas(page: PageElements): { bodyAvailable: number } {
  const sheetRect = page.sheet.getBoundingClientRect();
  const article = page.sheet.querySelector('.sheet')!;
  const articleStyle = getComputedStyle(article);
  const headEl = page.sheet.querySelector('.sheet-head')!;
  const headRect = headEl.getBoundingClientRect();
  const footerRect = page.pageno.getBoundingClientRect();
  const theadRect = page.thead.getBoundingClientRect();
  const tfootRect = page.tfoot.getBoundingClientRect();

  const paddingTop = parseFloat(articleStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(articleStyle.paddingBottom) || 0;
  const pageVerticalPadding = paddingTop + paddingBottom;

  const bodyAvailable = sheetRect.height
    - pageVerticalPadding
    - headRect.height
    - footerRect.height
    - theadRect.height
    - tfootRect.height
    - SAFETY_GAP_PX;

  return { bodyAvailable: Math.max(0, bodyAvailable) };
}

// ==================== 测量块高度 ====================

function measureBlockHeight(
  doc: Document,
  container: HTMLElement,
  tableStructure: TableStructure,
  block: PrintBlock,
): number {
  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;';
  wrapper.innerHTML = `
    <table class="print-record-table">
      ${tableStructure.colgroupHtml}
      ${tableStructure.theadHtml}
      <tbody></tbody>
      <tfoot><tr><th>备注</th><td colspan="16"></td></tr></tfoot>
    </table>
  `;
  container.appendChild(wrapper);

  const tbody = wrapper.querySelector('tbody')!;
  block.rows.forEach(tr => tbody.appendChild(tr.cloneNode(true)));

  const table = wrapper.querySelector('.print-record-table') as HTMLElement;
  const height = table.offsetHeight;

  container.removeChild(wrapper);
  return height;
}

// ==================== 测量单行高度 ====================

function measureRowHeight(
  doc: Document,
  container: HTMLElement,
  tableStructure: TableStructure,
  tr: HTMLTableRowElement,
): number {
  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;';
  wrapper.innerHTML = `
    <table class="print-record-table">
      ${tableStructure.colgroupHtml}
      ${tableStructure.theadHtml}
      <tbody></tbody>
      <tfoot><tr><th>备注</th><td colspan="16"></td></tr></tfoot>
    </table>
  `;
  container.appendChild(wrapper);

  const tbody = wrapper.querySelector('tbody')!;
  tbody.appendChild(tr.cloneNode(true));

  const row = tbody.querySelector('tr') as HTMLElement;
  const height = row.offsetHeight;

  container.removeChild(wrapper);
  return height;
}

// ==================== 添加填充行 ====================

function addFillerRow(tbody: HTMLElement, fillerHeight: number): void {
  if (fillerHeight <= 0) return;

  const tr = tbody.ownerDocument!.createElement('tr');
  tr.className = 'print-filler-row';
  tr.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < COL_COUNT; i++) {
    const td = tbody.ownerDocument!.createElement('td');
    tr.appendChild(td);
  }

  tr.style.setProperty('--filler-height', `${fillerHeight}px`);
  tbody.appendChild(tr);
}

// ==================== 追加块到 tbody ====================

function appendBlockToTbody(tbody: HTMLElement, block: PrintBlock): void {
  block.rows.forEach(tr => {
    tbody.appendChild(tr.cloneNode(true));
  });
}

// ==================== 长文本拆分 ====================

function splitOversizedRow(
  doc: Document,
  container: HTMLElement,
  tableStructure: TableStructure,
  originalRow: HTMLTableRowElement,
  availableHeight: number,
): HTMLTableRowElement[] {
  const fragments: HTMLTableRowElement[] = [];
  const nursingCell = originalRow.querySelector('.nursing-cell') as HTMLTableCellElement | null;

  if (!nursingCell) {
    // 没有护理记录单元格，直接返回原行
    fragments.push(originalRow.cloneNode(true) as HTMLTableRowElement);
    return fragments;
  }

  const fullText = nursingCell.textContent || '';
  if (!fullText.trim()) {
    fragments.push(originalRow.cloneNode(true) as HTMLTableRowElement);
    return fragments;
  }

  let remaining = fullText;
  let isFirst = true;

  while (remaining.length > 0) {
    const fitLength = findMaxFittingText(
      doc, container, tableStructure, originalRow, nursingCell, remaining, availableHeight
    );

    // 确保至少消费一个字符
    const cutAt = Math.max(1, fitLength);
    const textForThisPage = remaining.slice(0, cutAt);
    remaining = remaining.slice(cutAt);

    const fragment = createFragmentRow(
      doc, originalRow, nursingCell, textForThisPage, !isFirst, remaining.length === 0
    );
    fragments.push(fragment);
    isFirst = false;
  }

  return fragments;
}

// ==================== 二分查找最大适应文本 ====================

function findMaxFittingText(
  doc: Document,
  container: HTMLElement,
  tableStructure: TableStructure,
  rowTemplate: HTMLTableRowElement,
  nursingCell: HTMLTableCellElement,
  fullText: string,
  availableHeight: number,
): number {
  let low = 1;
  let high = fullText.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = rowTemplate.cloneNode(true) as HTMLTableRowElement;
    const candidateCell = candidate.querySelector('.nursing-cell') as HTMLTableCellElement;
    if (candidateCell) {
      candidateCell.textContent = fullText.slice(0, mid);
    }

    const wrapper = doc.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;';
    wrapper.innerHTML = `
      <table class="print-record-table">
        ${tableStructure.colgroupHtml}
        ${tableStructure.theadHtml}
        <tbody></tbody>
        <tfoot><tr><th>备注</th><td colspan="16"></td></tr></tfoot>
      </table>
    `;
    container.appendChild(wrapper);
    const tbody = wrapper.querySelector('tbody')!;
    tbody.appendChild(candidate);
    const row = tbody.querySelector('tr') as HTMLElement;
    const height = row.offsetHeight;
    container.removeChild(wrapper);

    if (height <= availableHeight + 0.5) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // 优先在自然断点处切割
  return moveToNaturalBreak(fullText, best);
}

// ==================== 移动到自然断点 ====================

function moveToNaturalBreak(text: string, position: number): number {
  if (position >= text.length) return text.length;
  if (position <= 0) return 1;

  // 向前搜索自然断点（中文标点、换行、空格）
  const breakChars = ['。', '；', '，', '、', '\n', ' '];
  const searchRange = Math.min(20, position);

  for (let i = 0; i < searchRange; i++) {
    const checkPos = position - i;
    if (checkPos > 0 && breakChars.includes(text[checkPos - 1])) {
      return checkPos;
    }
  }

  return position;
}

// ==================== 创建分片行 ====================

function createFragmentRow(
  doc: Document,
  originalRow: HTMLTableRowElement,
  nursingCell: HTMLTableCellElement,
  text: string,
  isContinuation: boolean,
  isLast: boolean,
): HTMLTableRowElement {
  const fragment = originalRow.cloneNode(true) as HTMLTableRowElement;

  if (isContinuation) {
    fragment.classList.add('continuation-row');
    // 清空日期时间和签名列
    const timeCell = fragment.querySelector('.time-cell');
    if (timeCell) timeCell.textContent = '';
    const signCell = fragment.querySelector('.sign-cell');
    if (signCell) signCell.textContent = '';
  }

  // 设置护理记录文本
  const fragNursingCell = fragment.querySelector('.nursing-cell') as HTMLTableCellElement;
  if (fragNursingCell) {
    fragNursingCell.textContent = text;
  }

  // 签名只放最后一个 fragment
  if (!isLast) {
    const signCell = fragment.querySelector('.sign-cell');
    if (signCell) signCell.textContent = '';
  }

  return fragment;
}

// ==================== 更新页码 ====================

function updatePageNumbers(pages: PageElements[]): void {
  const total = pages.length;
  pages.forEach((page, i) => {
    const current = page.pageno.querySelector('.page-current');
    const totalEl = page.pageno.querySelector('.page-total');
    if (current) current.textContent = String(i + 1);
    if (totalEl) totalEl.textContent = String(total);
  });
}

// ==================== 增强验证 ====================

function validatePrintPages(printWin: Window, pages: PageElements[]): boolean {
  const doc = printWin.document;
  let valid = true;

  // 1. 检查页数
  const printPages = doc.querySelectorAll('.print-page');
  if (printPages.length !== pages.length) {
    console.error(`[HLJLD][validate] 页数不匹配: DOM ${printPages.length} vs pages ${pages.length}`);
    valid = false;
  }

  pages.forEach((page, index) => {
    const pageNum = index + 1;

    // 2. 检查 sheet 是否超出 A4
    const sheet = page.sheet.querySelector('.sheet') as HTMLElement;
    if (sheet) {
      const sheetRect = sheet.getBoundingClientRect();
      const a4HeightPx = 210 * 3.78;
      if (sheetRect.height > a4HeightPx + 5) {
        console.error(`[HLJLD][validate] 第${pageNum}页 sheet 高度 ${sheetRect.height.toFixed(1)}px 超出 A4 ${a4HeightPx.toFixed(1)}px`);
        valid = false;
      }
    }

    // 3. 检查表格是否超出 table-slot
    const tableSlot = page.sheet.querySelector('.print-table-slot') as HTMLElement;
    const table = page.sheet.querySelector('.print-record-table') as HTMLElement;
    if (tableSlot && table) {
      if (table.scrollHeight > table.clientHeight + 2) {
        console.error(`[HLJLD][validate] 第${pageNum}页 表格溢出 scrollHeight ${table.scrollHeight} > clientHeight ${table.clientHeight}`);
        valid = false;
      }
    }

    // 4. 检查每个 td 是否被裁剪
    const cells = page.tbody.querySelectorAll('td');
    cells.forEach((td, cellIndex) => {
      const tdEl = td as HTMLElement;
      if (tdEl.scrollHeight > tdEl.clientHeight + 1) {
        console.error(`[HLJLD][validate] 第${pageNum}页 td#${cellIndex} 被裁剪 scrollHeight ${tdEl.scrollHeight} > clientHeight ${tdEl.clientHeight}`);
        valid = false;
      }
    });

    // 5. 检查页码
    const pageCurrent = page.pageno.querySelector('.page-current');
    const pageTotal = page.pageno.querySelector('.page-total');
    if (!pageCurrent?.textContent || !pageTotal?.textContent) {
      console.error(`[HLJLD][validate] 第${pageNum}页 缺少页码`);
      valid = false;
    }

    // 6. 检查每页有 thead
    if (!page.thead) {
      console.error(`[HLJLD][validate] 第${pageNum}页 缺少 thead`);
      valid = false;
    }

    // 7. 检查每页有 tfoot 备注
    if (!page.tfoot) {
      console.error(`[HLJLD][validate] 第${pageNum}页 缺少 tfoot`);
      valid = false;
    }
  });

  return valid;
}

// ==================== 工具函数 ====================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
