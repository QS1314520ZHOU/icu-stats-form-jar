import {
  HljldDisplayRow,
  HljldSummary,
  HljldTimelineItem,
  HljldViewModel,
} from './hljld-form.models';
import { HljldPageModel, paginateHljld, formatHljldPageNo, addTrailingBlankRows } from './hljld-pagination.core';
import { HLJLD_SHEET_CSS } from './hljld-sheet.styles';

type PrintInput = {
  vm: HljldViewModel;
  remarkLines: string[];
};

/**
 * 打印单天护理记录（iframe 方式）。
 * 使用分页内核获取页模型，渲染到隐藏 iframe 后触发打印。
 * 返回打印页数。
 */
export async function printHljldRecord({
  vm,
  remarkLines,
}: PrintInput): Promise<number> {
  // 创建隐藏 iframe
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(ifr);

  try {
    const ifrDoc = ifr.contentDocument || ifr.contentWindow?.document;
    if (!ifrDoc) {
      throw new Error('无法创建打印 iframe');
    }

    ifrDoc.open();
    ifrDoc.write(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>护理记录打印</title>
  <style>${HLJLD_SHEET_CSS}</style>
</head>
<body>
  <div id="print-root" class="print-root"></div>
</body>
</html>`);
    ifrDoc.close();

    // 等待 iframe 加载完成
    await new Promise<void>(resolve => {
      if (ifrDoc.readyState === 'complete') { resolve(); return; }
      ifr.onload = () => resolve();
      setTimeout(resolve, 3000);
    });

    // 等待字体加载
    try {
      const fonts = ifrDoc.fonts;
      if (fonts?.ready) {
        await Promise.race([fonts.ready, timeout(3000)]);
      }
    } catch { /* 忽略 */ }

    await nextTwoFrames(ifr.contentWindow!);

    const root = ifrDoc.getElementById('print-root');
    if (!root) {
      throw new Error('打印根节点初始化失败。');
    }

    // 使用分页内核获取页模型
    const pageModels = paginateHljld(ifrDoc, root, vm, remarkLines);

    // 渲染每一页
    for (const pageModel of pageModels) {
      const pageEl = renderPageModel(ifrDoc, vm, remarkLines, pageModel);
      root.appendChild(pageEl);
    }

    // 最后一页添加空白行 + "以下空白"
    addTrailingBlankRows(root, ifrDoc);

    // 更新页码为 "第X页/共Y页" 格式
    updatePageNumbers(root, pageModels.length);

    await nextTwoFrames(ifr.contentWindow!);
    ifr.contentWindow!.focus();
    await nextTwoFrames(ifr.contentWindow!);
    ifr.contentWindow!.print();

    setTimeout(() => {
      try { ifr.remove(); } catch { /* ignore */ }
    }, 1000);

    return pageModels.length;
  } catch (error) {
    console.error('[HLJLD][print-error]', error);
    try { ifr.remove(); } catch { /* ignore */ }
    throw error;
  }
}

/**
 * 批量打印多天护理记录，页码从 1 连续递增。
 * 返回总页数和每日页数。
 */
export async function printAllHljldRecords({
  vms,
  remarkLines,
}: {
  vms: HljldViewModel[];
  remarkLines: string[];
}): Promise<{ totalPages: number; pageCounts: number[] }> {
  if (vms.length === 0) {
    return { totalPages: 0, pageCounts: [] };
  }

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
  <style>${HLJLD_SHEET_CSS}</style>
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

    let totalPages = 0;
    const pageCounts: number[] = [];

    for (const vm of vms) {
      // 使用分页内核获取页模型，传入累计页码偏移实现连续编号
      const pageModels = paginateHljld(printWindow.document, root, vm, remarkLines, totalPages);

      // 渲染每一页
      for (const pageModel of pageModels) {
        pageModel.showRemark = true;
        const pageEl = renderPageModel(printWindow.document, vm, remarkLines, pageModel);
        root.appendChild(pageEl);
      }

      totalPages += pageModels.length;
      pageCounts.push(pageModels.length);
    }

    await nextTwoFrames(printWindow);

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

    return { totalPages, pageCounts };
  } catch (error) {
    console.error('[HLJLD][print-all-error]', error);
    try {
      printWindow.close();
    } catch {
      // ignore
    }
    throw error;
  }
}

/**
 * 通过隐藏 iframe 打印多天护理记录（推荐方式）。
 * iframe 隔离了主页面的 flex/grid 布局和第三方 CSS，排版更稳定。
 * 返回总页数。
 */
export async function printAllViaIframe({
  vms,
  remarkLines,
}: {
  vms: HljldViewModel[];
  remarkLines: string[];
}): Promise<{ totalPages: number; pageCounts: number[] }> {
  if (vms.length === 0) {
    return { totalPages: 0, pageCounts: [] };
  }

  // 1. 创建隐藏 iframe
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(ifr);

  try {
    const ifrDoc = ifr.contentDocument || ifr.contentWindow?.document;
    if (!ifrDoc) {
      throw new Error('无法创建打印 iframe');
    }

    // 2. 写入完整 HTML + CSS
    ifrDoc.open();
    ifrDoc.write(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>护理记录打印</title>
  <style>${HLJLD_SHEET_CSS}</style>
</head>
<body>
  <div id="print-root" class="print-root"></div>
</body>
</html>`);
    ifrDoc.close();

    // 3. 等待 iframe 加载完成
    await new Promise<void>(resolve => {
      if (ifrDoc.readyState === 'complete') {
        resolve();
        return;
      }
      ifr.onload = () => resolve();
      // 超时兜底
      setTimeout(resolve, 3000);
    });

    // 4. 等待字体加载（关键：中文字体没就绪时测出来的行高会偏小）
    try {
      const fonts = ifrDoc.fonts;
      if (fonts?.ready) {
        await Promise.race([fonts.ready, timeout(3000)]);
      }
    } catch { /* 忽略字体加载错误 */ }

    await nextTwoFrames(ifr.contentWindow!);

    const root = ifrDoc.getElementById('print-root');
    if (!root) {
      throw new Error('打印根节点初始化失败');
    }

    // 5. 使用分页内核获取页模型
    let totalPages = 0;
    const pageCounts: number[] = [];
    for (const vm of vms) {
      const pageModels = paginateHljld(ifrDoc, root, vm, remarkLines, totalPages);

      // 渲染每一页
      for (const pageModel of pageModels) {
        pageModel.showRemark = true;
        const pageEl = renderPageModel(ifrDoc, vm, remarkLines, pageModel);
        root.appendChild(pageEl);
      }

      totalPages += pageModels.length;
      pageCounts.push(pageModels.length);
    }

    // 6. 在最后一页添加空白行 + "以下空白"
    addTrailingBlankRows(root, ifrDoc);

    // 7. 更新所有页码为 "第X页/共Y页" 格式
    updatePageNumbers(root, totalPages);

    // 8. 等待布局稳定后触发打印
    await nextTwoFrames(ifr.contentWindow!);
    ifr.contentWindow!.focus();
    await nextTwoFrames(ifr.contentWindow!);
    ifr.contentWindow!.print();

    // 延迟移除 iframe
    setTimeout(() => {
      try { ifr.remove(); } catch { /* ignore */ }
    }, 1000);

    return { totalPages, pageCounts };
  } catch (error) {
    console.error('[HLJLD][print-iframe-error]', error);
    try { ifr.remove(); } catch { /* ignore */ }
    throw error;
  }
}

