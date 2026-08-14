import {
  HljldDisplayRow,
  HljldSummary,
  HljldTimelineItem,
  HljldViewModel,
} from './hljld-form.models';

type PrintInput = {
  vm: HljldViewModel;
  remarkLines: string[];
};

type SummaryPrintBlock = {
  kind: 'summary';
  key: string;
  timestamp: number;
  summaryClassName: string;
  summary: HljldSummary;
};

type PrintBlock =
  | {
      kind: 'time-group';
      key: string;
      timestamp: number;
      rows: HljldDisplayRow[];
    }
  | SummaryPrintBlock;

type NarrativeField =
  | 'nursingRecord'
  | 'healthEducation'
  | 'basicCare'
  | 'treatment'
  | 'examination';

type NarrativeSegment = {
  field: NarrativeField;
  text: string;
};

const NARRATIVE_FIELD_ORDER: NarrativeField[] = [
  'nursingRecord',
  'healthEducation',
  'basicCare',
  'treatment',
  'examination',
];

type PageRefs = {
  pageEl: HTMLElement;
  sheetEl: HTMLElement;
  headEl: HTMLElement;
  titleEl: HTMLElement;
  patientInfoEl: HTMLElement;
  tableWrapEl: HTMLElement;
  tableEl: HTMLTableElement;
  tbodyEl: HTMLTableSectionElement;
  tfootEl: HTMLTableSectionElement;
  pageNoEl: HTMLElement;
};

const PRINT_CSS = `
@page {
  size: A4 landscape;
  margin: 0;
}

html, body {
  margin: 0;
  padding: 0;
  background: #fff;
}

body {
  color: #000;
  font-family: "SimSun", "宋体", serif;
}

.print-root {
  margin: 0;
  padding: 0;
}

.print-page {
  box-sizing: border-box;
  width: 297mm;
  height: 210mm;
  margin: 0;
  padding: 0;
  break-after: page;
  page-break-after: always;
  overflow: hidden;
  background: #fff;
}

.print-page:last-child {
  break-after: auto;
  page-break-after: auto;
}

.sheet {
  position: relative;
  box-sizing: border-box;
  width: 297mm;
  height: 210mm;
  padding: 4mm 7mm 58px;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background: #fff;
}

.sheet-head {
  display: block;
  text-align: initial;
  color: #000;
}

.title-line {
  text-align: center;
  font-family: "SimHei", "黑体", "Microsoft YaHei", sans-serif;
  font-size: 22pt;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 1px;
  margin: 0 0 2mm 0;
}

.patient-info-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 1mm 6mm;
  text-align: left;
  white-space: normal;
  font-family: "SimSun", "宋体", serif;
  font-size: 12pt;
  font-weight: 400;
  line-height: 1.4;
  color: #000;
  margin: 0 0 1.5mm 0;
}

.info-item,
.diagnosis-item {
  text-align: left;
  white-space: nowrap;
  color: #000;
}

.diagnosis-item {
  flex: 1 1 auto;
  min-width: 0;
}

.info-item strong,
.diagnosis-item strong {
  font-weight: 700;
}

.print-table-wrap {
  min-height: 0;
  overflow: hidden;
}

.print-record-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
  border: 1px solid #000;
  color: #000;
  background: #fff;
  font-family: "SimSun", "宋体", serif;
  font-size: 7.2pt;
  line-height: 1.25;
}

.print-record-table col.col-time { width: 8%; }
.print-record-table col.col-med-name,
.print-record-table col.col-enteral-name { width: 6%; }
.print-record-table col.col-med-amount,
.print-record-table col.col-enteral-amount { width: 4%; }
.print-record-table col.col-med-route,
.print-record-table col.col-enteral-route { width: 4%; }
.print-record-table col.col-output-name,
.print-record-table col.col-drain-name { width: 6%; }
.print-record-table col.col-output-amount,
.print-record-table col.col-drain-amount { width: 4%; }
.print-record-table col.col-check,
.print-record-table col.col-treatment,
.print-record-table col.col-basic-care,
.print-record-table col.col-health { width: 5%; }
.print-record-table col.col-nursing { width: 18%; }
.print-record-table col.col-sign { width: 6%; }

.print-record-table th,
.print-record-table td {
  border: 1px solid #000;
  padding: 0.6mm 0.8mm;
  text-align: center;
  vertical-align: middle;
  color: #000;
  box-sizing: border-box;
  overflow: visible;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.print-record-table thead th {
  background: #fff;
  font-weight: 700;
  line-height: 1.2;
}

.print-record-table thead tr:first-child th {
  padding-top: 0.8mm;
  padding-bottom: 0.8mm;
}

.print-record-table tbody td.nursing-cell {
  text-align: left;
  vertical-align: top;
}

.print-record-table tbody td.sign-cell {
  white-space: nowrap;
}

.print-record-table tbody tr.continuation-row td.time-cell {
  color: transparent;
}

.print-summary-row td {
  padding: 0 !important;
  text-align: left !important;
}

.print-summary-panel {
  width: 100%;
  box-sizing: border-box;
  padding: 1mm 1.5mm;
  text-align: left !important;
  color: #000;
}

.print-summary-day .print-summary-panel {
  background: #f7f3df;
}

.print-summary-shift .print-summary-panel {
  background: #f4f1e3;
}

.print-summary-24h .print-summary-panel {
  background: #edf6ee;
}

.print-summary-discharge .print-summary-panel {
  background: #e8f0fe;
}

.print-summary-title-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2mm;
  margin-bottom: 0.6mm;
  text-align: center !important;
}

.print-summary-title {
  font-weight: 700;
  font-size: 8pt;
}

.print-summary-period {
  font-size: 7pt;
}

.print-summary-line {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  line-height: 1.35;
  font-size: 7pt;
  text-align: left !important;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.print-summary-line + .print-summary-line {
  margin-top: 0.4mm;
}

.print-summary-strong {
  font-weight: 700;
}

.print-filler-row td {
  padding: 0 !important;
  line-height: 0;
  font-size: 0;
  vertical-align: top;
  background: #fff;
}

.print-record-table tfoot th,
.print-record-table tfoot td {
  font-size: 6.8pt;
  line-height: 1.25;
  text-align: left;
  vertical-align: top;
  padding: 0.8mm 1mm;
}

.print-record-table tfoot th {
  width: 8%;
  text-align: center;
  font-weight: 700;
}

.print-remark-lines {
  display: block;
}

.print-remark-line + .print-remark-line {
  margin-top: 0.3mm;
}

.sheet-pageno {
  box-sizing: border-box;
  position: absolute;
  right: 0;
  bottom: 35px;
  left: 0;
  width: auto;
  margin: 0;
  padding: 0;
  text-align: center;
  font-family: "SimSun", "宋体", serif;
  font-size: 8pt;
  line-height: 10pt;
  color: #000;
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
}
`;

