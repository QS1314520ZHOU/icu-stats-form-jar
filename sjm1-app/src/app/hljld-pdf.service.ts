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
   * 获取指定日期的 PDF URL
   */
  getPdfUrl(pid: string, date: string, referenceTime?: string): string {
    const base = `${this.baseUrl}/pdf/${encodeURIComponent(pid)}/${encodeURIComponent(date)}`;
    if (!referenceTime) {
      return base;
    }
    return `${base}?referenceTime=${encodeURIComponent(referenceTime)}`;
  }

  /**
   * 获取全部记录的 PDF URL
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
