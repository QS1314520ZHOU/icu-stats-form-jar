import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export function isSmartCareMessage(t: any): boolean {
  return typeof t === 'object' && t !== null && t.type === 'SmartCare';
}

@Injectable({ providedIn: 'root' })
export class HostPatientService {
  private patientSubject = new BehaviorSubject<any | null>(null);
  readonly patient$ = this.patientSubject.asObservable();
  private accountSubject = new BehaviorSubject<string | null>(null);
  readonly account$ = this.accountSubject.asObservable();

  getPatientSnapshot() { return this.patientSubject.getValue(); }
  getPid(): string | null {
    const p = this.patientSubject.getValue();
    if (!p?.id) return null;
    const id = String(p.id).trim();
    return id.length ? id : null;
  }
  handleHostMessage(data: any): void {
    if (!isSmartCareMessage(data)) return;
    if (data.patient != null) this.patientSubject.next(data.patient);
    if (data.account != null) this.accountSubject.next(String(data.account));
  }
}