export async function printHljldRecord({
  vm,
  remarkLines,
}: PrintInput): Promise<void> {
  const printWindow = window.open('', '_blank', 'width=1400,height=960');

  if (!printWindow) {
    throw new Error('打印窗口被拦截，请允许浏览器弹出打印窗口。');
  }

  try {
    printWindow.document.open();
    printWindow.document.write(`
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>护理记录打印</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div id="print-root" class="print-root"></div>
</body>
</html>
    `);
    printWindow.document.close();

    await waitForPrintWindowReady(printWindow);

    const root = printWindow.document.getElementById('print-root');
    if (!root) {
      throw new Error('打印根节点初始化失败。');
    }

    const blocks = buildPrintBlocks(vm.timeline);

    // Empty timeline: generate a single page with header + "no records" message
    if (blocks.length === 0) {
      const emptyPage = createPage(printWindow.document, vm, remarkLines);
      root.appendChild(emptyPage.pageEl);
      const emptyRow = printWindow.document.createElement('tr');
      const emptyTd = printWindow.document.createElement('td');
      emptyTd.colSpan = 17;
      emptyTd.textContent = '该护理日暂无记录';
      emptyTd.style.cssText = 'text-align:center;padding:20px;color:#999;font-size:12pt;';
      emptyRow.appendChild(emptyTd);
      emptyPage.tbodyEl.appendChild(emptyRow);
      fillPageNumbers([emptyPage]);
      printWindow.addEventListener('afterprint', () => { try { printWindow.close(); } catch { /* ignore */ } });
      printWindow.focus();
      await nextTwoFrames(printWindow);
      printWindow.print();
      return;
    }

    const pages = paginateToPages(
      printWindow.document,
      root,
      vm,
      remarkLines,
      blocks,
    );

    // Wait for layout to stabilize before filling page numbers
    await nextTwoFrames(printWindow);

    fillPageNumbers(pages);

    // Re-check after page numbers added
    await nextTwoFrames(printWindow);

    const ok = validateGeneratedPages(pages);
    const seqOk = validateSummarySequence(pages);
    if (!ok || !seqOk) {
      throw new Error('打印分页校验失败，存在未完整显示的内容或重复总结。');
    }

    // Register afterprint BEFORE calling print()
    printWindow.addEventListener('afterprint', () => {
      try {
        printWindow.close();
      } catch {
        // ignore
      }
    });

    printWindow.focus();
    await nextTwoFrames(printWindow);
    printWindow.print();
  } catch (error) {
    console.error('[HLJLD][print-error]', error);
    try {
      printWindow.close();
    } catch {
      // ignore
    }
    throw error;
  }
}

function buildPrintBlocks(
  timeline: HljldTimelineItem[],
): PrintBlock[] {
  const blocks: PrintBlock[] = [];
  const seenSummaryKeys = new Set<string>();

  for (const item of timeline) {
    if (item.kind === 'time-group') {
      blocks.push({
        kind: 'time-group',
        key: item.key,
        timestamp: item.timestamp,
        rows: item.group.rows,
      });
      continue;
    }

    // 小结去重：相同 kind + periodStart + periodEnd 视为同一小结
    const summary = item.summary;
    const dedupKey = [
      item.kind,
      summary?.kind ?? '',
      summary?.periodStart ?? 0,
      summary?.periodEnd ?? 0,
      summary?.label ?? '',
    ].join('|');
    if (seenSummaryKeys.has(dedupKey)) {
      // 诊断：记录被去重的小结
      const s = summary;
      console.warn(
        '[HLJLD][print-dedup] 跳过重复小结:',
        item.kind,
        s?.kind,
        `${s?.periodText ?? ''} ${s?.label ?? ''}`,
        `key=${dedupKey}`,
      );
      continue;
    }
    seenSummaryKeys.add(dedupKey);

    if (item.kind === 'day-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        timestamp: item.timestamp,
        summaryClassName: 'print-summary-day',
        summary,
      });
      continue;
    }

    if (item.kind === 'shift-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        timestamp: item.timestamp,
        summaryClassName: 'print-summary-shift',
        summary,
      });
      continue;
    }

    if (item.kind === 'full-day-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        timestamp: item.timestamp,
        summaryClassName: 'print-summary-24h',
        summary,
      });
      continue;
    }

    if (item.kind === 'discharge-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        timestamp: item.timestamp,
        summaryClassName: 'print-summary-discharge',
        summary,
      });
    }
  }

  return blocks;
}

