import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HostPatientService } from './services/host-patient.service';
import { isSmartCareHostMessage } from './models/smartcare-host-message.model';

@Component({
  selector: 'app-root',
  template: `
    <!-- 缓存患者安全提示条 -->
    <div *ngIf="hostPatient.fromCache$ | async" style="background:#fef3c7;color:#92400e;padding:6px 12px;font-size:13px;">
      ⚠ 当前为刷新前缓存的患者，请核对姓名：{{ (hostPatient.patient$ | async)?.name }}
    </div>
    <router-outlet></router-outlet>
  `,
  styleUrls: ['./app.css'],
})
export class App implements OnInit, OnDestroy {
  private onMsg = (e: MessageEvent) => {
    if (!isSmartCareHostMessage(e.data)) return;
    this.ngZone.run(() => this.hostPatient.handleHostMessage(e.data));
  };

  private onVisible = () => {
    if (document.visibilityState === 'visible') {
      this.requestPatient();
    }
  };

  private onFocus = () => {
    this.requestPatient();
  };

  private onPageShow = () => {
    this.requestPatient();
  };

  constructor(
    public readonly hostPatient: HostPatientService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('message', this.onMsg);
      document.addEventListener('visibilitychange', this.onVisible);
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('pageshow', this.onPageShow);
    });

    // ② 就绪行
    (window as any).__scLog('READY listeners ok');

    // 补投：Angular 启动前已缓存的消息
    const buffered = (window as any).__scMsg;
    if (buffered) {
      this.ngZone.run(() => this.hostPatient.handleHostMessage(buffered));
    }

    // 启动后向宿主要一次
    this.requestPatient();

    // ④ 宿主超时告警 + 回填
    setTimeout(() => {
      if (!(window as any).__scHostSeen) {
        (window as any).__scLog('⚠ NO HOST MSG after 1500ms (asked ' + (window as any).__scAsk + 'x) — seeding cache');
        this.hostPatient.seedFromCacheIfIdle();
      }
    }, 1500);
    setTimeout(() => {
      if (!(window as any).__scHostSeen) {
        (window as any).__scLog('⚠ NO HOST MSG after 5000ms (asked ' + (window as any).__scAsk + 'x) — host not sending');
      }
    }, 5000);
  }

  private requestPatient(): void {
    try { parent.postMessage({ type: 'SmartCareReady' }, '*'); (window as any).__scAsk = ((window as any).__scAsk || 0) + 1; } catch (_) {}
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onMsg);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('pageshow', this.onPageShow);
  }
}
