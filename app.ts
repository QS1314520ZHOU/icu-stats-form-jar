import { Component, NgZone, OnDestroy, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HostPatientService } from './host-patient.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('sjm1-app');
  private gotPatient = false;
  private pingTimer: any = null;
  private onFormReady?: (e: MessageEvent) => void;

  private onWindowMessage = (a: MessageEvent) => {
    if (a?.data?.type === 'SmartCare-form-ready') return; // 忽略自己发的
    console.log('[sjm1] message from host =>', a.origin, a.data); // 定位用，稳定后可删
    this.ngZone.run(() => {
      this.hostPatient.handleHostMessage(a.data);
      // 收到患者后停止重试
      if (this.hostPatient.getPid()) {
        this.gotPatient = true;
      }
    });
  };

  constructor(private hostPatient: HostPatientService, private ngZone: NgZone) {
    // 1. 注册 message 监听（最早时机）
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('message', this.onWindowMessage);

      // 2. 监听 visibilitychange（切走再切回时重发）
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.pingReady();
        }
      });
    });

    // 3. 回放缓存的消息（在 Angular Zone 内执行）
    const cached = (window as any).__HOST_MSGS__ || [];
    cached.forEach((data: any) => {
      this.ngZone.run(() => {
        this.hostPatient.handleHostMessage(data);
      });
    });
    if (this.hostPatient.getPid()) {
      this.gotPatient = true;
    }

    // 4. 立即 ping 并重试（直到拿到患者或超时）
    this.pingReady();
    let n = 0;
    this.pingTimer = setInterval(() => {
      if (this.gotPatient || n++ > 20) { // 最多 ~4s
        clearInterval(this.pingTimer);
        this.pingTimer = null;
        return;
      }
      this.pingReady();
    }, 200);

    // 5. 响应宿主的 ready 请求（宿主会重发患者数据）
    this.onFormReady = (e: MessageEvent) => {
      if (e?.data?.type === 'SmartCare-form-ready') {
        this.pingReady();
      }
    };
    window.addEventListener('message', this.onFormReady);
  }

  private pingReady(): void {
    try {
      window.parent?.postMessage({ type: 'SmartCare-form-ready', form: 'sjm1' }, '*');
    } catch {}
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.onWindowMessage);
    if (this.onFormReady) {
      window.removeEventListener('message', this.onFormReady);
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
  }
}