function paginateToPages(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  blocks: PrintBlock[],
): PageRefs[] {
  const pages: PageRefs[] = [];
  let page = createPage(doc, vm, remarkLines);
  root.appendChild(page.pageEl);
  pages.push(page);

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];

    if (block.kind === 'summary') {
      // 收集连续同时间戳的 summary 组
      const { summaries, nextIndex } = collectSummaryGroup(blocks, i);

      // 尝试整组加入当前页
      if (appendSummaryGroup(page, summaries)) {
        i = nextIndex;
        continue;
      }

      // 整组放不下当前页：先 finalize 当前页
      console.warn(
        '[HLJLD][print-pagination] 小结组移至下一页:',
        summaries.map(s => `${s.summaryClassName} ${s.summary?.periodText}`).join(', '),
      );
      finalizePage(page);

      page = createPage(doc, vm, remarkLines);
      root.appendChild(page.pageEl);
      pages.push(page);

      // 在新页尝试整组加入
      if (appendSummaryGroup(page, summaries)) {
        i = nextIndex;
        continue;
      }

      // 整组在空白页也放不下：逐个尝试
      for (const summary of summaries) {
        if (!appendSummaryBlock(page, summary)) {
          throw new Error(
            `总结块 ${summary.key} 超出单页容量，请检查样式或内容。` +
            `\n  kind=${summary.summary?.kind} label=${summary.summary?.label} period=${summary.summary?.periodText}` +
            `\n  className=${summary.summaryClassName}`,
          );
        }
      }
      i = nextIndex;
      continue;
    }

    appendTimeGroupBlock(doc, root, vm, remarkLines, pages, block);
    page = pages[pages.length - 1];
    i += 1;
  }

  pages.forEach(finalizePage);
  return pages;
}

function appendTimeGroupBlock(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  pages: PageRefs[],
  block: Extract<PrintBlock, { kind: 'time-group' }>,
): void {
  const currentPage = pages[pages.length - 1];
  const groupRows = block.rows;

  const groupNodes = groupRows.map(row => createDisplayRowTr(doc, row));

  // 1. 整组能放当前页，直接完成
  if (tryAppendNodes(currentPage, groupNodes)) {
    return;
  }

  removeNodes(groupNodes);

  // 2. 当前页放不下整组时，先检查是否应该使用剩余空间拆分
  if (shouldSplitGroupIntoCurrentPage(currentPage, groupRows)) {
    splitTimeGroupAcrossPages(doc, root, vm, remarkLines, pages, groupRows);
    return;
  }

  // 3. 不适合拆分时，才整体移动到新页
  const emptyPage = createPage(doc, vm, remarkLines);
  root.appendChild(emptyPage.pageEl);

  const newNodes = groupRows.map(row => createDisplayRowTr(doc, row));
  if (tryAppendNodes(emptyPage, newNodes)) {
    pages.push(emptyPage);
    return;
  }

  removeNodes(newNodes);
  emptyPage.pageEl.remove();

  // 4. 空白页仍放不下，再逐行拆分
  appendRowsWithSplitting(doc, root, vm, remarkLines, pages, groupRows);
}

function getNarrativeFieldText(row: HljldDisplayRow, field: NarrativeField): string {
  switch (field) {
    case 'nursingRecord':
      return String(row.nursingRecord || '');
    case 'healthEducation':
      return String(row.healthEducation || '');
    case 'basicCare':
      return String(row.basicCare || '');
    case 'treatment':
      return String(row.treatment || '');
    case 'examination':
      return String(row.examination || '');
    default:
      return '';
  }
}

function buildNarrativeSegments(row: HljldDisplayRow): NarrativeSegment[] {
  return NARRATIVE_FIELD_ORDER
    .map(field => ({
      field,
      text: getNarrativeFieldText(row, field).trim(),
    }))
    .filter(segment => segment.text.length > 0);
}

function splitOversizedDisplayRow(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  pages: PageRefs[],
  row: HljldDisplayRow,
): void {
  const segments = buildNarrativeSegments(row);

  console.info('[HLJLD][print-split-row]', {
    rowKey: row.key,
    segments: segments.map(item => ({
      field: item.field,
      length: item.text.length,
    })),
  });

  if (!segments.length) {
    throw new Error(
      `${row.key} 超过单页高度，但该行没有可分页的叙述字段，请检查列宽、字号或固定字段内容。`,
    );
  }

  let segmentIndex = 0;
  let fragmentSerial = 0;

  while (segmentIndex < segments.length) {
    const segment = segments[segmentIndex];
    let remaining = segment.text;

    while (remaining.length > 0) {
      let currentPage = pages[pages.length - 1];

      if (pageHasData(currentPage)) {
        finalizePage(currentPage);

        const nextPage = createPage(doc, vm, remarkLines);
        root.appendChild(nextPage.pageEl);
        pages.push(nextPage);
        currentPage = nextPage;
      }

      const cutIndex = findMaxFittingSegmentTextIndex(
        currentPage,
        row,
        segment.field,
        remaining,
        fragmentSerial === 0,
      );

      if (cutIndex <= 0) {
        console.error('[HLJLD][print-split-failed]', {
          rowKey: row.key,
          field: segment.field,
          remainingLength: remaining.length,
          pageIndex: pages.length,
        });
        throw new Error(
          `无法为 ${row.key} 的字段 ${segment.field} 生成可打印片段，请检查该行是否存在多个并发超高字段。`,
        );
      }

      const currentText = remaining.slice(0, cutIndex);
      remaining = remaining.slice(cutIndex);

      const isLastOverallFragment =
        segmentIndex === segments.length - 1 && remaining.length === 0;

      const fragmentRow = createDisplayRowTr(
        doc,
        createSegmentRowFragment(
          row,
          segment.field,
          currentText,
          fragmentSerial === 0,
          isLastOverallFragment,
        ),
      );

      if (!tryAppendNodes(currentPage, [fragmentRow])) {
        removeNodes([fragmentRow]);
        throw new Error(
          `拆分后的片段仍无法放入页面：${row.key} / ${segment.field}`,
        );
      }

      fragmentSerial += 1;
    }

    segmentIndex += 1;
  }
}

function findMaxFittingSegmentTextIndex(
  page: PageRefs,
  row: HljldDisplayRow,
  field: NarrativeField,
  fullText: string,
  firstOverallFragment: boolean,
): number {
  let low = 1;
  let high = fullText.length;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidateText = fullText.slice(0, middle);

    const candidateRow = createDisplayRowTr(
      page.pageEl.ownerDocument,
      createSegmentRowFragment(
        row,
        field,
        candidateText,
        firstOverallFragment,
        false,
      ),
    );

    page.tbodyEl.appendChild(candidateRow);
    const fits = !isOverflowing(page);
    candidateRow.remove();

    if (fits) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (best <= 0) {
    return 0;
  }

  return moveCutToNaturalBoundary(fullText, best);
}

