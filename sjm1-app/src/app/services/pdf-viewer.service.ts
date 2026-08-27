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
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          const win = iframe.contentWindow;
          if (!win) {
            try { document.body.removeChild(iframe); } catch (_) {}
            URL.revokeObjectURL(objectUrl);
            resolve();
            return;
          }

          // 先注册 afterprint，再调用 print()
          // afterprint 在用户关闭打印对话框后触发（打印或取消）
          win.addEventListener('afterprint', () => {
            // 对话框已关闭，现在可以安全清理
            setTimeout(() => {
              try { document.body.removeChild(iframe); } catch (_) {}
              URL.revokeObjectURL(objectUrl);
              resolve();
            }, 100);
          }, { once: true });

          try {
            win.print();
          } catch (err) {
            console.error('[Print] print() failed', err);
            try { document.body.removeChild(iframe); } catch (_) {}
            URL.revokeObjectURL(objectUrl);
            resolve();
          }
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
      throw new Error(`加载PDF失败: ${response.status}`);
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
