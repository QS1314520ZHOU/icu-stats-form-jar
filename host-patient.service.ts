import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HostPatientService {
  private patientSubject = new BehaviorSubject<any | null>(null);
  readonly patient$ = this.patientSubject.asObservable();
  private accountSubject = new BehaviorSubject<string | null>(null);
  readonly account$ = this.accountSubject.asObservable();

  getPatientSnapshot() { return this.patientSubject.getValue(); }
  getPid(): string | null {
    const p = this.patientSubject.getValue();
    const id = p?.id ?? p?.pid;
    if (id == null) return null;
    const s = String(id).trim();
    return s.length ? s : null;
  }

  // 兼容多种信封：patient / {patient} / {data:{patient}} / 消息本身即病人对象
  handleHostMessage(data: any): void {
    if (data == null || typeof data !== 'object') return;
    const patient =
      data.patient ?? data.data?.patient ??
      (this.looksLikePatient(data) ? data : null);
    const account = data.account ?? data.data?.account ?? null;
    if (patient) this.patientSubject.next(patient);
    if (account != null) this.accountSubject.next(String(account));
  }

  private looksLikePatient(o: any): boolean {
    return o && (o.id != null || o.pid != null) &&
      (o.name != null || o.birthday != null || o.mrn != null || o.clinicalDiagnosis != null);
  }
}
