import type { JavaPrintOpt } from 'dxm-base-common-zhu';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const DEFAULT_JAVA_PRINT_OPTS: JavaPrintOpt = {
  pageSize: 'A4',
  orientation: 'portrait',
  top: 5,
  top2: 5,
  left: 5,
  left2: 5,
};

/**
 * 克隆元素到屏幕外的容器，去掉 zoom / margin 后截图，原始页面不受影响。
 */
function createOffscreenClone(el: HTMLElement): { wrapper: HTMLDivElement; clone: HTMLElement } {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position:fixed;left:-20000px;top:0;z-index:-9999;pointer-events:none;overflow:hidden;';
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.setProperty('zoom', '1');
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  return { wrapper, clone };
}

/**
 * 将 DOM 节点截图成 canvas，再合并为 A4 纵向 PDF（每页一个节点，图片铺满整页，PDF 不留边距）。
 * 通过离屏克隆截图，不会改动页面可见元素。
 */
export async function captureElementsToPdfBlob(elements: HTMLElement[]): Promise<Blob | null> {
  if (!elements.length) {
    return null;
  }

  // 1. 并发执行所有页面的截图，大幅减少多页时的总耗时
  const canvasPromises = elements.map(async (el) => {
    const { wrapper, clone } = createOffscreenClone(el);
    try {
      return await html2canvas(clone, {
        scale: 3, // 2. 缩放比例从 4 降到 3（3倍已相当于约300DPI，足够打印清晰，且比4倍快近一倍）
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
    } finally {
      document.body.removeChild(wrapper);
    }
  });

  const canvases = await Promise.all(canvasPromises);

  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  canvases.forEach((canvas, index) => {
    if (index > 0) {
      doc.addPage();
    }
    // 3. 使用 JPEG 格式代替 PNG，PNG 的压缩算法非常耗时，JPEG 能极大地提升生成速度并减小 PDF 体积
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imgProps = doc.getImageProperties(imgData);
    const aspect = imgProps.width / imgProps.height;
    const pageAspect = pageW / pageH;
    let w: number;
    let h: number;
    if (aspect > pageAspect) {
      w = pageW;
      h = w / aspect;
    } else {
      h = pageH;
      w = h * aspect;
    }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    doc.addImage(imgData, 'JPEG', x, y, w, h);
  });

  return doc.output('blob');
}
