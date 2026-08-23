import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  BedsideRecord,
  ConfigTubeView,
  DrugExecution,
  DrugMethodConfig,
  HljldSourceData,
  NurseRecord,
  SignatureRecord,
  TubeExecution,
} from './hljld2-form.models';

export interface AccountInfo {
  accountId: string;
  trueName: string;
}

export interface SourceStatus {
  source: string;
  url: string;
  status: 'success' | 'error';
  httpStatus?: number;
  count: number;
  error?: string;
}

export interface LoadResult {
  data: HljldSourceData;
  statuses: SourceStatus[];
}

@Injectable()
export class Hljld2FormService {
  private readonly hljldBase = '/api/v1/icu/hljld';
  private readonly bedsideApi = '/api/v1/icu/bedside/listByPid';
  private readonly bedsideRangeApi = '/api/v1/icu/bedside/listByPidAndTimeRange';

  constructor(private http: HttpClient) {}

  load(pid: string, start: Date, end: Date): Observable<LoadResult> {
    const statuses: SourceStatus[] = [];
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);

    const safeGet = <T>(name: string, url: string, reqParams?: HttpParams): Observable<{ data: T[]; status: SourceStatus }> => {
      return this.http.get<T[] | { data?: T[] }>(url, { params: reqParams }).pipe(
        map(response => {
          const data = this.normalizeArray(response);
          const st: SourceStatus = { source: name, url, status: 'success', count: data.length };
          statuses.push(st);
          if (isDev) { console.info(`[HLJLD][source] ${name}`, { url, pid, count: data.length }); }
          return { data, status: st };
        }),
        catchError(error => {
          const st: SourceStatus = {
            source: name,
            url,
            status: 'error',
            httpStatus: error?.status,
            count: 0,
            error: error?.message || String(error),
          };
          statuses.push(st);
          if (isDev) { console.error(`[HLJLD][source-error] ${name}`, { url, pid, status: error?.status, message: st.error }); }
          return of({ data: [] as T[], status: st });
        }),
      );
    };

    // 护理日为 (start, end]，后端多数按左闭右开取数：
    // 上界放宽 1 秒保证 end 整点数据被取回，精确过滤由 inNursingRange 完成
    const rangeParams = new HttpParams()
      .set('pid', pid)
      .set('startTime', start.toISOString())
      .set('endTime', new Date(end.getTime() + 1000).toISOString());

