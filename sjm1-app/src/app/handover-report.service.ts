import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { DepartmentDailySnapshot, DraftConflictError, HandoverDraft } from './handover-report.models';

@Injectable()
export class HandoverReportService {
  private readonly baseUrl = '/api/v1/icu/handover-report';

  constructor(private readonly http: HttpClient) {}

  loadDaily(condition: { reportDate: string; departmentId: string }): Observable<DepartmentDailySnapshot> {
    const params = new HttpParams()
      .set('reportDate', condition.reportDate)
      .set('departmentId', condition.departmentId);
    return this.http.get<DepartmentDailySnapshot>(`${this.baseUrl}/daily`, { params });
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
}
