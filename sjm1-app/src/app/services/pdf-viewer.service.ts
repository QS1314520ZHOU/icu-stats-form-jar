import { Injectable } from '@angular/core';

/**
 * PDF打印服务
 * 封装Blob获取和打印操作，不再使用PDF.js
 */
@Injectable({ providedIn: 'root' })
export class PdfPrintService {

  constructor() {}

  /**
   * 通过隐藏iframe打印PDF Blob
   */
  async printPdfBlob(pdfBlob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(pdfBlob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '0';
      iframe.style.top = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.opacity = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      let resolved = false;
      const safeResolve = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const cleanup = () => {
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch (_) {}
          URL.revokeObjectURL(objectUrl);
        }, 200);
      };

      iframe.onload = () => {
        setTimeout(() => {
          const win = iframe.contentWindow;
          if (!win) { safeResolve(); cleanup(); return; }

          // afterprint：用户关闭对话框后清理 iframe
          win.addEventListener('afterprint', () => {
            safeResolve();
            cleanup();
          }, { once: true });

          try {
            win.print();
          } catch (err) {
            console.error('[Print] print() failed', err);
            safeResolve();
            cleanup();
          }

          // 兜底：5秒后解锁按钮（不删 iframe，避免关掉打印对话框）
          // 如果 afterprint 已触发则无副作用
          setTimeout(safeResolve, 5000);
        }, 500);
      };

      iframe.onerror = () => {
        try { document.body.removeChild(iframe); } catch (_) {}
        URL.revokeObjectURL(objectUrl);
        reject(new Error('打印iframe加载失败'));
      };

      iframe.src = objectUrl;
    });
  }

  /**
   * 获取PDF Blob
   */
  async fetchPdfBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      // 尝试读取响应体中的错误信息
      let errorMsg = `加载PDF失败: ${response.status}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          errorMsg = errorText;
        }
      } catch (e) {
        // 忽略读取错误
      }
      throw new Error(errorMsg);
    }
    const blob = await response.blob();
    if (blob.type !== 'application/pdf') {
      const header = await blob.slice(0, 5).text();
      if (header !== '%PDF-') {
        throw new Error('返回的文件不是有效的PDF');
      }
    }
    return blob;
  }

  /**
   * 清理Object URL
   */
  revokeObjectUrl(url: string): void {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
