/** 共享打印工具：A4横向CSS + 打印窗口管理 */
export const PRINT_CSS_COMMON = `
@page { size: A4 landscape; margin:0; }
html,body{margin:0;padding:0;background:#fff;}
body{color:#000;font-family:'SimSun','宋体',serif;}
.print-page{box-sizing:border-box;width:297mm;height:210mm;margin:0;padding:0;overflow:hidden;break-after:page;page-break-after:always;background:#fff;}
.print-page:last-child{break-after:auto;page-break-after:auto;}
.sheet{box-sizing:border-box;position:relative;width:297mm;height:210mm;margin:0;padding:4mm 10mm 12mm;overflow:hidden;box-shadow:none;background:#fff;color:#000;transform:none !important;zoom:1 !important;filter:none !important;text-shadow:none !important;}
.sheet-head{text-align:center;padding-bottom:2px;}
.title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:22pt;line-height:1.35;}
.patient-info-row{display:flex;align-items:center;width:100%;gap:12px;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;white-space:nowrap;margin:2px 0;color:#000;}
.patient-info-row b,.patient-info-row strong{font-family:inherit;font-size:inherit;font-style:inherit;line-height:inherit;color:inherit;font-weight:700;}
.info-item{flex:0 0 auto;white-space:nowrap;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;}
.info-row{display:flex;flex-wrap:wrap;gap:6px 24px;padding:3px 0;}
.diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;}
.dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.2;}
.sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:4mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
`;

/** 创建打印窗口并写入内容 */
export function openPrintWindow(body: string, extraCss: string = ''): Window | null {
  const win = window.open('', '_blank', 'width=1400,height=900');
  if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return null; }
  const css = PRINT_CSS_COMMON + '\n' + extraCss;
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + body + '</body></html>');
  win.document.close();
  return win;
}

/** 等待字体和渲染完成后执行打印 */
export function readyPrint(win: Window, onReady: () => void): void {
  const run = () => {
    const doc = win.document as any;
    if (doc.fonts?.ready) {
      doc.fonts.ready.then(() => {
        requestAnimationFrame(() => requestAnimationFrame(onReady));
      });
    } else if (doc.readyState === 'complete') {
      requestAnimationFrame(() => requestAnimationFrame(onReady));
    }
  };
  win.addEventListener('afterprint', () => { try { win.close(); } catch(e) { /* ignore */ } });
  if ((win.document as any).readyState === 'complete') {
    run();
  } else {
    win.addEventListener('load', run);
  }
}

/** 验证打印页：溢出/页码/备注检测 */
export function validatePrintPages(win: Window): boolean {
  const printPages = win.document.querySelectorAll<HTMLElement>('.print-page');
  let ok = true;
  for (const printPage of Array.from(printPages)) {
    const sheet = printPage.querySelector<HTMLElement>('.sheet');
    const pageNumber = printPage.querySelector<HTMLElement>('.sheet-pageno');
    if (!sheet || !pageNumber) { console.warn('Missing sheet or page number'); ok = false; continue; }
    const sheetRect = sheet.getBoundingClientRect();
    const pnRect = pageNumber.getBoundingClientRect();
    if (pnRect.top < sheetRect.top || pnRect.bottom > sheetRect.bottom) {
      console.warn('Page number outside sheet'); ok = false;
    }
    if (sheet.scrollHeight > sheet.clientHeight + 1) {
      console.warn('Content overflow: ' + (sheet.scrollHeight - sheet.clientHeight) + 'px'); ok = false;
    }
  }
  return ok;
}
