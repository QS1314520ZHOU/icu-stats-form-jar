import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { IcuPatient } from './icu-form-viewer.models';

@Injectable({ providedIn: 'root' })
export class IcuFormViewerService {

  private readonly PATIENT_API = '/api/v1/icu/patients/by-mrn';

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
}