function createSegmentRowFragment(
  row: HljldDisplayRow,
  field: NarrativeField,
  fragmentText: string,
  firstOverallFragment: boolean,
  lastOverallFragment: boolean,
): HljldDisplayRow {
  const nextRow: HljldDisplayRow = {
    ...row,
    key: `${row.key}__${field}__segment__${Math.random().toString(36).slice(2)}`,
    firstLine: firstOverallFragment ? row.firstLine : false,

    timeText: firstOverallFragment ? row.timeText : '',
    medication: firstOverallFragment ? row.medication : undefined,
    enteral: firstOverallFragment ? row.enteral : undefined,
    output: firstOverallFragment ? row.output : undefined,
    drain: firstOverallFragment ? row.drain : undefined,

    examination: '',
    treatment: '',
    basicCare: '',
    healthEducation: '',
    nursingRecord: '',

    signature: lastOverallFragment ? row.signature : '',
  };

  switch (field) {
    case 'nursingRecord':
      nextRow.nursingRecord = fragmentText;
      break;
    case 'healthEducation':
      nextRow.healthEducation = fragmentText;
      break;
    case 'basicCare':
      nextRow.basicCare = fragmentText;
      break;
    case 'treatment':
      nextRow.treatment = fragmentText;
      break;
    case 'examination':
      nextRow.examination = fragmentText;
      break;
  }

  return nextRow;
}

function moveCutToNaturalBoundary(text: string, index: number): number {
  if (index >= text.length) {
    return text.length;
  }

  const preferredChars = new Set(['。', '；', '，', '、', '：', ' ', '\n']);

  for (let cursor = index; cursor > Math.max(1, index - 24); cursor -= 1) {
    const char = text[cursor - 1] || '';
    if (preferredChars.has(char)) {
      return cursor;
    }
  }

  return index;
}

/* ---- 当前页剩余可用高度 ---- */

function getRemainingPrintableHeight(page: PageRefs): number {
  const tbodyRect = page.tbodyEl.getBoundingClientRect();
  const wrapRect = page.tableWrapEl.getBoundingClientRect();
  const tfootRect = page.tfootEl.getBoundingClientRect();
  const safetyGap = 4;
  // 可用空间 = 容器底部 - tbody底部 - 备注高度 - 安全间距
  return Math.max(0, wrapRect.bottom - tbodyRect.bottom - tfootRect.height - safetyGap);
}

/** 获取当前页剩余空间占容器高度的比例 */
function getRemainingRatio(page: PageRefs): number {
  const wrapRect = page.tableWrapEl.getBoundingClientRect();
  const remaining = getRemainingPrintableHeight(page);
  return wrapRect.height > 0 ? remaining / wrapRect.height : 0;
}

/* ---- 当前页拆分判断 ---- */

const MIN_FRAGMENT_HEIGHT_PX = 80;
const MIN_FRAGMENT_CHARACTERS = 16;
const LARGE_GAP_RATIO = 0.12;

/** 测试当前页能否放入一个有效的叙述片段 */
function canFitUsefulFragment(
  page: PageRefs,
  row: HljldDisplayRow,
): boolean {
  const segments = buildNarrativeSegments(row);
  if (!segments.length) { return false; }
  const first = segments[0];
  const cutIndex = findMaxFittingSegmentTextIndex(
    page,
    row,
    first.field,
    first.text,
    true,
  );
  return cutIndex >= MIN_FRAGMENT_CHARACTERS;
}

/** 判断是否应该将时间组拆分到当前页 */
function shouldSplitGroupIntoCurrentPage(
  page: PageRefs,
  rows: HljldDisplayRow[],
): boolean {
  if (!pageHasData(page)) { return false; }
  const remainingHeight = getRemainingPrintableHeight(page);
  const remainingRatio = getRemainingRatio(page);
  // 空间太小不拆分
  if (remainingHeight < MIN_FRAGMENT_HEIGHT_PX) { return false; }
  // 空间比例太小不拆分
  if (remainingRatio < LARGE_GAP_RATIO) { return false; }
  // 检查第一行是否包含可拆分叙述字段且能放下有效片段
  const firstRow = rows[0];
  return canFitUsefulFragment(page, firstRow);
}

/* ---- 时间组跨页拆分 ---- */

/**
 * 将时间组拆分到当前页和后续页。
 * 按行顺序处理：普通短行先放当前页，长叙述行截取后剩余放下一页。
 * 续页不显示时间、不重复固定数据，签名只在最后片段显示。
 */
function splitTimeGroupAcrossPages(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  pages: PageRefs[],
  rows: HljldDisplayRow[],
): void {
  let currentPage = pages[pages.length - 1];
  let isFirstRowOfGroup = true;

  for (const row of rows) {
    currentPage = pages[pages.length - 1];

    // 普通短行：尝试直接放入当前页
    const singleNode = createDisplayRowTr(doc, row);
    if (tryAppendNodes(currentPage, [singleNode])) {
      isFirstRowOfGroup = false;
      continue;
    }
    removeNodes([singleNode]);

    // 长叙述行：尝试在当前页截取有效片段
    const remainingHeight = getRemainingPrintableHeight(currentPage);
    const remainingRatio = getRemainingRatio(currentPage);
    const segments = buildNarrativeSegments(row);
    const canSplit = segments.length > 0
      && remainingHeight >= MIN_FRAGMENT_HEIGHT_PX
      && remainingRatio >= LARGE_GAP_RATIO;

    if (canSplit && canFitUsefulFragment(currentPage, row)) {
      // 在当前页放入首段
      splitRowFirstFragmentToCurrentPage(doc, currentPage, row, isFirstRowOfGroup);
      isFirstRowOfGroup = false;

      // finalize 当前页，剩余内容到新页
      finalizePage(currentPage);
      const nextPage = createPage(doc, vm, remarkLines);
      root.appendChild(nextPage.pageEl);
      pages.push(nextPage);

      // 将剩余叙述放到新页
      splitRowRemainingToNewPage(doc, root, vm, remarkLines, pages, row);
      continue;
    }

    // 不能拆分：finalize 当前页，在新页整体放入
    if (pageHasData(currentPage)) {
      finalizePage(currentPage);
      const nextPage = createPage(doc, vm, remarkLines);
      root.appendChild(nextPage.pageEl);
      pages.push(nextPage);
      currentPage = pages[pages.length - 1];
    }

    const retryNode = createDisplayRowTr(doc, row);
    if (tryAppendNodes(currentPage, [retryNode])) {
      isFirstRowOfGroup = false;
      continue;
    }

    removeNodes([retryNode]);
    splitOversizedDisplayRow(doc, root, vm, remarkLines, pages, row);
    isFirstRowOfGroup = false;
  }
}

