import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { isSmartCareHostMessage } from '../models/smartcare-host-message.model';

@Injectable({ providedIn: 'root' })
export class HostPatientService {
  private readonly patientSubject = new BehaviorSubject<any | null>(null);
  readonly patient$ = this.patientSubject.asObservable();

  private readonly accountSubject = new BehaviorSubject<any | null>(null);
  readonly account$ = this.accountSubject.asObservable();

  private readonly fromCacheSubject = new BehaviorSubject<boolean>(false);
  readonly fromCache$ = this.fromCacheSubject.asObservable();

  handleHostMessage(raw: any): void {
    if (!isSmartCareHostMessage(raw)) {
      (window as any).__scLog?.('REJECTED msg type=' + (raw && raw.type));
      return;
    }
    this.patientSubject.next(raw.patient);
    if (raw.account) this.accountSubject.next(raw.account);
    // 标记为非缓存 + 写入缓存
    this.fromCacheSubject.next(false);
    try { localStorage.setItem('sc.lastPatient', JSON.stringify(raw)); } catch (e) {}
  }

  /** 仅当当前还没有患者时才回填，避免覆盖真实消息 */
  seedFromCacheIfIdle(): void {
    if (this.patientSubject.value) return; // 已经有真实患者，不回填
    let cached: any = null;
    try { cached = JSON.parse(localStorage.getItem('sc.lastPatient') || 'null'); } catch (e) {}
    if (!cached || !cached.patient || !cached.patient.id) return;
    (window as any).__scLog?.('SEED from cache pid=' + (window as any).__scShortPid(cached.patient.id));
    this.fromCacheSubject.next(true);
    this.handleHostMessage(cached);
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
