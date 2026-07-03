import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { isSmartCareHostMessage } from '../models/smartcare-host-message.model';

@Injectable({ providedIn: 'root' })
export class HostPatientService {
  private readonly patientSubject = new BehaviorSubject<any | null>(null);
  readonly patient$ = this.patientSubject.asObservable();

  private readonly accountSubject = new BehaviorSubject<string | null>(null);
  readonly account$ = this.accountSubject.asObservable();

  getPatientSnapshot(): any | null {
    return this.patientSubject.getValue();
  }

  /** 取 Patient 文档 id */
  getPid(): string | null {
    const p = this.patientSubject.getValue();
    if (!p?.id) {
      return null;
    }
    const s = String(p.id).trim();
    return s.length ? s : null;
  }

  getAccountSnapshot(): string | null {
    return this.accountSubject.getValue();
  }

  handleHostMessage(raw: unknown): void {
    if (!isSmartCareHostMessage(raw)) {
      return;
    }
    const data = raw as any;
    if (data.patient != null) {
      this.patientSubject.next(data.patient);
    }
    if (data.account !== undefined && data.account !== null) {
      this.accountSubject.next(String(data.account));
    }
  }
}
