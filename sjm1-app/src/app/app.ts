import { Component, NgZone, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HostPatientService } from './services/host-patient.service';
import { isSmartCareHostMessage } from './models/smartcare-host-message.model';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  private readonly onWindowMessage = (event: MessageEvent): void => {
    if (event.data == null) {
      return;
    }
    if (!isSmartCareHostMessage(event.data)) {
      return;
    }
    console.log('[sjm1] message from host =>', event.origin, event.data);
    this.ngZone.run(() => {
      this.hostPatient.handleHostMessage(event.data);
    });
  };

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly ngZone: NgZone,
  ) {
    // 1. 注册 message 监听（最早时机）
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('message', this.onWindowMessage);
    });

    // 2. 回放缓存的消息（index.html 内联脚本暂存的）
    const cached = (window as any).__lastSmartCareMsg;
    if (cached) {
      console.log('[sjm1] replay cached message', cached);
      this.hostPatient.handleHostMessage(cached);
    }

    // 3. 通知宿主：子应用已就绪
    try {
      window.parent?.postMessage({ type: 'SmartCare-form-ready', form: 'sjm1' }, '*');
    } catch {}
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onWindowMessage);
  }
}
