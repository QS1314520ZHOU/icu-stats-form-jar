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
  private readonly baseUrl = '/api/v1/icu/hljld';

  constructor(private http: HttpClient) {}

  load(pid: string, start: Date, end: Date): Observable<LoadResult> {
    const params = new HttpParams()
      .set('pid', pid)
      .set('startTime', start.toISOString())
      .set('endTime', end.toISOString());

    const statuses: SourceStatus[] = [];
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);

    const safeGet = <T>(name: string, url: string, reqParams?: HttpParams): Observable<{ data: T[]; status: SourceStatus }> => {
      return this.http.get<T[]>(url, { params: reqParams }).pipe(
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
          if (isDev) { console.warn(`[HLJLD][source-error] ${name}`, { url, pid, httpStatus: error?.status, error: st.error }); }
          return of({ data: [] as T[], status: st });
        }),
      );
    };

    return forkJoin({
      bedside: safeGet<BedsideRecord>('bedside', `${this.baseUrl}/bedside`, params),
      drugExecutions: safeGet<DrugExecution>('drugExecutions', `${this.baseUrl}/drug-executions`, params),
      drugMethods: safeGet<DrugMethodConfig>('drugMethods', `${this.baseUrl}/drug-methods`),
      nurseRecords: safeGet<NurseRecord>('nurseRecords', `${this.baseUrl}/nurse-records`, params),
      signatures: safeGet<SignatureRecord>('signatures', `${this.baseUrl}/signatures`, params),
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

  private normalizeArray<T>(response: T[] | { data?: T[] }): T[] {
    if (Array.isArray(response)) return response;
    if (Array.isArray((response as any)?.data)) return (response as any).data;
    return [];
  }
}
