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

  /**
   * 当前后端未实现以下接口，暂时关闭：
   * - /api/v1/icu/hljld/drug-executions
   * - /api/v1/icu/hljld/drug-methods
   * - /api/v1/icu/hljld/nurse-records
   * - /api/v1/icu/hljld/signatures
   *
   * 后端实现后将此值改为 true 即可启用。
   */
  private readonly enableExtendedApis = false;

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
          if (isDev) { console.info(`[HLJLD][source] ${name}`, { url, pid, startTime: start.toISOString(), endTime: end.toISOString(), count: data.length }); }
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

    const bedsideParams = new HttpParams().set('pid', pid);
    const bedside$ = safeGet<BedsideRecord>('bedside', this.bedsideApi, bedsideParams);

    if (!this.enableExtendedApis) {
      return bedside$.pipe(
        map(result => ({
          data: {
            bedside: result.data,
            drugExecutions: [],
            drugMethods: [],
            nurseRecords: [],
            signatures: [],
          },
          statuses,
        })),
      );
    }

    return forkJoin({
      bedside: bedside$,
      drugExecutions: safeGet<DrugExecution>('drugExecutions', `${this.hljldBase}/drug-executions`, new HttpParams().set('pid', pid).set('startTime', start.toISOString()).set('endTime', end.toISOString())),
      drugMethods: safeGet<DrugMethodConfig>('drugMethods', `${this.hljldBase}/drug-methods`),
      nurseRecords: safeGet<NurseRecord>('nurseRecords', `${this.hljldBase}/nurse-records`, new HttpParams().set('pid', pid).set('startTime', start.toISOString()).set('endTime', end.toISOString())),
      signatures: safeGet<SignatureRecord>('signatures', `${this.hljldBase}/signatures`, new HttpParams().set('pid', pid).set('startTime', start.toISOString()).set('endTime', end.toISOString())),
    }).pipe(
      map(result => ({
        data: {
          bedside: result.bedside.data,
          drugExecutions: result.drugExecutions.data,
          drugMethods: result.drugMethods.data,
          nurseRecords: result.nurseRecords.data,
          signatures: result.signatures.data,
        },
        statuses,
      })),
    );
  }

  private normalizeArray<T>(response: T[] | { data?: T[] } | null): T[] {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray((response as any).data)) return (response as any).data;
    return [];
  }
}
