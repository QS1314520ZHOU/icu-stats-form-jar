import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';
import { isSmartCareHostMessage } from './models/smartcare-host-message.model';

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>',
  styleUrls: ['./app.css'],
})
export class App implements OnInit, OnDestroy {
  private readyTimer: any = null;
  /** 是否已收到过宿主实时回应（收到即永久停止握手） */
  private liveReceived = false;
  private destroy$ = new Subject<void>();

  private onMsg = (e: MessageEvent) => {
    if (!isSmartCareHostMessage(e.data)) return;
    // 一收到宿主消息：置位并立即停表
    this.liveReceived = true;
    if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
    this.ngZone.run(() => this.hostPatient.handleHostMessage(e.data));
  };

  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.liveReceived) {
      this.startReadyHandshake();
    }
  };

  private onPageShow = () => {
    if (!this.liveReceived) this.startReadyHandshake();
  };

  constructor(
    public readonly hostPatient: HostPatientService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    // 1) 先挂监听
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('message', this.onMsg);
      document.addEventListener('visibilitychange', this.onVisible);
      window.addEventListener('pageshow', this.onPageShow);
    });

    (window as any).__scLog?.('READY listeners ok');

    // 2) 补投：Angular 启动前已缓存的消息
    const buffered = (window as any).__scMsg;
    if (buffered && isSmartCareHostMessage(buffered)) {
      this.liveReceived = true;
      this.ngZone.run(() => this.hostPatient.handleHostMessage(buffered));
    }

    // 3) 开始握手（有兜底、收到即停）
    this.startReadyHandshake();
  }

  private startReadyHandshake(): void {
    if (this.liveReceived) return;                        // 已收到宿主回应，不再握手
    if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
    let attempts = 0;
    const maxAttempts = 10;                               // 最多约 5 秒兜底
    const send = () => {
      if (this.liveReceived || attempts >= maxAttempts) { // 收到回应 或 超次数 → 立即停
        if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
        return;
      }
      attempts++;
      try { parent.postMessage({ type: 'SmartCareReady' }, '*'); } catch (e) {}
      (window as any).__scLog?.('SmartCareReady sent #' + attempts);
    };
    send();                                               // 立即发一次
    this.readyTimer = setInterval(send, 500);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
    window.removeEventListener('message', this.onMsg);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('pageshow', this.onPageShow);
  }
}
