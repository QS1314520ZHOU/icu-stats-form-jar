/**
 * hljld-pagination.core.ts
 *
 * ICU 护理记录单 A4 分页内核。
 * 纯度量分页：在离屏 A4 容器中测量，输出页模型；同输入必定同输出。
 * 屏幕与打印共用同一分页逻辑，保证一致性。
 */

import {
  HljldDisplayRow,
  HljldSummary,
  HljldTimelineItem,
  HljldViewModel,
} from './hljld-form.models';

// ── 常量 ──

export const HLJLD_COLSPAN = 19;

export const HLJLD_COLUMNS: ReadonlyArray<{ key: string; className: string; width: string }> = [
  { key: 'time', className: 'col-time', width: '7%' },
  { key: 'med-name', className: 'col-med-name', width: '5.5%' },
  { key: 'med-amount', className: 'col-med-amount', width: '3.5%' },
  { key: 'med-route', className: 'col-med-route', width: '4%' },
  { key: 'enteral-name', className: 'col-enteral-name', width: '5.5%' },
  { key: 'enteral-amount', className: 'col-enteral-amount', width: '3.5%' },
  { key: 'enteral-route', className: 'col-enteral-route', width: '4%' },
  { key: 'urine', className: 'col-urine', width: '4%' },
  { key: 'ultrafiltration', className: 'col-ultrafiltration', width: '4%' },
  { key: 'output-name', className: 'col-output-name', width: '5.5%' },
  { key: 'output-amount', className: 'col-output-amount', width: '3.5%' },
  { key: 'drain-name', className: 'col-drain-name', width: '5.5%' },
  { key: 'drain-amount', className: 'col-drain-amount', width: '3.5%' },
  { key: 'check', className: 'col-check', width: '5%' },
  { key: 'treatment', className: 'col-treatment', width: '5%' },
  { key: 'basic-care', className: 'col-basic-care', width: '5%' },
  { key: 'health', className: 'col-health', width: '5%' },
  { key: 'nursing', className: 'col-nursing', width: '18%' },
  { key: 'sign', className: 'col-sign', width: '6%' },
];

// ── 类型 ──

export type HljldPageItem =
  | { kind: 'time-group'; key: string; timestamp: number; rows: HljldDisplayRow[] }
  | { kind: 'summary'; key: string; timestamp: number; summaryClassName: string; summary: HljldSummary }
  | { kind: 'empty' };

export interface HljldPageModel {
  /** 本次打印任务内的全局页序，1-based */
  indexInDay: number;
  items: HljldPageItem[];
  /** 仅当日最后一页 true */
  showRemark: boolean;
  lastOfDay: boolean;
}

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

// ── 页码格式化 ──

/** 页码 = 本次任务内的页序，从 1 开始 */
export function formatHljldPageNo(indexInJob: number): string {
  return `第 ${indexInJob} 页`;
}

// ── 分页主函数 ──

/**
 * 纯度量分页：在离屏 A4 容器中测量，输出页模型。
 * 同输入必定同输出。
 */
export function paginateHljld(
  doc: Document,
  host: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  pageOffset = 0,
): HljldPageModel[] {
  const blocks = buildPrintBlocks(vm.timeline);

  // 空 timeline：输出 1 页「该护理日暂无记录」
  if (blocks.length === 0) {
    return [{
      indexInDay: pageOffset + 1,
      items: [{ kind: 'empty' }],
      showRemark: true,
      lastOfDay: true,
    }];
  }

  const pages = paginateToPages(doc, host, vm, remarkLines, blocks);

  // 转换为 HljldPageModel，用原始 summary 数据（含 detailLines）替换 DOM 提取的空壳
  const models: HljldPageModel[] = pages.map((pw, index) => {
    const domItems = extractPageItems(pw.page);
    // 用原始 summary 数据替换 DOM 中提取的空壳 summary
    const items: HljldPageItem[] = domItems.map(domItem => {
      if (domItem.kind !== 'summary') return domItem;
      const original = pw.summaryBlocks.find(
        b => b.summary.kind === domItem.summary.kind
          && b.summary.periodStart === domItem.summary.periodStart
          && b.summary.periodEnd === domItem.summary.periodEnd,
      );
      return original
        ? { ...domItem, summary: original.summary }
        : domItem;
    });
    return {
      indexInDay: pageOffset + index + 1,
      items,
      showRemark: index === pages.length - 1,
      lastOfDay: index === pages.length - 1,
    };
  });

  // 清理度量用 DOM 元素，避免与后续 renderPageModel 生成的页面重复
  pages.forEach(pw => pw.page.pageEl.remove());

  return models;
}

/**
 * 计算页数（不生成完整模型）。
 */