    return forkJoin({
      bedside: safeGet<BedsideRecord>('bedside', this.bedsideApi, new HttpParams().set('pid', pid)),
      drugExecutions: safeGet<DrugExecution>('drugExecutions', `${this.hljldBase}/drug-executions`, rangeParams),
      drugMethods: safeGet<DrugMethodConfig>('drugMethods', `${this.hljldBase}/drug-methods`),
      nurseRecords: safeGet<NurseRecord>('nurseRecords', `${this.hljldBase}/nurse-records`, rangeParams),
      tubeExecutions: safeGet<TubeExecution>('tubeExecutions', `${this.hljldBase}/tube-executions`, rangeParams),
      tubeViews: safeGet<ConfigTubeView>('tubeViews', `${this.hljldBase}/tube-views`),
      signatures: of({
        data: [] as SignatureRecord[],
        status: { source: 'signatures', url: '', status: 'success' as const, count: 0 } as SourceStatus,
      }),
    }).pipe(
      map(result => {
        statuses.push(result.signatures.status);
        return {
          data: {
            bedside: result.bedside.data,
            drugExecutions: result.drugExecutions.data,
            drugMethods: result.drugMethods.data,
            nurseRecords: result.nurseRecords.data,
            tubeExecutions: result.tubeExecutions.data,
            tubeViews: result.tubeViews.data,
            signatures: result.signatures.data,
          },
          statuses,
        };
      }),
    );
  }

  private normalizeArray<T>(response: T[] | { data?: T[] } | null): T[] {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray((response as any).data)) return (response as any).data;
    return [];
  }

  /**
   * 一次性加载整个住院期间（入科到出科）的全部护理数据。
   * 用于一键打印全部：6 个接口各发一次请求，返回完整 SourceData + statuses。
   * bedside 接口支持时间范围参数，只返回当前住院区间的数据。
   */
  loadAll(pid: string, stayStart: Date, stayEnd: Date): Observable<LoadResult> {
    const statuses: SourceStatus[] = [];
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);

    const safeGet = <T>(name: string, url: string, reqParams?: HttpParams): Observable<{ data: T[]; status: SourceStatus }> => {
      return this.http.get<T[] | { data?: T[] }>(url, { params: reqParams }).pipe(
        map(response => {
          const data = this.normalizeArray(response);
          const st: SourceStatus = { source: name, url, status: 'success', count: data.length };
          statuses.push(st);
          if (isDev) { console.info(`[HLJLD][loadAll][source] ${name}`, { url, count: data.length }); }
          return { data, status: st };
        }),
        catchError(error => {
          const st: SourceStatus = {
            source: name, url, status: 'error',
            httpStatus: error?.status, count: 0,
            error: error?.message || String(error),
          };
          statuses.push(st);
          if (isDev) { console.error(`[HLJLD][loadAll][source-error] ${name}`, { status: error?.status, message: st.error }); }
          return of({ data: [] as T[], status: st });
        }),
      );
    };

    // 上界放宽 1 秒保证边界数据被取回
    const endTime = new Date(stayEnd.getTime() + 1000).toISOString();
    const startTime = stayStart.toISOString();

    // bedside 使用专用时间范围接口，只返回当前住院区间的数据
    const bedsideParams = new HttpParams()
      .set('pid', pid)
      .set('startTime', startTime)
      .set('endTime', endTime);

    const rangeParams = new HttpParams()
      .set('pid', pid)
      .set('startTime', startTime)
      .set('endTime', endTime);

    return forkJoin({
      bedside: safeGet<BedsideRecord>('bedside', this.bedsideRangeApi, bedsideParams),
      drugExecutions: safeGet<DrugExecution>('drugExecutions', `${this.hljldBase}/drug-executions`, rangeParams),
      drugMethods: safeGet<DrugMethodConfig>('drugMethods', `${this.hljldBase}/drug-methods`),
      nurseRecords: safeGet<NurseRecord>('nurseRecords', `${this.hljldBase}/nurse-records`, rangeParams),
      tubeExecutions: safeGet<TubeExecution>('tubeExecutions', `${this.hljldBase}/tube-executions`, rangeParams),
      tubeViews: safeGet<ConfigTubeView>('tubeViews', `${this.hljldBase}/tube-views`),
      signatures: of({
        data: [] as SignatureRecord[],
        status: { source: 'signatures', url: '', status: 'success' as const, count: 0 } as SourceStatus,
      }),
    }).pipe(
      map(result => {
        statuses.push(result.signatures.status);
        return {
          data: {
            bedside: result.bedside.data,
            drugExecutions: result.drugExecutions.data,
            drugMethods: result.drugMethods.data,
            nurseRecords: result.nurseRecords.data,
            tubeExecutions: result.tubeExecutions.data,
            tubeViews: result.tubeViews.data,
            signatures: result.signatures.data,
          },
          statuses,
        };
      }),
    );
  }

  /**
   * 批量查询账户信息，返回 accountId → trueName 映射。
   */
  queryAccounts(userIds: string[]): Observable<Map<string, string>> {
    const unique = Array.from(new Set(userIds.filter(id => !!id && id.trim() !== '')));
    if (!unique.length) { return of(new Map()); }
    return this.http.get<any[]>('/api/v1/icu/accounts/listByIds', {
      params: new HttpParams().set('ids', unique.join(',')),
    }).pipe(
      map(list => {
        const map = new Map<string, string>();
        for (const item of (list || [])) {
          const id = String(item?.id ?? item?._id ?? item?.accountId ?? '').trim();
          const name = String(item?.trueName ?? item?.accountName ?? item?.name ?? '').trim();
          if (id && name) { map.set(id, name); }
        }
        return map;
      }),
      catchError(() => of(new Map())),
    );
  }


  /**
   * 获取指定日期的页码信息（startPageNo, pageCount）
   */
  getPageIndex(pid: string, date: string): Observable<{ startPageNo: number; pageCount: number; status: string }> {
    return this.http.get<{ startPageNo: number; pageCount: number; status: string }>(
      this.hljldBase + '/page-index/' + pid,
      { params: new HttpParams().set('date', date) },
    ).pipe(
      catchError(() => of({ startPageNo: 1, pageCount: 1, status: 'failed' })),
    );
  }

  /**
   * 触发页码重新计算（异步）
   */
  recalculatePageIndexes(pid: string): Observable<any> {
    return this.http.post(this.hljldBase + '/recalculate/' + pid, {});
  }

  /**
   * 查询页码计算状态
   */
  getRecalculateStatus(pid: string): Observable<{ status: string; progress: number; totalPages: number }> {
    return this.http.get<{ status: string; progress: number; totalPages: number }>(
      this.hljldBase + '/recalculate-status/' + pid,
    ).pipe(
      catchError(() => of({ status: 'failed', progress: 0, totalPages: 0 })),
    );
  }
}