/**
 * 将所有页码从 "第X页" 更新为 "第X页/共Y页" 格式
 */
function updatePageNumbers(root: HTMLElement, totalPages: number): void {
  const pageCurrents = root.querySelectorAll('.page-current');
  pageCurrents.forEach((el, i) => {
    el.textContent = `第 ${i + 1} 页 / 共 ${totalPages} 页`;
  });
}

// ── 内部辅助函数 ──

function renderPageModel(
  doc: Document,
  vm: HljldViewModel,
  remarkLines: string[],
  pageModel: HljldPageModel,
): HTMLElement {
  const pageEl = doc.createElement('div');
  pageEl.className = 'print-page';

  const sheet = doc.createElement('div');
  sheet.className = 'sheet';

  // 表头
  const head = doc.createElement('div');
  head.className = 'sheet-head';

  const titleLine = doc.createElement('div');
  titleLine.className = 'title-line';
  titleLine.textContent = '重钢总医院重症医学科护理记录单';
  head.appendChild(titleLine);

  const patientInfoRow = doc.createElement('div');
  patientInfoRow.className = 'patient-info-row';

  const addInfoItem = (label: string, value: string) => {
    const span = doc.createElement('span');
    span.className = 'info-item';
    const strong = doc.createElement('strong');
    strong.textContent = value || '—';
    span.textContent = label;
    span.appendChild(strong);
    patientInfoRow.appendChild(span);
  };

  addInfoItem('床号：', vm.patient.bedNo ? (vm.patient.bedNo.endsWith('床') ? vm.patient.bedNo : vm.patient.bedNo + '床') : '');
  addInfoItem('姓名：', vm.patient.name || '');
  addInfoItem('住院号：', vm.patient.mrn || '');
  addInfoItem('性别：', vm.patient.sex || '');
  addInfoItem('年龄：', String(vm.patient.age || ''));

  const diagnosisItem = doc.createElement('span');
  diagnosisItem.className = 'diagnosis-item';
  const diagStrong = doc.createElement('strong');
  diagStrong.textContent = vm.patient.diagnosis || '—';
  diagnosisItem.textContent = '诊断：';
  diagnosisItem.appendChild(diagStrong);
  patientInfoRow.appendChild(diagnosisItem);

  head.appendChild(patientInfoRow);
  sheet.appendChild(head);

  // 表格区域
  const tableWrap = doc.createElement('div');
  tableWrap.className = 'print-table-wrap';

  const table = doc.createElement('table');
  table.className = 'print-record-table';

  // colgroup
  const colgroup = doc.createElement('colgroup');
  const colClasses = [
    'col-time', 'col-med-name', 'col-med-amount', 'col-med-route',
    'col-enteral-name', 'col-enteral-amount', 'col-enteral-route',
    'col-urine', 'col-ultrafiltration',
    'col-output-name', 'col-output-amount', 'col-drain-name', 'col-drain-amount',
    'col-check', 'col-treatment', 'col-basic-care', 'col-health',
    'col-nursing', 'col-sign',
  ];
  for (const cls of colClasses) {
    const col = doc.createElement('col');
    col.className = cls;
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  // thead
  const thead = doc.createElement('thead');

  // 第一行
  const firstRow = doc.createElement('tr');
  const addTh = (text: string, rowspan?: number, colspan?: number) => {
    const th = doc.createElement('th');
    th.textContent = text;
    if (rowspan) th.rowSpan = rowspan;
    if (colspan) th.colSpan = colspan;
    firstRow.appendChild(th);
  };
  addTh('日期时间', 2);
  addTh('药物治疗', undefined, 3);
  addTh('胃肠摄入', undefined, 3);
  addTh('尿量(ml)', 2);
  addTh('净超滤量(ml)', 2);
  addTh('排出物', undefined, 2);
  addTh('引流液', undefined, 2);
  addTh('检查', 2);
  addTh('治疗', 2);
  addTh('基础护理', 2);
  addTh('健康教育', 2);
  addTh('护理记录', 2);
  addTh('签名', 2);
  thead.appendChild(firstRow);

  // 第二行
  const secondRow = doc.createElement('tr');
  const subLabels = ['名称', '量/ml', '途径', '名称', '量/ml', '途径', '名称', '量/ml', '名称', '量/ml'];
  for (const label of subLabels) {
    const th = doc.createElement('th');
    th.textContent = label;
    secondRow.appendChild(th);
  }
  thead.appendChild(secondRow);
  table.appendChild(thead);

  // tbody
  const tbody = doc.createElement('tbody');
  for (const item of pageModel.items) {
    if (item.kind === 'time-group') {
      for (const row of item.rows) {
        const tr = doc.createElement('tr');
        if (!row.firstLine) tr.className = 'continuation-row';

        const addTd = (text: string, className?: string) => {
          const td = doc.createElement('td');
          if (className) td.className = className;
          td.textContent = text || '';
          tr.appendChild(td);
        };

        addTd(row.timeText, 'time-cell');
        addTd(row.medication?.name || '');
        addTd(row.medication?.amount || '');
        addTd(row.medication?.route || '');
        addTd(row.enteral?.name || '');
        addTd(row.enteral?.amount || '');
        addTd(row.enteral?.route || '');
        addTd(row.urine || '');
        addTd(row.ultrafiltration || '');
        addTd(row.output?.name || '');
        addTd(row.output?.amount || '');
        addTd(row.drain?.name || '');
        addTd(row.drain?.amount || '');
        addTd(row.examination || '');
        addTd(row.treatment || '');
        addTd(row.basicCare || '');
        addTd(row.healthEducation || '');
        addTd(row.nursingRecord || '', 'nursing-cell');
        addTd(row.signature || '');

        tbody.appendChild(tr);
      }
    } else if (item.kind === 'summary') {
      const tr = doc.createElement('tr');
      tr.className = `print-summary-row ${item.summaryClassName}`;

      const td = doc.createElement('td');
      td.colSpan = 19;

      const panel = doc.createElement('section');
      panel.className = 'print-summary-panel';

      const titleRow = doc.createElement('div');
      titleRow.className = 'print-summary-title-row';
      const titleStrong = doc.createElement('strong');
      titleStrong.className = 'print-summary-title';
      titleStrong.textContent = item.summary.label;
      titleRow.appendChild(titleStrong);
      const periodSpan = doc.createElement('span');
      periodSpan.className = 'print-summary-period';
      periodSpan.textContent = item.summary.periodText;
      titleRow.appendChild(periodSpan);
      panel.appendChild(titleRow);

      for (const line of item.summary.detailLines) {
        const lineDiv = doc.createElement('div');
        lineDiv.className = 'print-summary-line';
        for (const token of line) {
          const span = doc.createElement('span');
          if (token.strong) span.className = 'print-summary-strong';
          if (token.sep) span.className = 'print-summary-sep';
          span.textContent = token.text;
          lineDiv.appendChild(span);
        }
        panel.appendChild(lineDiv);
      }

      td.appendChild(panel);
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else if (item.kind === 'empty') {
      const tr = doc.createElement('tr');
      const td = doc.createElement('td');
      td.colSpan = 19;
      td.textContent = '该护理日暂无记录';
      td.style.cssText = 'text-align:center;padding:20px;color:#999;font-size:12pt;';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);

  // tfoot
  const foot = doc.createElement('tfoot');
  if (pageModel.showRemark) {
    const remarkRow = doc.createElement('tr');
    remarkRow.className = 'print-remark-row';

    const th = doc.createElement('th');
    th.textContent = '备注';
    remarkRow.appendChild(th);

    const td = doc.createElement('td');
    td.colSpan = 18;

    const remarkLinesDiv = doc.createElement('div');
    remarkLinesDiv.className = 'print-remark-lines';
    for (const line of remarkLines) {
      const lineDiv = doc.createElement('div');
      lineDiv.className = 'print-remark-line';
      lineDiv.textContent = line;
      remarkLinesDiv.appendChild(lineDiv);
    }
    td.appendChild(remarkLinesDiv);
    remarkRow.appendChild(td);
    foot.appendChild(remarkRow);
  }
  table.appendChild(foot);

  tableWrap.appendChild(table);
  sheet.appendChild(tableWrap);

  // 页脚
  const pageno = doc.createElement('footer');
  pageno.className = 'sheet-pageno';
  const pageNoSpan = doc.createElement('span');
  pageNoSpan.className = 'page-current';
  pageNoSpan.textContent = formatHljldPageNo(pageModel.indexInDay);
  pageno.appendChild(pageNoSpan);
  sheet.appendChild(pageno);

  pageEl.appendChild(sheet);
  return pageEl;
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
  // 带超时的 document ready 等待
  await new Promise<void>(resolve => {
    if (win.document.readyState === 'complete') {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 3000);
    const handler = () => {
      clearTimeout(timer);
      win.removeEventListener('load', handler);
      resolve();
    };
    win.addEventListener('load', handler);
  });

  // 字体加载带超时，防止某些浏览器挂起
  try {
    const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
      await Promise.race([fonts.ready, timeout(2000)]);
    }
  } catch { /* 忽略字体加载错误 */ }

  await nextTwoFrames(win);
}

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function nextTwoFrames(win: Window): Promise<void> {
  // 带超时的 requestAnimationFrame，防止某些浏览器不触发
  await new Promise<void>(resolve => {
    let called = false;
    const done = () => { if (!called) { called = true; resolve(); } };
    const timer = setTimeout(done, 500);
    try {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => {
          clearTimeout(timer);
          done();
        });
      });
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}
