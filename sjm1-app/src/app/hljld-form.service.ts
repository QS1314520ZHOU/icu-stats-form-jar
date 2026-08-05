import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  BedsideRecord,
  DrugExecution,
  DrugMethodConfig,
  HljldSourceData,
  NurseRecord,
  SignatureRecord,
} from './hljld-form.models';

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
export class HljldFormService {
  private readonly hljldBase = '/api/v1/icu/hljld';
  private readonly bedsideApi = '/api/v1/icu/bedside/listByPid';

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

    const rangeParams = new HttpParams()
      .set('pid', pid)
      .set('startTime', start.toISOString())
      .set('endTime', end.toISOString());

    return forkJoin({
      bedside: safeGet<BedsideRecord>('bedside', this.bedsideApi, new HttpParams().set('pid', pid)),
      drugExecutions: safeGet<DrugExecution>('drugExecutions', `${this.hljldBase}/drug-executions`, rangeParams),
      drugMethods: safeGet<DrugMethodConfig>('drugMethods', `${this.hljldBase}/drug-methods`),
      nurseRecords: safeGet<NurseRecord>('nurseRecords', `${this.hljldBase}/nurse-records`, rangeParams),
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
}
