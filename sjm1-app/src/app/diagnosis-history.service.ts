import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { getSmartCarePatientPid } from './models/smartcare-host-message.model';

/**
 * 补全患者诊断历史。
 *
 * 宿主 postMessage 的患者负载可能缺 diagnosisHistoryList / status / 出科时间，
 * 需要从后端拉取完整 Patient 实体。按 pid 缓存，多个表单共享一次请求。
 */
@Injectable({ providedIn: 'root' })
export class DiagnosisHistoryService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<any>>();

  /** 返回带 diagnosisHistoryList（及状态/出科时间）的患者；失败时原样返回 */
  ensurePatient(patient: any): Observable<any> {
    if (!patient) return of(patient);
    if (Array.isArray(patient.diagnosisHistoryList)) return of(patient);

    const pid = getSmartCarePatientPid(patient);
    const mrn = String(patient.mrn ?? patient.hospitalNo ?? patient.hisPid ?? '').trim();
    const key = pid || mrn;
    if (!key) return of(patient);

    let req = this.cache.get(key);
    if (!req) {
      req = this.fetchPatient(pid, mrn).pipe(
        catchError(() => of(null)),
        shareReplay(1),
      );
      this.cache.set(key, req);
    }
    return req.pipe(map(fetched => this.mergePatient(patient, fetched)));
  }

  private fetchPatient(pid: string, mrn: string): Observable<any> {
    if (pid) {
      return this.http.get<any>('/api/v1/icu/patients', { params: { id: pid } }).pipe(
        catchError(() => {
          if (!mrn) return of(null);
          return this.http.get<any>('/api/v1/icu/patients/by-mrn', { params: { mrn } })
            .pipe(catchError(() => of(null)));
        }),
      );
    }
    return this.http.get<any>('/api/v1/icu/patients/by-mrn', { params: { mrn } })
      .pipe(catchError(() => of(null)));
  }

  /** 宿主展示字段优先；历史/状态/出科时间缺失时用接口值 */
  private mergePatient(host: any, fetched: any): any {
    if (!fetched || typeof fetched !== 'object') return host;
    const merged: any = { ...host };
    for (const field of ['diagnosisHistoryList', 'status', 'icuDischargeTime', 'dischargeTime', 'outTime']) {
      if ((merged[field] === undefined || merged[field] === null) && fetched[field] !== undefined) {
        merged[field] = fetched[field];
      }
    }
    // 历史仍缺失时显式置空数组，避免反复请求
    if (!Array.isArray(merged.diagnosisHistoryList)) {
      merged.diagnosisHistoryList = Array.isArray(fetched.diagnosisHistoryList)
        ? fetched.diagnosisHistoryList
        : [];
    }
    return merged;
  }
}
