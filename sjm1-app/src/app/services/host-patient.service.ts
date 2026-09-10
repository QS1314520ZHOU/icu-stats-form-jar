import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { isSmartCareHostMessage } from '../models/smartcare-host-message.model';

export interface TimeRange {
  startTimeMs: string;
  endTimeMs: string;
}

@Injectable({ providedIn: 'root' })
export class HostPatientService {
  private readonly patientSubject = new BehaviorSubject<any | null>(null);
  readonly patient$ = this.patientSubject.asObservable();

  private readonly accountSubject = new BehaviorSubject<any | null>(null);
  readonly account$ = this.accountSubject.asObservable();

  private readonly timeRangeSubject = new BehaviorSubject<TimeRange | null>(null);
  readonly timeRange$ = this.timeRangeSubject.asObservable();

  handleHostMessage(raw: any): void {
    if (!isSmartCareHostMessage(raw)) {
      (window as any).__scLog?.('REJECTED msg type=' + (raw && raw.type));
      return;
    }
    this.patientSubject.next(raw.patient);
    if (raw.account) this.accountSubject.next(raw.account);
  }

  /** 设置时间范围（由 viewer 页面调用） */
  setTimeRange(startTimeMs: string, endTimeMs: string): void {
    this.timeRangeSubject.next({ startTimeMs, endTimeMs });
  }

  private getPatientPid(p: any): string {
    return String(
      p?.id ?? p?._id ?? p?.pid ?? p?.patientId ?? p?.patientID ?? p?.patient?.id ?? p?.patient?._id ?? ''
    ).trim();
  }

  getPid(): string | null {
    const id = this.getPatientPid(this.patientSubject.value);
    return id || null;
  }

  getMongoPatientId(): string | null {
    const patient = this.patientSubject.value;
    const id = String(patient?._id ?? '').trim();
    return id || null;
  }

  getPatient(): any | null {
    return this.patientSubject.value;
  }

  getAccount(): any | null {
    return this.accountSubject.value;
  }
}