/**
 * 将行的首段叙述截取放入当前页。
 */
function splitRowFirstFragmentToCurrentPage(
  doc: Document,
  page: PageRefs,
  row: HljldDisplayRow,
  showFixedFields: boolean,
): void {
  const segments = buildNarrativeSegments(row);
  if (!segments.length) { return; }

  const first = segments[0];
  const cutIndex = findMaxFittingSegmentTextIndex(
    page,
    row,
    first.field,
    first.text,
    true,
  );

  if (cutIndex <= 0) { return; }

  const currentText = first.text.slice(0, cutIndex);
  const fragmentRow = createDisplayRowTr(
    doc,
    createSegmentRowFragment(row, first.field, currentText, showFixedFields, false),
  );

  if (tryAppendNodes(page, [fragmentRow])) {
    return;
  }
  removeNodes([fragmentRow]);
}

/**
 * 将行的剩余叙述放到新页（已经是新页的当前页）。
 */
function splitRowRemainingToNewPage(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  pages: PageRefs[],
  row: HljldDisplayRow,
): void {
  const segments = buildNarrativeSegments(row);
  if (!segments.length) { return; }

  let segmentIndex = 0;
  let fragmentSerial = 0;

  // 跳过第一个片段的已截取部分
  const firstSegment = segments[0];
  const firstCutIndex = findMaxFittingSegmentTextIndex(
    pages[pages.length - 1],
    row,
    firstSegment.field,
    firstSegment.text,
    true,
  );
  let firstRemaining = firstSegment.text.slice(firstCutIndex);

  // 处理第一个片段的剩余
  if (firstRemaining.length > 0) {
    let currentPage = pages[pages.length - 1];
    const cutIndex = findMaxFittingSegmentTextIndex(
      currentPage,
      row,
      firstSegment.field,
      firstRemaining,
      false,
    );

    if (cutIndex > 0) {
      const text = firstRemaining.slice(0, cutIndex);
      firstRemaining = firstRemaining.slice(cutIndex);
      const isLast = segmentIndex === segments.length - 1 && firstRemaining.length === 0;
      const fragmentRow = createDisplayRowTr(
        doc,
        createSegmentRowFragment(row, firstSegment.field, text, false, isLast),
      );
      if (tryAppendNodes(currentPage, [fragmentRow])) {
        fragmentSerial += 1;
      }
    }
  }

  segmentIndex = 1;

  // 处理后续片段
  while (segmentIndex < segments.length) {
    const segment = segments[segmentIndex];
    let remaining = segment.text;

    while (remaining.length > 0) {
      let currentPage = pages[pages.length - 1];

      if (pageHasData(currentPage)) {
        finalizePage(currentPage);
        const nextPage = createPage(doc, vm, remarkLines);
        root.appendChild(nextPage.pageEl);
        pages.push(nextPage);
        currentPage = nextPage;
      }

      const cutIndex = findMaxFittingSegmentTextIndex(
        currentPage,
        row,
        segment.field,
        remaining,
        fragmentSerial === 0,
      );

      if (cutIndex <= 0) {
        throw new Error(
          `无法为 ${row.key} 的字段 ${segment.field} 生成可打印片段。`,
        );
      }

      const text = remaining.slice(0, cutIndex);
      remaining = remaining.slice(cutIndex);

      const isLastOverallFragment =
        segmentIndex === segments.length - 1 && remaining.length === 0;

      const fragmentRow = createDisplayRowTr(
        doc,
        createSegmentRowFragment(row, segment.field, text, false, isLastOverallFragment),
      );

      if (!tryAppendNodes(currentPage, [fragmentRow])) {
        removeNodes([fragmentRow]);
        throw new Error(
          `拆分后的片段仍无法放入页面：${row.key} / ${segment.field}`,
        );
      }

      fragmentSerial += 1;
    }

    segmentIndex += 1;
  }
}

/**
 * 逐行处理，支持拆分。
 */
function appendRowsWithSplitting(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  pages: PageRefs[],
  rows: HljldDisplayRow[],
): void {
  for (const row of rows) {
    let currentPage = pages[pages.length - 1];
    const singleRowNode = createDisplayRowTr(doc, row);

    if (tryAppendNodes(currentPage, [singleRowNode])) {
      continue;
    }

    removeNodes([singleRowNode]);

    if (pageHasData(currentPage)) {
      finalizePage(currentPage);

      const nextPage = createPage(doc, vm, remarkLines);
      root.appendChild(nextPage.pageEl);
      pages.push(nextPage);
      currentPage = pages[pages.length - 1];

      const retriedNode = createDisplayRowTr(doc, row);
      if (tryAppendNodes(currentPage, [retriedNode])) {
        continue;
      }

      removeNodes([retriedNode]);
    }

    splitOversizedDisplayRow(doc, root, vm, remarkLines, pages, row);
  }
}

function appendSummaryBlock(
  page: PageRefs,
  block: SummaryPrintBlock,
): boolean {
  const node = createSummaryTr(
    page.pageEl.ownerDocument,
    block.summary,
    block.summaryClassName,
  );

  const ok = tryAppendNodes(page, [node]);

  if (!ok) {
    removeNodes([node]);
  }

  return ok;
}

/**
 * 从 startIndex 开始收集连续且时间戳相同的 summary block。
 * shift-summary + full-day-summary 同时间戳视为同一组。
 */
