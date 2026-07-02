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
  private onWindowMessage = (a: MessageEvent) => {
    if (a?.data?.type === 'SmartCare-form-ready') return; // 忽略自己发的
    console.log('[sjm1] message from host =>', a.origin, a.data); // 定位用，稳定后可删
    this.ngZone.run(() => this.hostPatient.handleHostMessage(a.data));
  };
  constructor(private hostPatient: HostPatientService, private ngZone: NgZone) {
    this.ngZone.runOutsideAngular(() =>
      window.addEventListener('message', this.onWindowMessage));
    try { window.parent?.postMessage({ type: 'SmartCare-form-ready', form: 'sjm1' }, '*'); } catch {}
  }
  ngOnDestroy() { window.removeEventListener('message', this.onWindowMessage); }
}
