import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { IcuPatient, IcuFormAvailabilityResponse } from './icu-form-viewer.models';

@Injectable({ providedIn: 'root' })
export class IcuFormViewerService {

  private readonly PATIENT_API = '/api/v1/icu/patients/by-mrn';
  private readonly AVAILABILITY_API = '/api/v1/icu/form-viewer/availability';

  constructor(private http: HttpClient) {}

  /**
   * 通过住院号查询患者信息。
   * 404 时返回 null，其他错误抛出。
   */
  getPatientByMrn(mrn: string): Observable<IcuPatient | null> {
    const params = new HttpParams().set('mrn', mrn.trim());
    return this.http.get<IcuPatient>(this.PATIENT_API, { params }).pipe(
      catchError(err => {
        if (err.status === 404) {
          return of(null);
        }
        throw err;
      })
    );
  }

  /**
   * 检查指定表单在时间范围内是否有数据。
   */
  checkFormAvailability(
    pid: string,
    formKey: string,
    startTime: string,
    endTime: string
  ): Observable<IcuFormAvailabilityResponse> {
    const params = new HttpParams()
      .set('pid', pid)
      .set('formKey', formKey)
      .set('startTime', startTime)
      .set('endTime', endTime);

    return this.http.get<IcuFormAvailabilityResponse>(this.AVAILABILITY_API, { params }).pipe(
      catchError(err => {
        return of({
          formKey,
          status: 'ERROR' as const,
          hasData: null,
          count: null,
          message: '查询失败，请稍后重试',
        });
      })
    );
  }
}
