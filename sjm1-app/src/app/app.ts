import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HostPatientService } from './services/host-patient.service';
import { isSmartCareHostMessage } from './models/smartcare-host-message.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit, OnDestroy {
  private onMsg = (e: MessageEvent) => {
    if (!isSmartCareHostMessage(e.data)) return;
    console.log('[sjm1] message from host =>', e.origin, e.data);
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
    private readonly hostPatient: HostPatientService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('message', this.onMsg);
      document.addEventListener('visibilitychange', this.onVisible);
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('pageshow', this.onPageShow);
    });

    // 补投：Angular 启动前已缓存的消息
    const buffered = (window as any).__scMsg;
    if (buffered) {
      console.log('[sjm1] replay buffered message', buffered);
      this.ngZone.run(() => this.hostPatient.handleHostMessage(buffered));
    }

    // 启动后向宿主要一次
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