function collectSummaryGroup(
  blocks: PrintBlock[],
  startIndex: number,
): {
  summaries: SummaryPrintBlock[];
  nextIndex: number;
} {
  const first = blocks[startIndex];
  if (first.kind !== 'summary') {
    return { summaries: [], nextIndex: startIndex };
  }
  const summaries: SummaryPrintBlock[] = [first];
  let nextIndex = startIndex + 1;
  while (nextIndex < blocks.length) {
    const candidate = blocks[nextIndex];
    if (
      candidate.kind !== 'summary'
      || candidate.timestamp !== first.timestamp
    ) {
      break;
    }
    summaries.push(candidate);
    nextIndex += 1;
  }
  return { summaries, nextIndex };
}

/**
 * 将一组 summary 作为一个整体尝试追加到当前页。
 * 整组放不下时全部移除，返回 false。
 */
function appendSummaryGroup(
  page: PageRefs,
  summaries: SummaryPrintBlock[],
): boolean {
  const doc = page.pageEl.ownerDocument;
  const nodes = summaries.map(block =>
    createSummaryTr(doc, block.summary, block.summaryClassName),
  );
  nodes.forEach(node => page.tbodyEl.appendChild(node));

  if (isOverflowing(page)) {
    nodes.forEach(node => node.remove());
    return false;
  }
  return true;
}

function tryAppendNodes(
  page: PageRefs,
  nodes: HTMLElement[],
): boolean {
  nodes.forEach(node => page.tbodyEl.appendChild(node));

  if (isOverflowing(page)) {
    return false;
  }

  return true;
}

function isOverflowing(page: PageRefs): boolean {
  const tableRect = page.tableEl.getBoundingClientRect();
  const tableWrapRect = page.tableWrapEl.getBoundingClientRect();
  const tfootRect = page.tfootEl.getBoundingClientRect();
  const pageNoRect = page.pageNoEl.getBoundingClientRect();
  const tolerance = 2;
  // 表格底部越过容器底部，或内容高度超出容器 → 溢出
  const exceedsTableWrap =
    tableRect.bottom > tableWrapRect.bottom + tolerance
    || page.tableEl.scrollHeight > page.tableWrapEl.clientHeight + tolerance;
  // 小结块底部越过页码区 → 溢出
  const overlapsPageNumber = tfootRect.bottom > pageNoRect.top - tolerance;
  return exceedsTableWrap || overlapsPageNumber;
}

function createPage(
  doc: Document,
  vm: HljldViewModel,
  remarkLines: string[],
): PageRefs {
  const pageEl = doc.createElement('section');
  pageEl.className = 'print-page';

  const sheetEl = doc.createElement('article');
  sheetEl.className = 'sheet';
  pageEl.appendChild(sheetEl);

  const headEl = doc.createElement('header');
  headEl.className = 'sheet-head';
  sheetEl.appendChild(headEl);

  const titleEl = doc.createElement('div');
  titleEl.className = 'title-line';
  titleEl.textContent = '重钢总医院重症医学科护理记录单';
  headEl.appendChild(titleEl);

  const patientInfoEl = doc.createElement('div');
  patientInfoEl.className = 'patient-info-row';
  patientInfoEl.innerHTML = `
    <span class="info-item">床号：<strong>${escapeHtml(vm.patient.bedNo ? (vm.patient.bedNo.endsWith('床') ? vm.patient.bedNo : vm.patient.bedNo + '床') : '—')}</strong></span>
    <span class="info-item">姓名：<strong>${escapeHtml(vm.patient.name || '—')}</strong></span>
    <span class="info-item">住院号：<strong>${escapeHtml(vm.patient.mrn || '—')}</strong></span>
    <span class="info-item">性别：<strong>${escapeHtml(vm.patient.sex || '—')}</strong></span>
    <span class="info-item">年龄：<strong>${escapeHtml(String(vm.patient.age ?? '—'))}</strong></span>
    <span class="diagnosis-item">诊断：<strong>${escapeHtml(vm.patient.diagnosis || '—')}</strong></span>
  `;
  headEl.appendChild(patientInfoEl);

  const tableWrap = doc.createElement('div');
  tableWrap.className = 'print-table-wrap';
  sheetEl.appendChild(tableWrap);

  const tableEl = doc.createElement('table');
  tableEl.className = 'print-record-table';
  tableWrap.appendChild(tableEl);

  tableEl.appendChild(createColGroup(doc));
  tableEl.appendChild(createThead(doc));

  const tbodyEl = doc.createElement('tbody');
  tableEl.appendChild(tbodyEl);

  const tfootEl = doc.createElement('tfoot');
  tfootEl.appendChild(createRemarkRow(doc, remarkLines));
  tableEl.appendChild(tfootEl);

  const pageNoEl = doc.createElement('footer');
  pageNoEl.className = 'sheet-pageno';
  pageNoEl.innerHTML = `
    第<span class="page-current"></span>页 共<span class="page-total"></span>页
  `;
  sheetEl.appendChild(pageNoEl);

  return {
    pageEl,
    sheetEl,
    headEl,
    titleEl,
    patientInfoEl,
    tableWrapEl: tableWrap,
    tableEl,
    tbodyEl,
    tfootEl,
    pageNoEl,
  };
}

function finalizePage(page: PageRefs): void {
  removeExistingFillerRow(page);
  // 不再创建 filler。
  // 备注由 tfoot 自然跟随最后一条内容。
  // 物理空白位于备注下方，不显示为大块带边框表格区域。
}

function removeExistingFillerRow(page: PageRefs): void {
  const filler = page.tbodyEl.querySelector('.print-filler-row');
  if (filler) {
    filler.remove();
  }
}

function pageHasData(page: PageRefs): boolean {
  return Array.from(page.tbodyEl.children).some(
    child => !(child as HTMLElement).classList.contains('print-filler-row'),
  );
}

