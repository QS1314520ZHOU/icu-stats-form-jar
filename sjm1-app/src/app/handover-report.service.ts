import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { DepartmentDailySnapshot, DraftConflictError, HandoverDraft, NurseRecord } from './handover-report.models';

@Injectable()
export class HandoverReportService {
  private readonly baseUrl = '/api/v1/icu/handover-report';
  private readonly nurseRecordUrl = '/api/v1/icu/hljld/nurse-records';

  constructor(private readonly http: HttpClient) {}

  loadDaily(condition: { reportDate: string; department?: string; departmentCode?: string }): Observable<DepartmentDailySnapshot> {
    let params = new HttpParams().set('reportDate', condition.reportDate);
    if (condition.department) { params = params.set('department', condition.department); }
    if (condition.departmentCode) { params = params.set('departmentCode', condition.departmentCode); }
    return this.http.get<DepartmentDailySnapshot>(`${this.baseUrl}/daily`, { params });
  }

  /**
   * 按患者和班次时间范围查询护理记录。
   * 复用 HljldController 已有的 /nurse-records 接口。
   */
  loadNurseRecords(pid: string, startTime: Date, endTime: Date): Observable<NurseRecord[]> {
    const normalizedPid = String(pid ?? '').trim();
    if (!normalizedPid) {
      return throwError(() => new Error('当前患者缺少护理记录关联ID'));
    }
    const params = new HttpParams()
      .set('pid', normalizedPid)
      .set('startTime', startTime.toISOString())
      .set('endTime', endTime.toISOString());

    return this.http
      .get<NurseRecord[] | { data?: NurseRecord[] }>(this.nurseRecordUrl, { params })
      .pipe(
        map(response => this.normalizeArray(response)),
        map(records =>
          records
            .filter(record => record?.valid !== false)
            .filter(record => !!String(record?.desc ?? '').trim())
            .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()),
        ),
      );
  }

  saveDraft(draft: HandoverDraft): Observable<HandoverDraft> {
    return this.http.put<HandoverDraft>(`${this.baseUrl}/draft`, draft, {
      headers: { 'If-Match': String(draft.version) },
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 409 || error.status === 412) {
          return throwError(() => new DraftConflictError(error.error?.latestDraft));
        }
        return throwError(() => error);
      }),
    );
  }

  private normalizeArray<T>(response: T[] | { data?: T[] } | null | undefined): T[] {
    if (Array.isArray(response)) { return response; }
    if (response && Array.isArray((response as { data?: T[] }).data)) { return (response as { data: T[] }).data; }
    return [];
  }
}
