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
      // 必须可见且有尺寸，否则浏览器不弹打印对话框
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
          try {
            iframe.contentWindow?.print();
          } catch (err) {
            console.error('[Print] print() failed', err);
          }
          // 延迟清理，等待打印对话框关闭
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch (_) {}
            URL.revokeObjectURL(objectUrl);
            resolve();
          }, 3000);
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
