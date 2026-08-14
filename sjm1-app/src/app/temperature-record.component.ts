import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

@Component({
  standalone: false,
  selector: 'app-temperature-record',
  templateUrl: './temperature-record.component.html',
  styleUrls: ['./temperature-record.component.css'],
})
export class TemperatureRecordComponent implements OnInit, OnDestroy {
  iframeUrl: SafeResourceUrl | null = null;

  private patient: any = null;
  private account: any = null;
  private currentMrn = '';
  private currentUsername = '';
  private currentIframeUrl = '';
  private iframeReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly targetUrl =
    'http://10.35.4.101:8484/third-party-bootstrap/layout.html';

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(patient => {
      this.patient = patient;
      const nextMrn = String(patient?.mrn ?? '').trim();
      const changed = nextMrn !== this.currentMrn;
      this.currentMrn = nextMrn;
      if (!patient || !nextMrn) {
        this.clearCurrentIframe();
        return;
      }
      if (changed) {
        this.refreshIframeUrl(true);
      }
    });

    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(account => {
      this.account = account;
      const nextUsername = String(account?.username ?? '').trim();
      const changed = nextUsername !== this.currentUsername;
      this.currentUsername = nextUsername;
      if (!account || !nextUsername) {
        this.clearCurrentIframe();
        return;
      }
      if (changed) {
        this.refreshIframeUrl(true);
      }
    });
  }

  private clearCurrentIframe(): void {
    if (this.iframeReloadTimer !== null) {
      clearTimeout(this.iframeReloadTimer);
      this.iframeReloadTimer = null;
    }
    this.currentIframeUrl = '';
    this.iframeUrl = null;
  }

  private recreateIframe(nextUrl: string): void {
    if (this.iframeReloadTimer !== null) {
      clearTimeout(this.iframeReloadTimer);
      this.iframeReloadTimer = null;
    }

    this.iframeUrl = null;
    this.cdr.detectChanges();

    this.iframeReloadTimer = setTimeout(() => {
      this.iframeReloadTimer = null;

      if (this.currentIframeUrl !== nextUrl) {
        return;
      }

      this.iframeUrl =
        this.sanitizer.bypassSecurityTrustResourceUrl(nextUrl);

      this.cdr.detectChanges();
    }, 0);
  }

  private refreshIframeUrl(forceReload = false): void {
    const patientId = this.currentMrn;
    const username = this.currentUsername;

    if (!patientId || !username) {
      this.clearCurrentIframe();
      return;
    }

    const params = new URLSearchParams({
      platCode: '99',
      patientId,
      token: username,
      menuCode: 'Third-Temperature-Record',
    });

    const nextUrl = `${this.targetUrl}?${params.toString()}`;

    if (!forceReload && nextUrl === this.currentIframeUrl) return;

    this.currentIframeUrl = nextUrl;
    this.recreateIframe(nextUrl);
  }

  ngOnDestroy(): void {
    if (this.iframeReloadTimer !== null) {
      clearTimeout(this.iframeReloadTimer);
      this.iframeReloadTimer = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
}
