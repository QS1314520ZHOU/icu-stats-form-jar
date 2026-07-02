import { Component, NgZone, OnDestroy, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HostPatientService, isSmartCareMessage } from './host-patient.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('sjm1-app');
  private onWindowMessage = (a: MessageEvent) => {
    if (a?.data != null && isSmartCareMessage(a.data)) {
      this.ngZone.run(() => this.hostPatient.handleHostMessage(a.data));
    }
  };
  constructor(private hostPatient: HostPatientService, private ngZone: NgZone) {
    this.ngZone.runOutsideAngular(() =>
      window.addEventListener('message', this.onWindowMessage));
  }
  ngOnDestroy() { window.removeEventListener('message', this.onWindowMessage); }
}
