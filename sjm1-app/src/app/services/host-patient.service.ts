import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { isSmartCareHostMessage } from '../models/smartcare-host-message.model';

@Injectable({ providedIn: 'root' })
export class HostPatientService {
  private readonly patientSubject = new BehaviorSubject<any | null>(null);
  readonly patient$ = this.patientSubject.asObservable();

  private readonly accountSubject = new BehaviorSubject<any | null>(null);
  readonly account$ = this.accountSubject.asObservable();

  handleHostMessage(raw: any): void {
    if (!isSmartCareHostMessage(raw)) {
      (window as any).__scLog?.('REJECTED msg type=' + (raw && raw.type));
      return;
    }
    this.patientSubject.next(raw.patient);
    if (raw.account) this.accountSubject.next(raw.account);
  }

  getPid(): string | null {
    const p = this.patientSubject.value;
    const id = p && p.id != null ? String(p.id).trim() : '';
    return id || null;
  }

  getPatient(): any | null {
    return this.patientSubject.value;
  }

  getAccount(): any | null {
    return this.accountSubject.value;
  }
}