function createColGroup(doc: Document): HTMLTableColElement['parentNode'] {
  const colgroup = doc.createElement('colgroup');

  const classes = [
    'col-time',
    'col-med-name',
    'col-med-amount',
    'col-med-route',
    'col-enteral-name',
    'col-enteral-amount',
    'col-enteral-route',
    'col-output-name',
    'col-output-amount',
    'col-drain-name',
    'col-drain-amount',
    'col-check',
    'col-treatment',
    'col-basic-care',
    'col-health',
    'col-nursing',
    'col-sign',
  ];

  classes.forEach(className => {
    const col = doc.createElement('col');
    col.className = className;
    colgroup.appendChild(col);
  });

  return colgroup;
}

function createThead(doc: Document): HTMLTableSectionElement {
  const thead = doc.createElement('thead');

  const row1 = doc.createElement('tr');
  row1.innerHTML = `
    <th rowspan="2">日期时间</th>
    <th colspan="3">药物治疗</th>
    <th colspan="3">胃肠摄入</th>
    <th colspan="2">排出物</th>
    <th colspan="2">引流液</th>
    <th rowspan="2">检查</th>
    <th rowspan="2">治疗</th>
    <th rowspan="2">基础护理</th>
    <th rowspan="2">健康教育</th>
    <th rowspan="2">护理记录</th>
    <th rowspan="2">签名</th>
  `;

  const row2 = doc.createElement('tr');
  row2.innerHTML = `
    <th>名称</th><th>量/ml</th><th>途径</th>
    <th>名称</th><th>量/ml</th><th>途径</th>
    <th>名称</th><th>量/ml</th>
    <th>名称</th><th>量/ml</th>
  `;

  thead.appendChild(row1);
  thead.appendChild(row2);
  return thead;
}

function createRemarkRow(
  doc: Document,
  remarkLines: string[],
): HTMLTableRowElement {
  const tr = doc.createElement('tr');
  tr.className = 'print-remark-row';

  const th = doc.createElement('th');
  th.textContent = '备注';
  tr.appendChild(th);

  const td = doc.createElement('td');
  td.colSpan = 16;

  const wrapper = doc.createElement('div');
  wrapper.className = 'print-remark-lines';

  remarkLines.forEach(line => {
    const div = doc.createElement('div');
    div.className = 'print-remark-line';
    div.textContent = line;
    wrapper.appendChild(div);
  });

  td.appendChild(wrapper);
  tr.appendChild(td);

  return tr;
}

function createDisplayRowTr(
  doc: Document,
  row: HljldDisplayRow,
): HTMLTableRowElement {
  const tr = doc.createElement('tr');

  if (!row.firstLine) {
    tr.classList.add('continuation-row');
  }

  tr.appendChild(cell(doc, row.timeText, 'time-cell'));
  tr.appendChild(cell(doc, row.medication?.name || ''));
  tr.appendChild(cell(doc, row.medication?.amount || ''));
  tr.appendChild(cell(doc, row.medication?.route || ''));

  tr.appendChild(cell(doc, row.enteral?.name || ''));
  tr.appendChild(cell(doc, row.enteral?.amount || ''));
  tr.appendChild(cell(doc, row.enteral?.route || ''));

  tr.appendChild(cell(doc, row.output?.name || ''));
  tr.appendChild(cell(doc, row.output?.amount || ''));

  tr.appendChild(cell(doc, row.drain?.name || ''));
  tr.appendChild(cell(doc, row.drain?.amount || ''));

  tr.appendChild(cell(doc, row.examination || '', 'exam-cell'));
  tr.appendChild(cell(doc, row.treatment || '', 'treatment-cell'));
  tr.appendChild(cell(doc, row.basicCare || '', 'basic-care-cell'));
  tr.appendChild(cell(doc, row.healthEducation || '', 'health-cell'));
  tr.appendChild(cell(doc, row.nursingRecord || '', 'nursing-cell'));
  tr.appendChild(cell(doc, row.signature || '', 'sign-cell'));

  return tr;
}

function createSummaryTr(
  doc: Document,
  summary: HljldSummary,
  summaryClassName: string,
): HTMLTableRowElement {
  const tr = doc.createElement('tr');
  tr.className = `print-summary-row ${summaryClassName}`;
  // 诊断数据：便于排查分页问题
  tr.dataset.summaryKind = summary.kind;
  tr.dataset.summaryLabel = summary.label;
  tr.dataset.summaryPeriod = summary.periodText;
  tr.dataset.summaryPeriodStart = String(summary.periodStart);
  tr.dataset.summaryPeriodEnd = String(summary.periodEnd);
  tr.dataset.summaryIdentity = [
    summary.kind,
    summary.periodStart,
    summary.periodEnd,
  ].join('|');

  const td = doc.createElement('td');
  td.colSpan = 17;

  const drugDetailText = summary.drugTreatmentItems
    .map(item => `${escapeHtml(item.label)}：<span class="print-summary-strong">${formatAmount(item.amount)} ml</span>`)
    .join('、');
  const gastroDetailText = summary.gastrointestinalInputItems
    .map(item => `${escapeHtml(item.label)}：<span class="print-summary-strong">${formatAmount(item.amount)} ml</span>`)
    .join('、');
  const excretionDetailText = summary.outputItems
    .map(item => `${escapeHtml(item.label)}：<span class="print-summary-strong">${formatAmount(item.amount)} ml</span>`)
    .join('、');
  const drainDetailText = summary.drainItems.length
    ? `；引流液：<span class="print-summary-strong">${formatAmount(summary.drainTotal)} ml</span>（${summary.drainItems.map(item => `${escapeHtml(item.label)}：<span class="print-summary-strong">${formatAmount(item.amount)} ml</span>`).join('、')}）`
    : '';

  td.innerHTML = `
    <section class="print-summary-panel">
      <div class="print-summary-title-row">
        <strong class="print-summary-title">${escapeHtml(summary.label)}</strong>
        <span class="print-summary-period">${escapeHtml(summary.periodText || '')}</span>
      </div>

      <div class="print-summary-line">
        <span>总入量：<span class="print-summary-strong">${formatAmount(summary.totalInput)} ml</span>；药物治疗：<span class="print-summary-strong">${formatAmount(summary.drugTreatmentTotal)} ml</span>（${drugDetailText}）；胃肠摄入：<span class="print-summary-strong">${formatAmount(summary.gastrointestinalInputTotal)} ml</span>（${gastroDetailText}）</span>
      </div>

      <div class="print-summary-line">
        <span>总出量：<span class="print-summary-strong">${formatAmount(summary.totalOutput)} ml</span>；排出物：<span class="print-summary-strong">${formatAmount(summary.excretionTotal)} ml</span>（${excretionDetailText}）${drainDetailText}</span>
      </div>

      <div class="print-summary-line">
        <span>平衡量：<span class="print-summary-strong">${formatAmount(summary.balance)} ml</span></span>
      </div>
    </section>
  `;

  tr.appendChild(td);
  return tr;
}

