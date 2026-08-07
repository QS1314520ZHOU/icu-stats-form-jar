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

type PrintBlock =
  | {
      kind: 'time-group';
      key: string;
      rows: HljldDisplayRow[];
    }
  | {
      kind: 'summary';
      key: string;
      summaryClassName: string;
      summary: HljldSummary;
    };

type SplittableField =
  | 'nursingRecord'
  | 'examination'
  | 'treatment'
  | 'basicCare'
  | 'healthEducation';

const SPLITTABLE_FIELDS: SplittableField[] = [
  'nursingRecord',
  'healthEducation',
  'basicCare',
  'treatment',
  'examination',
];

const MIN_SPLITTABLE_TEXT_LENGTH = 8;

type PageRefs = {
  pageEl: HTMLElement;
  sheetEl: HTMLElement;
  headEl: HTMLElement;
  titleEl: HTMLElement;
  patientInfoEl: HTMLElement;
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
  box-sizing: border-box;
  width: 297mm;
  height: 210mm;
  padding: 4mm 7mm 3mm;
  display: grid;
  grid-template-rows: auto 1fr auto;
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
}

.print-summary-panel {
  width: 100%;
  box-sizing: border-box;
  padding: 1mm 1.5mm;
  text-align: left;
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
}

.print-summary-title {
  font-weight: 700;
  font-size: 8pt;
}

.print-summary-period {
  font-size: 7pt;
}

.print-summary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8mm 2.4mm;
  align-items: baseline;
  justify-content: flex-start;
  line-height: 1.35;
  font-size: 7pt;
}

.print-summary-line + .print-summary-line {
  margin-top: 0.4mm;
}

.print-summary-strong {
  font-weight: 700;
}