export function countHljldPages(
  doc: Document,
  host: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
): number {
  return paginateHljld(doc, host, vm, remarkLines).length;
}

// ── 内部实现 ──

function buildPrintBlocks(timeline: HljldTimelineItem[]): PrintBlock[] {
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

interface PageWithSummaries {
  page: PageRefs;
  summaryBlocks: SummaryPrintBlock[];
}

function paginateToPages(
  doc: Document,
  root: HTMLElement,
  vm: HljldViewModel,
  remarkLines: string[],
  blocks: PrintBlock[],
): PageWithSummaries[] {
  const pages: PageWithSummaries[] = [];
  let firstPage = createPage(doc, vm, remarkLines);
  root.appendChild(firstPage.pageEl);
  pages.push({ page: firstPage, summaryBlocks: [] });

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const current = pages[pages.length - 1];

    if (block.kind === 'summary') {
      // 收集连续同时间戳的 summary 组
      const { summaries, nextIndex } = collectSummaryGroup(blocks, i);

      // 尝试整组加入当前页
      if (appendSummaryGroup(current.page, summaries)) {
        current.summaryBlocks.push(...summaries);
        i = nextIndex;
        continue;
      }

      // 整组放不下当前页：先 finalize 当前页
      finalizePage(current.page);

      const newPage = createPage(doc, vm, remarkLines);
      root.appendChild(newPage.pageEl);
      const newEntry: PageWithSummaries = { page: newPage, summaryBlocks: [] };
      pages.push(newEntry);

      // 在新页尝试整组加入
      if (appendSummaryGroup(newPage, summaries)) {
        newEntry.summaryBlocks.push(...summaries);
        i = nextIndex;
        continue;
      }

      // 整组在空白页也放不下：逐个尝试
      for (const summary of summaries) {
        if (!appendSummaryBlock(newPage, summary)) {
          throw new Error(
            `总结块 ${summary.key} 超出单页容量，请检查样式或内容。` +
            `\n  kind=${summary.summary?.kind} label=${summary.summary?.label} period=${summary.summary?.periodText}` +
            `\n  className=${summary.summaryClassName}`,
          );
        }
        newEntry.summaryBlocks.push(summary);
      }
      i = nextIndex;
      continue;
    }

    appendTimeGroupBlock(doc, root, vm, remarkLines, pages.map(p => p.page), block);
    i += 1;
  }

  pages.forEach(pw => finalizePage(pw.page));
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
    lastLine: lastOverallFragment ? row.lastLine : false,

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

    // 签名跟随行的末尾片段，非末行本身 signature 已为空
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
    <span class="page-current"></span>
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

  for (const col of HLJLD_COLUMNS) {
    const colEl = doc.createElement('col');
    colEl.className = col.className;
    colgroup.appendChild(colEl);
  }

  return colgroup;
}