function cell(
  doc: Document,
  text: string,
  className = '',
): HTMLTableCellElement {
  const td = doc.createElement('td');
  if (className) {
    td.className = className;
  }
  td.textContent = text;
  return td;
}

function fillPageNumbers(pages: PageRefs[]): void {
  const total = pages.length;

  pages.forEach((page, index) => {
    const current = page.pageNoEl.querySelector('.page-current');
    const totalNode = page.pageNoEl.querySelector('.page-total');

    if (!current || !totalNode) {
      throw new Error(`第 ${index + 1} 页页码节点缺失`);
    }

    current.textContent = String(index + 1);
    totalNode.textContent = String(total);
  });
}

function validateGeneratedPages(pages: PageRefs[]): boolean {
  let ok = true;
  const overflowTolerance = 2;

  for (const [pageIndex, page] of pages.entries()) {
    const current = page.pageNoEl.querySelector('.page-current');
    const total = page.pageNoEl.querySelector('.page-total');

    if (!current?.textContent?.trim() || !total?.textContent?.trim()) {
      console.error('[HLJLD][print-validate] missing page number value', pageIndex + 1);
      ok = false;
    }

    if (!page.tfootEl.querySelector('.print-remark-row')) {
      console.error('[HLJLD][print-validate] missing remark row', pageIndex + 1);
      ok = false;
    }

    const dataRows = Array.from(page.tbodyEl.querySelectorAll('tr'))
      .filter(row => !row.classList.contains('print-filler-row'));

    if (dataRows.length === 0) {
      console.error('[HLJLD][print-validate] blank data page', pageIndex + 1);
      ok = false;
    }

    // 整页溢出校验
    if (isOverflowing(page)) {
      const tableRect = page.tableEl.getBoundingClientRect();
      const wrapRect = page.tableWrapEl.getBoundingClientRect();
      const tfootRect = page.tfootEl.getBoundingClientRect();
      const pageNoRect = page.pageNoEl.getBoundingClientRect();
      console.error('[HLJLD][print-validate] page overflow', {
        page: pageIndex + 1,
        tableBottom: Math.round(tableRect.bottom),
        tableWrapBottom: Math.round(wrapRect.bottom),
        remarkBottom: Math.round(tfootRect.bottom),
        pageNumberTop: Math.round(pageNoRect.top),
      });
      ok = false;
    }

    // 备注完整校验
    const remarkRow = page.tfootEl.querySelector<HTMLElement>('.print-remark-row');
    if (remarkRow) {
      const remarkRect = remarkRow.getBoundingClientRect();
      const wrapRect = page.tableWrapEl.getBoundingClientRect();
      const pageNoRect = page.pageNoEl.getBoundingClientRect();
      if (
        remarkRect.bottom > wrapRect.bottom + overflowTolerance
        || remarkRect.bottom > pageNoRect.top
      ) {
        console.error('[HLJLD][print-validate] remark clipped', {
          page: pageIndex + 1,
          remarkBottom: Math.round(remarkRect.bottom),
          wrapBottom: Math.round(wrapRect.bottom),
          pageNumberTop: Math.round(pageNoRect.top),
        });
        ok = false;
      }
    }

    const cells = page.pageEl.querySelectorAll('td, th');
    cells.forEach(cellNode => {
      const el = cellNode as HTMLElement;
      if (el.scrollHeight > el.clientHeight + overflowTolerance) {
        const tr = el.closest('tr');
        const rowKey = (tr as HTMLElement)?.getAttribute('data-row-key') ?? 'unknown';
        const colClass = Array.from(el.classList).find(c => c.endsWith('-cell')) ?? el.className;
        const sheetRect = page.sheetEl.getBoundingClientRect();
        const headRect = page.headEl.getBoundingClientRect();
        const tfootRect = page.tfootEl.getBoundingClientRect();
        const availableHeight = Math.round(sheetRect.height - headRect.height - tfootRect.height - 30);
        console.error('[HLJLD][print-validate] cell overflow', {
          page: pageIndex + 1,
          rowKey,
          field: colClass,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          availableHeight,
          text: el.textContent?.slice(0, 60),
        });
        ok = false;
      }
    });
  }

  return ok;
}

/**
 * 校验总结数量和顺序：不允许重复总结。
 */
function validateSummarySequence(pages: PageRefs[]): boolean {
  const rows = pages.flatMap(page =>
    Array.from(
      page.tbodyEl.querySelectorAll<HTMLElement>('.print-summary-row'),
    ),
  );
  const identities = rows.map(row => [
    row.dataset.summaryKind,
    row.dataset.summaryPeriodStart,
    row.dataset.summaryPeriodEnd,
  ].join('|'));
  if (new Set(identities).size !== identities.length) {
    console.error('[HLJLD][print-validate] duplicate summaries found');
    return false;
  }
  return true;
}

function removeNodes(nodes: HTMLElement[]): void {
  nodes.forEach(node => node.remove());
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function waitForPrintWindowReady(win: Window): Promise<void> {
  await new Promise<void>(resolve => {
    if (win.document.readyState === 'complete') {
      resolve();
      return;
    }

    const handler = () => {
      win.removeEventListener('load', handler);
      resolve();
    };

    win.addEventListener('load', handler);
  });

  const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) {
    await fonts.ready;
  }

  await nextTwoFrames(win);
}

async function nextTwoFrames(win: Window): Promise<void> {
  await new Promise<void>(resolve => {
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => resolve());
    });
  });
}
