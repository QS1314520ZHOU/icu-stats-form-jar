/**
 * 患者交班表打印分页工具。
 *
 * 通过屏幕外 DOM 测量实际行高，将长患者行拆分为多个打印片段，
 * 并分配到多个打印页面中。
 *
 * A4 横向：纸张 297mm × 210mm，7mm 四边边距 → 有效 283mm × 196mm。
 */
import {
  HandoverPatientPrintFragment,
  HandoverPatientPrintPage,
  HandoverPatientRow,
  ShiftKey,
} from './handover-report.models';

// ==================== 常量 ====================

/** A4 横向有效打印高度 mm */
const PAGE_HEIGHT_MM = 196;

/** 页面安全间距 mm */
const PAGE_SAFETY_GAP_MM = 2;

/** 最小片段高度：3 行 text line-height (约 4.2mm) + padding (2mm) ≈ 6mm */
const MIN_FRAGMENT_HEIGHT_MM = 6;

/** px → mm（96dpi：1mm ≈ 3.7795px） */
function pxToMm(px: number): number {
  return px / 3.7795;
}

// ==================== 测量 ====================

/**
 * 测量打印相关 DOM 元素的高度。
 * 调用前必须确保字体已加载、Angular 已 detectChanges、渲染已稳定。
 */
export function measurePrintDimensions(
  doc: Document,
): {
  pageHeight: number;
  reportHeaderHeight: number;
  patientTableHeaderHeight: number;
  signatureHeight: number;
} {
  const pageEl = doc.querySelector('.handover-print-page') as HTMLElement | null;
  const pageHeight = pageEl
    ? pxToMm(pageEl.getBoundingClientRect().height)
    : PAGE_HEIGHT_MM;

  const reportHeaderEl = doc.querySelector('.print-report-header') as HTMLElement | null;
  const reportHeaderHeight = reportHeaderEl
    ? pxToMm(reportHeaderEl.getBoundingClientRect().height)
    : 0;

  const patientTheadEl = doc.querySelector('.print-patient-table thead') as HTMLElement | null;
  const patientTableHeaderHeight = patientTheadEl
    ? pxToMm(patientTheadEl.getBoundingClientRect().height)
    : 0;

  const patientTfootEl = doc.querySelector('.print-patient-table tfoot') as HTMLElement | null;
  const signatureHeight = patientTfootEl
    ? pxToMm(patientTfootEl.getBoundingClientRect().height)
    : 0;

  return {
    pageHeight,
    reportHeaderHeight,
    patientTableHeaderHeight,
    signatureHeight,
  };
}

/**
 * 测量屏幕外测量容器中每个患者行的高度。
 */
