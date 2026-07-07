import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HostPatientService } from './services/host-patient.service';
import { isSmartCareHostMessage } from './models/smartcare-host-message.model';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private onMsg = (e: MessageEvent) => {
    if (!isSmartCareHostMessage(e.data)) return;
    console.log('[form] message from host =>', e.origin, e.data);
    this.ngZone.run(() => this.hostPatient.handleHostMessage(e.data));
  };

  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.hostPatient.getPid()) {
      this.requestPatient();
    }
  };

  private onFocus = () => {
    if (!this.hostPatient.getPid()) {
      this.requestPatient();
    }
  };

  private onPageShow = () => {
    if (!this.hostPatient.getPid()) {
      this.requestPatient();
    }
  };

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    // 监听在 zone 外注册，避免每条消息触发多余变更检测
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('message', this.onMsg);
      document.addEventListener('visibilitychange', this.onVisible);
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('pageshow', this.onPageShow);
    });

    // 补投：Angular 启动前 index.html/main.ts 已缓存的那一条
    const buffered = (window as any).__scMsg;
    if (buffered) {
      console.log('[form] replay buffered message', buffered);
      this.ngZone.run(() => this.hostPatient.handleHostMessage(buffered));
    }

    // 启动后再向宿主要一次
    this.requestPatient();
  }

  private requestPatient(): void {
    try { parent.postMessage({ type: 'SmartCareReady' }, '*'); } catch (_) {}
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onMsg);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('pageshow', this.onPageShow);
  }
}
