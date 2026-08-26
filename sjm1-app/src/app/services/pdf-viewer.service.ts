import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import * as pdfjsLib from 'pdfjs-dist';

// 配置PDF.js worker - 使用内联worker（生产环境离线可用）
pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.mjs';

export interface PdfPageRender {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale: number;
}

export interface PdfDocument {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  objectUrl: string;
  blob: Blob;
  totalPages: number;
}

/**
 * PDF查看器服务
 * 封装PDF.js操作，用于渲染和打印
 */
@Injectable({ providedIn: 'root' })
export class PdfViewerService {

  constructor(private http: HttpClient) {}

  /**
   * 加载PDF文档
   */
  async loadPdf(url: string): Promise<PdfDocument> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`加载PDF失败: ${response.status}`);
    }

    const blob = await response.blob();

    // 验证是PDF文件
    if (blob.type !== 'application/pdf') {
      const header = await blob.slice(0, 5).text();
      if (header !== '%PDF-') {
        throw new Error('返回的文件不是有效的PDF');
      }
    }

    const arrayBuffer = await blob.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const objectUrl = URL.createObjectURL(blob);

    return {
      pdfDoc,
      objectUrl,
      blob,
      totalPages: pdfDoc.numPages,
    };
  }

  /**
   * 获取PDF页面视口
   */
  async getPageViewport(pdfDoc: pdfjsLib.PDFDocumentProxy, pageNumber: number, scale: number): Promise<any> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    return viewport;
  }

  /**
   * 渲染PDF页面到Canvas
   */
  async renderPage(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    // 高DPI支持
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建Canvas上下文');
    }

    ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    // 检查是否已取消
    if (abortSignal?.aborted) {
      throw new Error('渲染已取消');
    }

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;
  }

  /**
   * 渲染PDF所有页面到Canvas数组
   */
  async renderAllPages(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    container: HTMLElement,
    scale: number,
    abortSignal?: AbortSignal,
  ): Promise<HTMLCanvasElement[]> {
    const canvases: HTMLCanvasElement[] = [];
    const totalPages = pdfDoc.numPages;

    for (let i = 1; i <= totalPages; i++) {
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('渲染已取消');
      }

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      container.appendChild(canvas);

      await this.renderPage(pdfDoc, i, canvas, scale, abortSignal);
      canvases.push(canvas);
    }

    return canvases;
  }

  /**
   * 通过隐藏iframe打印PDF
   */
  async printPdfBlob(pdfBlob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(pdfBlob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.print();
            // 打印后清理
            setTimeout(() => {
              document.body.removeChild(iframe);
              URL.revokeObjectURL(objectUrl);
              resolve();
            }, 1000);
          } catch (err) {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(objectUrl);
            reject(err);
          }
        }, 500);
      };

      iframe.onerror = () => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(objectUrl);
        reject(new Error('打印iframe加载失败'));
      };

      iframe.src = objectUrl;
    });
  }

  /**
   * 验证PDF Blob
   */
  async validatePdfBlob(blob: Blob): Promise<boolean> {
    if (blob.size === 0) {
      return false;
    }

    if (blob.type !== 'application/pdf') {
      const header = await blob.slice(0, 5).text();
      return header === '%PDF-';
    }

    return true;
  }

  /**
   * 清理Object URL
   */
  revokeObjectUrl(url: string): void {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * 销毁PDF文档
   */
  async destroyPdfDocument(pdfDoc: pdfjsLib.PDFDocumentProxy | null): Promise<void> {
    if (pdfDoc) {
      try {
        await pdfDoc.destroy();
      } catch (e) {
        console.warn('销毁PDF文档时出错:', e);
      }
    }
  }
}
