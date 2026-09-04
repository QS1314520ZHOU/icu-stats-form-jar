import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * 页码信息
 */
export interface PageIndexInfo {
  startPageNo: number;
  pageCount: number;
  status: 'completed' | 'calculating' | 'failed';
}

/**
 * 重新计算状态
 */
export interface RecalculateStatus {
  status: 'completed' | 'calculating' | 'failed';
  progress: number;
  message?: string;
}

/**
 * ICU 护理记录单 PDF 服务
 */
@Injectable({ providedIn: 'root' })
export class HljldPdfService {

  private readonly baseUrl = '/api/v1/icu/hljld';

  constructor(private http: HttpClient) {}

  /**
   * 获取预览 PDF URL（PREVIEW 模式）
   */
  getPreviewPdfUrl(pid: string, date: string, referenceTime?: string): string {
    const base = `${this.baseUrl}/pdf/${encodeURIComponent(pid)}/${encodeURIComponent(date)}`;
    const params = new URLSearchParams();
    params.set('purpose', 'PREVIEW');
    if (referenceTime) {
      params.set('referenceTime', referenceTime);
    }
    return `${base}?${params.toString()}`;
  }

  /**
   * 获取打印当日 PDF URL（PRINT_DAY 模式）
   */
  getDailyPrintPdfUrl(pid: string, date: string, referenceTime?: string): string {
    const base = `${this.baseUrl}/pdf/${encodeURIComponent(pid)}/${encodeURIComponent(date)}`;
    const params = new URLSearchParams();
    params.set('purpose', 'PRINT_DAY');
    if (referenceTime) {
      params.set('referenceTime', referenceTime);
    }
    return `${base}?${params.toString()}`;
  }

  /**
   * 获取时间范围打印 PDF URL（PRINT_RANGE 模式）
   */
  getRangePrintPdfUrl(pid: string, startDate: string, endDate: string, referenceTime?: string): string {
    const base = `${this.baseUrl}/pdf-range/${encodeURIComponent(pid)}`;
    const params = new URLSearchParams();
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (referenceTime) {
      params.set('referenceTime', referenceTime);
    }
    return `${base}?${params.toString()}`;
  }

  /**
   * 获取全部记录的 PDF URL（PRINT_ALL 模式）
   */
  getAllPdfsUrl(pid: string, referenceTime?: string): string {
    const base = `${this.baseUrl}/pdf-all/${encodeURIComponent(pid)}`;
    if (!referenceTime) {
      return base;
    }
    return `${base}?referenceTime=${encodeURIComponent(referenceTime)}`;
  }

  /**
   * 获取页码信息
   */
  getPageIndex(pid: string, date: string, referenceTime?: string): Observable<PageIndexInfo> {
    let params = new HttpParams().set('date', date);
    if (referenceTime) {
      params = params.set('referenceTime', referenceTime);
    }
    return this.http.get<PageIndexInfo>(`${this.baseUrl}/page-index/${encodeURIComponent(pid)}`, { params });
  }

  /**
   * 重新计算页码
   */
  recalculatePageIndexes(pid: string): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(
      `${this.baseUrl}/recalculate/${encodeURIComponent(pid)}`,
      {},
    );
  }

  /**
   * 查询重新计算状态
   */
  getRecalculateStatus(pid: string): Observable<RecalculateStatus> {
    return this.http.get<RecalculateStatus>(`${this.baseUrl}/recalculate-status/${encodeURIComponent(pid)}`);
  }
}
