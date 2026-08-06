import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HandoverReport, LoadResult, SourceStatus } from './handover-report.models';

@Injectable()
export class HandoverReportService {
  private readonly hljldBase = '/api/v1/icu/hljld';
  private readonly reportApi = '/api/v1/icu/handover-reports';
  private readonly bedsideApi = '/api/v1/icu/bedside/listByPid';
  private readonly patientApi = '/api/v1/icu/patients';

  constructor(private http: HttpClient) {}

  loadSourceData(pid: string, startTime: Date, endTime: Date): Observable<LoadResult> {
    const statuses: SourceStatus[] = [];
    const rangeParams = new HttpParams()
      .set('pid', pid)
      .set('startTime', startTime.toISOString())
      .set('endTime', endTime.toISOString());

    const safeGet = <T>(name: string, url: string, reqParams?: HttpParams): Observable<{ data: T[]; status: SourceStatus }> => {
      return this.http.get<T[] | { data?: T[] }>(url, { params: reqParams }).pipe(
        map(response => {
          const data = this.normalizeArray(response);
          const st: SourceStatus = { source: name, status: 'success', count: data.length };
          statuses.push(st);
          return { data, status: st };
        }),
        catchError(error => {
          const st: SourceStatus = { source: name, status: 'error', httpStatus: error?.status, count: 0, error: error?.message || String(error) };
          statuses.push(st);
          return of({ data: [] as T[], status: st });
        }),
      );
    };

    return forkJoin({
      bedside: safeGet<any>('bedside', this.bedsideApi, new HttpParams().set('pid', pid)),
      tubeExecutions: safeGet<any>('tubeExecutions', `${this.hljldBase}/tube-executions`, rangeParams),
    }).pipe(
      map(result => ({
        bedside: result.bedside.data,
        tubeExecutions: result.tubeExecutions.data,
        patientInfo: null,
        operations: [],
        statuses,
      })),
    );
  }

  loadReport(pid: string, department: string, reportDate: Date): Observable<HandoverReport[]> {
    return this.http.get<HandoverReport[]>(this.reportApi, {
      params: new HttpParams()
        .set('pid', pid)
        .set('department', department)
        .set('reportDate', reportDate.toISOString()),
    }).pipe(
      map(list => this.normalizeArray(list)),
      catchError(() => of([])),
    );
  }

  saveReport(report: HandoverReport): Observable<HandoverReport> {
    if (report.id) {
      return this.http.put<HandoverReport>(`${this.reportApi}/${report.id}`, report, {
        headers: report.version != null ? { 'If-Match': String(report.version) } : {},
      });
    }
    return this.http.post<HandoverReport>(this.reportApi, report);
  }

  queryAccounts(userIds: string[]): Observable<Map<string, string>> {
    const unique = Array.from(new Set(userIds.filter(id => !!id && id.trim() !== '')));
    if (!unique.length) { return of(new Map()); }
    return this.http.get<any[]>('/api/v1/icu/accounts/listByIds', {
      params: new HttpParams().set('ids', unique.join(',')),
    }).pipe(
      map(list => {
        const m = new Map<string, string>();
        for (const item of (list || [])) {
          const id = String(item?.id ?? item?._id ?? '').trim();
          const name = String(item?.trueName ?? item?.accountName ?? '').trim();
          if (id && name) { m.set(id, name); }
        }
        return m;
      }),
      catchError(() => of(new Map())),
    );
  }

  private normalizeArray<T>(response: T[] | { data?: T[] } | null): T[] {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray((response as any).data)) return (response as any).data;
    return [];
  }
}