.print-filler-row td {
  padding: 0 !important;
  height: var(--filler-height, 0px);
  line-height: 0;
  font-size: 0;
  vertical-align: top;
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
  text-align: center;
  font-family: "SimSun", "宋体", serif;
  font-size: 8pt;
  line-height: 10pt;
  color: #000;
  padding-top: 1.2mm;
  min-height: 10pt;
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
    const pages = paginateToPages(
      printWindow.document,
      root,
      vm,
      remarkLines,
      blocks,
    );

    fillPageNumbers(pages);

    const ok = validateGeneratedPages(pages);
    if (!ok) {
      throw new Error('打印分页校验失败，存在未完整显示的内容。');
    }

    printWindow.focus();
    await nextTwoFrames(printWindow);
    printWindow.print();

    printWindow.addEventListener('afterprint', () => {
      try {
        printWindow.close();
      } catch {
        // ignore
      }
    });
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

  for (const item of timeline) {
    if (item.kind === 'time-group') {
      blocks.push({
        kind: 'time-group',
        key: item.key,
        rows: item.group.rows,
      });
      continue;
    }

    if (item.kind === 'day-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        summaryClassName: 'print-summary-day',
        summary: item.summary,
      });
      continue;
    }

    if (item.kind === 'shift-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        summaryClassName: 'print-summary-shift',
        summary: item.summary,
      });
      continue;
    }

    if (item.kind === 'full-day-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        summaryClassName: 'print-summary-24h',
        summary: item.summary,
      });
      continue;
    }

    if (item.kind === 'discharge-summary') {
      blocks.push({
        kind: 'summary',
        key: item.key,
        summaryClassName: 'print-summary-discharge',
        summary: item.summary,
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

  for (const block of blocks) {
    if (block.kind === 'summary') {
      if (!appendSummaryBlock(page, block)) {
        finalizePage(page);

        page = createPage(doc, vm, remarkLines);
        root.appendChild(page.pageEl);
        pages.push(page);

        if (!appendSummaryBlock(page, block)) {
          throw new Error(`总结块 ${block.key} 超出单页容量，请检查样式或内容。`);
        }
      }
      continue;
    }

    appendTimeGroupBlock(doc, root, vm, remarkLines, pages, block);
    page = pages[pages.length - 1];
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
  let currentPage = pages[pages.length - 1];
  const groupRows = block.rows;

  const groupNodes = groupRows.map(row => createDisplayRowTr(doc, row));

  if (tryAppendNodes(currentPage, groupNodes)) {
    return;
  }

  removeNodes(groupNodes);

  const emptyPage = createPage(doc, vm, remarkLines);
  root.appendChild(emptyPage.pageEl);

  if (tryAppendNodes(emptyPage, groupRows.map(row => createDisplayRowTr(doc, row)))) {
    pages.push(emptyPage);
    return;
  }

  emptyPage.pageEl.remove();

  const newPage = createPage(doc, vm, remarkLines);
  root.appendChild(newPage.pageEl);
  pages.push(newPage);

  for (const row of groupRows) {
    currentPage = pages[pages.length - 1];
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
      currentPage = nextPage;

      const retriedNode = createDisplayRowTr(doc, row);
      if (tryAppendNodes(currentPage, [retriedNode])) {
        continue;
      }

      removeNodes([retriedNode]);
    }

    splitOversizedDisplayRow(doc, root, vm, remarkLines, pages, row);
  }
}

function splitOversizedDisplayRow(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  pages: PageRefs[],
  row: HljldDisplayRow,
): void {
  const targetField = findSplittableField(row);

  if (!targetField) {
    throw new Error(
      `${row.key} 的字段 ${targetField} 超过单页高度且没有可拆分的长文本字段。`,
    );
  }

  let remaining = getSplittableFieldText(row, targetField);
  let fragmentIndex = 0;

  while (remaining.length > 0) {
    let currentPage = pages[pages.length - 1];

    if (pageHasData(currentPage)) {
      finalizePage(currentPage);

      const nextPage = createPage(doc, vm, remarkLines);
      root.appendChild(nextPage.pageEl);
      pages.push(nextPage);
      currentPage = nextPage;
    }

    const cutIndex = findMaxFittingTextIndexByField(
      currentPage,
      row,
      targetField,
      remaining,
      fragmentIndex === 0,
    );

    if (cutIndex <= 0) {
      throw new Error(
        `无法为 ${row.key} 的字段 ${targetField} 找到可打印的文本切分位置`,
      );
    }

    const currentText = remaining.slice(0, cutIndex);
    remaining = remaining.slice(cutIndex);

    const fragmentRow = createDisplayRowTr(
      doc,
      createSplitRowFragmentByField(
        row,
        targetField,
        currentText,
        fragmentIndex === 0,
        remaining.length === 0,
      ),
    );

    if (!tryAppendNodes(currentPage, [fragmentRow])) {
      removeNodes([fragmentRow]);
      throw new Error(
        `拆分后的片段仍无法放入页面：${row.key} / ${targetField}`,
      );
    }

    fragmentIndex += 1;
  }
}

function getSplittableFieldText(row: HljldDisplayRow, field: SplittableField): string {
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

function findSplittableField(row: HljldDisplayRow): SplittableField | null {
  let bestField: SplittableField | null = null;
  let bestScore = -1;

  for (const field of SPLITTABLE_FIELDS) {
    const text = getSplittableFieldText(row, field).trim();
    if (!text) {
      continue;
    }

    const hasLineBreak = /\r?\n/.test(text);
    const isLongEnough = text.length >= MIN_SPLITTABLE_TEXT_LENGTH;

    // 太短且没有换行的字段，不参与拆分
    if (!isLongEnough && !hasLineBreak) {
      continue;
    }

    let score = text.length;

    // 护理记录优先级最高
    if (field === 'nursingRecord') {
      score += 10000;
    } else if (field === 'healthEducation') {
      score += 4000;
    } else if (field === 'basicCare') {
      score += 3000;
    } else if (field === 'treatment') {
      score += 2000;
    } else if (field === 'examination') {
      score += 1000;
    }

    if (score > bestScore) {
      bestScore = score;
      bestField = field;
    }
  }

  return bestField;
}

function findMaxFittingTextIndexByField(
  page: PageRefs,
  row: HljldDisplayRow,
  field: SplittableField,
  fullText: string,
  firstFragment: boolean,
): number {
  let low = 1;
  let high = fullText.length;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    const candidateText = fullText.slice(0, middle);
    const candidateRow = createDisplayRowTr(
      page.pageEl.ownerDocument,
      createSplitRowFragmentByField(
        row,
        field,
        candidateText,
        firstFragment,
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

function createSplitRowFragmentByField(
  row: HljldDisplayRow,
  field: SplittableField,
  fragmentText: string,
  firstFragment: boolean,
  lastFragment: boolean,
): HljldDisplayRow {
  const nextRow: HljldDisplayRow = {
    ...row,
    key: `${row.key}__${field}__fragment__${Math.random().toString(36).slice(2)}`,
    firstLine: firstFragment ? row.firstLine : false,

    timeText: firstFragment ? row.timeText : '',
    medication: firstFragment ? row.medication : undefined,
    enteral: firstFragment ? row.enteral : undefined,
    output: firstFragment ? row.output : undefined,
    drain: firstFragment ? row.drain : undefined,

    examination: firstFragment ? row.examination : '',
    treatment: firstFragment ? row.treatment : '',
    basicCare: firstFragment ? row.basicCare : '',
    healthEducation: firstFragment ? row.healthEducation : '',
    nursingRecord: firstFragment ? row.nursingRecord : '',

    signature: lastFragment ? row.signature : '',
  };

  nextRow[field] = fragmentText as never;

  if (!firstFragment) {
    if (field !== 'examination') nextRow.examination = '';
    if (field !== 'treatment') nextRow.treatment = '';
    if (field !== 'basicCare') nextRow.basicCare = '';
    if (field !== 'healthEducation') nextRow.healthEducation = '';
    if (field !== 'nursingRecord') nextRow.nursingRecord = '';
  }

  return nextRow;
}

function findMaxFittingTextIndex(
  page: PageRefs,
  row: HljldDisplayRow,
  fullText: string,
  firstFragment: boolean,
): number {
  let low = 1;
  let high = fullText.length;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    const candidateText = fullText.slice(0, middle);
    const candidateRow = createDisplayRowTr(
      page.pageEl.ownerDocument,
      createSplitRowFragment(
        row,
        candidateText,
        firstFragment,
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

function createSplitRowFragment(
  row: HljldDisplayRow,
  nursingRecord: string,
  firstFragment: boolean,
  lastFragment: boolean,
): HljldDisplayRow {
  return {
    ...row,
    key: `${row.key}__fragment__${Math.random().toString(36).slice(2)}`,
    firstLine: firstFragment ? row.firstLine : false,
    timeText: firstFragment ? row.timeText : '',
    medication: firstFragment ? row.medication : undefined,
    enteral: firstFragment ? row.enteral : undefined,
    output: firstFragment ? row.output : undefined,
    drain: firstFragment ? row.drain : undefined,
    examination: firstFragment ? row.examination : '',
    treatment: firstFragment ? row.treatment : '',
    basicCare: firstFragment ? row.basicCare : '',
    healthEducation: firstFragment ? row.healthEducation : '',
    nursingRecord,
    signature: lastFragment ? row.signature : '',
  };
}

function appendSummaryBlock(
  page: PageRefs,
  block: Extract<PrintBlock, { kind: 'summary' }>,
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
  const tbodyRect = page.tbodyEl.getBoundingClientRect();
  const tfootRect = page.tfootEl.getBoundingClientRect();

  return tbodyRect.bottom > tfootRect.top - 0.5;
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
    <span class="info-item">床号：<strong>${escapeHtml(vm.patient.bedNo || '—')}</strong></span>
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
    tableEl,
    tbodyEl,
    tfootEl,
    pageNoEl,
  };
}

function finalizePage(page: PageRefs): void {
  removeExistingFillerRow(page);

  const tbodyRect = page.tbodyEl.getBoundingClientRect();
  const tfootRect = page.tfootEl.getBoundingClientRect();
  const remaining = Math.floor(tfootRect.top - tbodyRect.bottom - 1);

  if (remaining <= 1) {
    return;
  }

  const fillerTr = document.createElement('tr');
  fillerTr.className = 'print-filler-row';
  fillerTr.style.setProperty('--filler-height', `${remaining}px`);

  for (let i = 0; i < 17; i += 1) {
    fillerTr.appendChild(document.createElement('td'));
  }

  page.tbodyEl.appendChild(fillerTr);
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

  tr.appendChild(cell(doc, row.examination || ''));
  tr.appendChild(cell(doc, row.treatment || ''));
  tr.appendChild(cell(doc, row.basicCare || ''));
  tr.appendChild(cell(doc, row.healthEducation || ''));
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

  const td = doc.createElement('td');
  td.colSpan = 17;

  td.innerHTML = `
    <section class="print-summary-panel">
      <div class="print-summary-title-row">
        <strong class="print-summary-title">${escapeHtml(summary.label)}</strong>
        <span class="print-summary-period">${escapeHtml(summary.periodText || '')}</span>
      </div>

      <div class="print-summary-line">
        <span>总入量：<span class="print-summary-strong">${formatAmount(summary.totalInput)} ml</span></span>
        ${summary.inputItems.map(item => `
          <span>${escapeHtml(item.label)}：<span class="print-summary-strong">${formatAmount(item.amount)} ml</span></span>
        `).join('')}
      </div>

      <div class="print-summary-line">
        <span>总出量：<span class="print-summary-strong">${formatAmount(summary.totalOutput)} ml</span></span>
        <span>排出物：</span>
        ${summary.outputItems.map(item => `
          <span>${escapeHtml(item.label)}：<span class="print-summary-strong">${formatAmount(item.amount)} ml</span></span>
        `).join('')}
        <span>引流液：</span>
        ${summary.drainItems.map(item => `
          <span>${escapeHtml(item.label)}：<span class="print-summary-strong">${formatAmount(item.amount)} ml</span></span>
        `).join('')}
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
    const current = page.pageNoEl.querySelector('.page-current') as HTMLElement | null;
    const totalNode = page.pageNoEl.querySelector('.page-total') as HTMLElement | null;

    if (!(current instanceof HTMLElement) || !(totalNode instanceof HTMLElement)) {
      throw new Error(`第 ${index + 1} 页页码节点缺失`);
    }

    current.textContent = String(index + 1);
    totalNode.textContent = String(total);
  });
}

function validateGeneratedPages(pages: PageRefs[]): boolean {
  let ok = true;

  for (const [pageIndex, page] of pages.entries()) {
    const current = page.pageNoEl.querySelector('.page-current') as HTMLElement | null;
    const total = page.pageNoEl.querySelector('.page-total') as HTMLElement | null;

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

    const cells = page.pageEl.querySelectorAll('td, th');
    cells.forEach(cellNode => {
      const el = cellNode as HTMLElement;
      if (el.scrollHeight > el.clientHeight + 1) {
        console.error('[HLJLD][print-validate] cell overflow', {
          page: pageIndex + 1,
          text: el.textContent?.slice(0, 60),
        });
        ok = false;
      }
    });
  }

  return ok;
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