export function measurePatientRowHeights(
  rows: HandoverPatientRow[],
  measureHost: HTMLElement,
  doc: Document,
): number[] {
  // 找到测量表格
  const table = measureHost.querySelector('.measure-patient-table') as HTMLTableElement;
  if (!table) return rows.map(() => 20); // 兜底估计

  // 确保 thead 存在
  let thead = table.querySelector('thead') as HTMLElement;
  if (!thead) {
    thead = doc.createElement('thead');
    thead.innerHTML = `<tr>
      <th>床号</th><th>姓名</th><th>状态</th><th>住院号</th><th>诊断</th>
      <th>白班</th><th>中班</th><th>夜班</th>
    </tr>`;
    table.prepend(thead);
  }

  // 确保 tbody 存在
  let tbody = table.querySelector('tbody') as HTMLElement;
  if (!tbody) {
    tbody = doc.createElement('tbody');
    table.appendChild(tbody);
  }

  const heights: number[] = [];

  for (const row of rows) {
    const tr = doc.createElement('tr');
    tr.className = 'measure-row';
    const statusDisplay = ['死亡', '转入', '入院', '手术'].includes(row.status)
      ? `"${row.status}"`
      : row.status;

    tr.innerHTML = `
      <td>${escapeHtml(row.bedNo ? (row.bedNo.endsWith('床') ? row.bedNo : row.bedNo + '床') : '')}</td>
      <td>${escapeHtml(row.name)}</td>
      <td class="patient-status-cell">${escapeHtml(statusDisplay)}</td>
      <td>${escapeHtml(row.mrn)}</td>
      <td style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(row.diagnosis)}</td>
      ${(['day', 'evening', 'night'] as ShiftKey[]).map(s => {
        const text = row.shiftTexts[s] || '';
        return `<td style="white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(text)}</td>`;
      }).join('')}
    `;

    tbody.appendChild(tr);
    const h = pxToMm(tr.getBoundingClientRect().height);
    heights.push(h);
    tbody.removeChild(tr);
  }

  return heights;
}

// ==================== 分页算法 ====================

/**
 * 将患者行分配到多个打印页面。
 * 长患者行会被拆分为多个片段。
 */
export function paginatePatientRows(
  rows: HandoverPatientRow[],
  rowHeights: number[],
  dims: {
    pageHeight: number;
    reportHeaderHeight: number;
    patientTableHeaderHeight: number;
    signatureHeight: number;
  },
): HandoverPatientPrintPage[] {
  const pages: HandoverPatientPrintPage[] = [];

  if (rows.length === 0) {
    pages.push({
      pageIndex: 0,
      showReportHeader: true,
      showPatientHeader: true,
      showSignature: true,
      fragments: [],
    });
    return pages;
  }

  // 第一页可用高度 = 页面高度 - 报告头部 - 患者表头 - 安全间距
  let availableHeight = dims.pageHeight - dims.reportHeaderHeight
    - dims.patientTableHeaderHeight - PAGE_SAFETY_GAP_MM;

  let isFirstPage = true;
  let currentPageFragments: HandoverPatientPrintFragment[] = [];
  let pageIdx = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fullHeight = rowHeights[i];
    const isLastRow = i === rows.length - 1;

    // 签名预留（仅最后一页）
    const signatureReserve = isLastRow ? dims.signatureHeight : 0;
    const effectiveAvailable = availableHeight - signatureReserve;

    if (fullHeight <= effectiveAvailable + 0.5) {
      // 完整行能放下
      currentPageFragments.push(createFullFragment(row, currentPageFragments.length === 0 || currentPageFragments[0].sourceRowKey !== row.key));
      availableHeight -= fullHeight;
    } else {
      // 完整行放不下，尝试拆分
      if (currentPageFragments.length > 0) {
        // 当前页有内容，结束当前页
        pages.push({
          pageIndex: pageIdx++,
          showReportHeader: isFirstPage,
          showPatientHeader: true,
          showSignature: false,
          fragments: currentPageFragments,
        });
        currentPageFragments = [];
        isFirstPage = false;
        availableHeight = dims.pageHeight - dims.patientTableHeaderHeight - PAGE_SAFETY_GAP_MM;
      }

      // 尝试在新页拆分患者行
      const fragments = splitRowIntoFragments(
        row, fullHeight, availableHeight, dims, signatureReserve,
      );

      for (let f = 0; f < fragments.length; f++) {
        const frag = fragments[f];
        const fragHeight = f === 0 ? fullHeight : estimateFragmentHeight(frag);

        if (fragHeight <= availableHeight - signatureReserve + 0.5 || currentPageFragments.length === 0) {
          currentPageFragments.push(frag);
          availableHeight -= fragHeight;
        } else {
          // 片段放不下，结束当前页
          pages.push({
            pageIndex: pageIdx++,
            showReportHeader: isFirstPage,
            showPatientHeader: true,
            showSignature: false,
            fragments: currentPageFragments,
          });
          currentPageFragments = [frag];
          isFirstPage = false;
          availableHeight = dims.pageHeight - dims.patientTableHeaderHeight - PAGE_SAFETY_GAP_MM - fragHeight;
        }
      }
    }
  }

  // 输出最后一页
  if (currentPageFragments.length > 0) {
    pages.push({
      pageIndex: pageIdx++,
      showReportHeader: isFirstPage,
      showPatientHeader: true,
      showSignature: true,
      fragments: currentPageFragments,
    });
  }

  return pages;
}

// ==================== 片段拆分 ====================

/**
 * 将一个患者行拆分为多个打印片段。
 */
function splitRowIntoFragments(
  row: HandoverPatientRow,
  fullHeight: number,
  availableHeight: number,
  dims: {
    pageHeight: number;
    reportHeaderHeight: number;
    patientTableHeaderHeight: number;
    signatureHeight: number;
  },
  signatureReserve: number,
): HandoverPatientPrintFragment[] {
  const fragments: HandoverPatientPrintFragment[] = [];

  // 三个班次的文本
  const shiftKeys: ShiftKey[] = ['day', 'evening', 'night'];
  const shiftTexts: Record<ShiftKey, string> = {
    day: row.shiftTexts.day || '',
    evening: row.shiftTexts.evening || '',
    night: row.shiftTexts.night || '',
  };

  let fragmentIndex = 0;
  let remaining: Record<ShiftKey, string> = { ...shiftTexts };

  while (hasContent(remaining)) {
    const isFirst = fragmentIndex === 0;
    const effectiveAvailable = fragmentIndex === 0
      ? availableHeight
      : dims.pageHeight - dims.patientTableHeaderHeight - PAGE_SAFETY_GAP_MM - signatureReserve;

    // 尝试找到能放入当前页的最大文本前缀
    const splitResult = findBestSplit(remaining, effectiveAvailable);

    if (!splitResult && fragmentIndex > 0) {
      // 无法放入任何内容，强制放入至少一个字符
      fragments.push(createFragment(row, fragmentIndex, isFirst, false, {
        day: remaining.day.slice(0, 1) || '',
        evening: remaining.evening.slice(0, 1) || '',
        night: remaining.night.slice(0, 1) || '',
      }));
      remaining = {
        day: remaining.day.slice(1) || '',
        evening: remaining.evening.slice(1) || '',
        night: remaining.night.slice(1) || '',
      };
      fragmentIndex++;
      continue;
    }

    if (!splitResult && fragmentIndex === 0) {
      // 第一个片段也放不下，强制放入
      fragments.push(createFragment(row, fragmentIndex, true, false, { ...remaining }));
      break;
    }

    const prefix = splitResult!;
    const isLast = !hasContent({
      day: remaining.day.slice(prefix.day.length),
      evening: remaining.evening.slice(prefix.evening.length),
      night: remaining.night.slice(prefix.night.length),
    });

    fragments.push(createFragment(row, fragmentIndex, isFirst, isLast, prefix));

    remaining = {
      day: remaining.day.slice(prefix.day.length),
      evening: remaining.evening.slice(prefix.evening.length),
      night: remaining.night.slice(prefix.night.length),
    };
    fragmentIndex++;
  }

  // 如果没有产生任何片段（空患者）
  if (fragments.length === 0) {
    fragments.push(createFullFragment(row, true));
  }

  return fragments;
}

/**
 * 在三个班次中找到能放入当前可用高度的最大文本前缀。
 * 使用二分查找在真实 DOM 中测量。
 */
function findBestSplit(
  texts: Record<ShiftKey, string>,
  availableHeight: number,
): Record<ShiftKey, string> | null {
  const shiftKeys: ShiftKey[] = ['day', 'evening', 'night'];

  // 如果所有文本都为空，返回 null
  if (shiftKeys.every(k => !texts[k])) return null;

  // 找到最长的文本作为二分查找的上限
  const maxLen = Math.max(...shiftKeys.map(k => texts[k].length));
  if (maxLen === 0) return null;

  // 二分查找：找到能放入的最大长度
  let lo = 0;
  let hi = maxLen;
  let best: Record<ShiftKey, string> | null = null;

  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate: Record<ShiftKey, string> = {
      day: texts.day.slice(0, Math.min(mid, texts.day.length)),
      evening: texts.evening.slice(0, Math.min(mid, texts.evening.length)),
      night: texts.night.slice(0, Math.min(mid, texts.night.length)),
    };

    const height = measureCandidateHeight(candidate);
    if (height <= availableHeight + 0.5) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

/**
 * 测量候选文本在测量容器中的高度。
 */
function measureCandidateHeight(texts: Record<ShiftKey, string>): number {
  const host = document.querySelector('.print-measure-host');
  if (!host) return 999; // 无法测量时返回大值

  const table = host.querySelector('.measure-patient-table') as HTMLTableElement;
  if (!table) return 999;

  let tbody = table.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
  }

  const tr = document.createElement('tr');
  tr.className = 'measure-candidate';
  tr.innerHTML = `
    <td>测量</td>
    <td>测量</td>
    <td>测量</td>
    <td>测量</td>
    <td style="white-space:pre-wrap;word-break:break-word;">测量</td>
    ${(['day', 'evening', 'night'] as ShiftKey[]).map(s => {
      const text = texts[s] || '';
      return `<td style="white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(text)}</td>`;
    }).join('')}
  `;

  tbody.appendChild(tr);
  const height = pxToMm(tr.getBoundingClientRect().height);
  tbody.removeChild(tr);

  return height;
}

// ==================== 片段创建 ====================

function createFullFragment(row: HandoverPatientRow, isFirst: boolean): HandoverPatientPrintFragment {
  const statusDisplay = ['死亡', '转入', '入院', '手术'].includes(row.status)
    ? `"${row.status}"`
    : row.status;

  return {
    fragmentKey: `${row.key}_f0`,
    sourceRowKey: row.key,
    fragmentIndex: 0,
    isFirstFragment: isFirst,
    isLastFragment: true,
    bedNo: row.bedNo,
    name: row.name,
    status: statusDisplay,
    mrn: row.mrn,
    diagnosis: row.diagnosis,
    shiftTexts: { ...row.shiftTexts },
  };
}

function createFragment(
  row: HandoverPatientRow,
  fragmentIndex: number,
  isFirst: boolean,
  isLast: boolean,
  shiftTexts: Record<ShiftKey, string>,
): HandoverPatientPrintFragment {
  const statusDisplay = ['死亡', '转入', '入院', '手术'].includes(row.status)
    ? `"${row.status}"`
    : row.status;

  const suffix = isFirst ? '' : '（续）';

  return {
    fragmentKey: `${row.key}_f${fragmentIndex}`,
    sourceRowKey: row.key,
    fragmentIndex,
    isFirstFragment: isFirst,
    isLastFragment: isLast,
    bedNo: row.bedNo + suffix,
    name: row.name,
    status: statusDisplay,
    mrn: row.mrn,
    diagnosis: row.diagnosis,
    shiftTexts,
  };
}

function estimateFragmentHeight(_frag: HandoverPatientPrintFragment): number {
  // 简单估计：至少 MIN_FRAGMENT_HEIGHT_MM
  return MIN_FRAGMENT_HEIGHT_MM;
}

// ==================== 工具 ====================

function hasContent(texts: Record<ShiftKey, string>): boolean {
  return texts.day.length > 0 || texts.evening.length > 0 || texts.night.length > 0;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
