import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

@Component({
  standalone: false,
  selector: 'app-blood-sugar',
  templateUrl: './blood-sugar.component.html',
  styleUrls: ['./blood-sugar.component.css'],
})
export class BloodSugarComponent implements OnInit, OnDestroy {
  iframeUrl: SafeResourceUrl | null = null;

  private patient: any = null;
  private account: any = null;
  private currentPatientId = '';
  private currentIframeUrl = '';
  private iframeReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly targetUrl = 'http://10.35.4.101:8484/third-party-bootstrap/layout.html';

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(account => {
      if (!account) return;
      const previousUsername = String(this.account?.username ?? '').trim();
      this.account = account;
      const currentUsername = String(account?.username ?? '').trim();
      if (currentUsername !== previousUsername) {
        this.refreshIframeUrl(true);
      }
    });

    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(patient => {
      if (!patient) return;
      const previousPatientId = this.currentPatientId;
      const currentPatientId = this.resolvePatientId(patient);
      this.patient = patient;
      this.currentPatientId = currentPatientId;
      if (currentPatientId && currentPatientId !== previousPatientId) {
        this.refreshIframeUrl(true);
      }
    });
  }

  private resolvePatientId(patient: any): string {
    return String(
      patient?.id ??
      patient?._id ??
      patient?.pid ??
      patient?.patientId ??
      patient?.patientID ??
      ''
    ).trim();
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
    this.iframeUrl = null;
    this.cdr.detectChanges();
    this.iframeReloadTimer = setTimeout(() => {
      this.iframeReloadTimer = null;
      if (this.currentIframeUrl !== nextUrl) return;
      this.iframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(nextUrl);
      this.cdr.detectChanges();
    }, 0);
  }

  private refreshIframeUrl(forceReload = false): void {
    const patientId = String(this.patient?.mrn ?? '').trim();
    const username = String(this.account?.username ?? '').trim();
    if (!patientId || !username) {
      this.clearCurrentIframe();
      return;
    }
    const params = new URLSearchParams({
      platCode: '99',
      patientId,
      token: username,
      menuCode: 'DOC_PC_NURSING.STATION_777',
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