function createThead(doc: Document): HTMLTableSectionElement {
  const thead = doc.createElement('thead');

  const row1 = doc.createElement('tr');
  row1.innerHTML = `
    <th rowspan="2">日期时间</th>
    <th colspan="3">药物治疗</th>
    <th colspan="3">胃肠摄入</th>
    <th rowspan="2">尿量(ml)</th>
    <th rowspan="2">净超滤量(ml)</th>
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
  td.colSpan = 18;

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

  tr.appendChild(cell(doc, row.urine ?? ''));
  tr.appendChild(cell(doc, row.ultrafiltration ?? ''));

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
  td.colSpan = 19;

  let detailLinesHtml = '';
  for (const line of summary.detailLines) {
    detailLinesHtml += '<div class="print-summary-line"><span>';
    for (const token of line) {
      if (token.strong) {
        detailLinesHtml += '<span class="print-summary-strong">' + escapeHtml(token.text) + '</span>';
      } else if (token.sep) {
        detailLinesHtml += '<span class="print-summary-sep">' + escapeHtml(token.text) + '</span>';
      } else {
        detailLinesHtml += escapeHtml(token.text);
      }
    }
    detailLinesHtml += '</span></div>';
  }

  td.innerHTML = `
    <section class="print-summary-panel">
      <div class="print-summary-title-row">
        <strong class="print-summary-title">${escapeHtml(summary.label)}</strong>
        <span class="print-summary-period">${escapeHtml(summary.periodText || '')}</span>
      </div>
      ${detailLinesHtml}
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

function removeNodes(nodes: HTMLElement[]): void {
  nodes.forEach(node => node.remove());
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * 从 PageRefs 中提取页面项目（用于 HljldPageModel）。
 */
function extractPageItems(page: PageRefs): HljldPageItem[] {
  const items: HljldPageItem[] = [];
  const rows = Array.from(page.tbodyEl.children) as HTMLElement[];

  for (const row of rows) {
    if (row.classList.contains('print-filler-row')) {
      continue;
    }

    if (row.classList.contains('print-summary-row')) {
      const kind = row.dataset['summaryKind'] as HljldSummary['kind'] || 'day';
      const summaryClassName = Array.from(row.classList).find(c => c.startsWith('print-summary-')) || '';
      // 从行中重建 summary 对象（简化版，实际应该存储完整对象）
      items.push({
        kind: 'summary',
        key: row.dataset['summaryIdentity'] || '',
        timestamp: 0,
        summaryClassName,
        summary: {
          kind,
          label: row.dataset['summaryLabel'] || '',
          periodText: row.dataset['summaryPeriod'] || '',
          plannedStart: 0,
          plannedEnd: 0,
          periodStart: Number(row.dataset['summaryPeriodStart']) || 0,
          periodEnd: Number(row.dataset['summaryPeriodEnd']) || 0,
          admissionClipped: false,
          dischargeClipped: false,
          available: true,
          totalInput: 0,
          inputItems: [],
          totalOutput: 0,
          outputItems: [],
          drainItems: [],
          balance: 0,
          drugTreatmentTotal: 0,
          drugTreatmentItems: [],
          gastrointestinalInputTotal: 0,
          gastrointestinalInputItems: [],
          excretionTotal: 0,
          drainTotal: 0,
          urineTotal: 0,
          ultrafiltrationTotal: 0,
          detailLines: [],
        },
      });
    } else {
      // 时间组行：提取行数据
      const displayRow = extractDisplayRowFromTr(row);
      if (displayRow) {
        // 查找是否已有同组
        const existingGroup = items.find(
          item => item.kind === 'time-group' && item.key === displayRow.groupKey,
        ) as Extract<HljldPageItem, { kind: 'time-group' }> | undefined;

        if (existingGroup) {
          existingGroup.rows.push(displayRow);
        } else {
          items.push({
            kind: 'time-group',
            key: displayRow.groupKey,
            timestamp: displayRow.timestamp,
            rows: [displayRow],
          });
        }
      }
    }
  }

  return items;
}

/**
 * 从 TR 元素提取 HljldDisplayRow（简化版）。
 * 注意：这只是为了构建页面模型，实际数据应该从原始 vm 中获取。
 */
function extractDisplayRowFromTr(tr: HTMLElement): HljldDisplayRow | null {
  const cells = Array.from(tr.children) as HTMLElement[];
  if (cells.length < 19) {
    return null;
  }

  const getText = (el: HTMLElement) => el?.textContent?.trim() || '';

  return {
    key: `row-${Math.random().toString(36).slice(2)}`,
    groupKey: tr.getAttribute('data-print-group') || '',
    timestamp: 0,
    lineIndex: 0,
    firstLine: !tr.classList.contains('continuation-row'),
    lastLine: true,
    timeText: getText(cells[0]),
    medication: {
      name: getText(cells[1]),
      amount: getText(cells[2]),
      route: getText(cells[3]),
      numericAmount: 0,
    },
    enteral: {
      name: getText(cells[4]),
      amount: getText(cells[5]),
      route: getText(cells[6]),
      numericAmount: 0,
    },
    urine: getText(cells[7]),
    ultrafiltration: getText(cells[8]),
    output: {
      name: getText(cells[9]),
      amount: getText(cells[10]),
      numericAmount: 0,
    },
    drain: {
      name: getText(cells[11]),
      amount: getText(cells[12]),
      numericAmount: 0,
    },
    examination: getText(cells[13]),
    treatment: getText(cells[14]),
    basicCare: getText(cells[15]),
    healthEducation: getText(cells[16]),
    nursingRecord: getText(cells[17]),
    signature: getText(cells[18]),
  };
}

// ── 校验函数 ──

/**
 * 校验生成的页面：检查溢出、备注完整性等。
 */
export function validateGeneratedPages(pages: PageRefs[]): boolean {
  let ok = true;
  const overflowTolerance = 2;

  for (const [pageIndex, page] of pages.entries()) {
    const current = page.pageNoEl.querySelector('.page-current');

    if (!current?.textContent?.trim()) {
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
export function validateSummarySequence(pages: PageRefs[]): boolean {
  const rows = pages.flatMap(page =>
    Array.from(
      page.tbodyEl.querySelectorAll<HTMLElement>('.print-summary-row'),
    ),
  );
  const identities = rows.map(row => [
    row.dataset['summaryKind'],
    row.dataset['summaryPeriodStart'],
    row.dataset['summaryPeriodEnd'],
  ].join('|'));
  if (new Set(identities).size !== identities.length) {
    console.error('[HLJLD][print-validate] duplicate summaries found');
    return false;
  }
  return true;
}
