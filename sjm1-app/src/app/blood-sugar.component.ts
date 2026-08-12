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
        this.refreshIframeUrl();
      }
    });

    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(patient => {
      if (!patient) return;
      const previousPatientId = this.currentPatientId;
      const currentPatientId = this.resolvePatientId(patient);
      this.patient = patient;
      this.currentPatientId = currentPatientId;
      if (currentPatientId && currentPatientId !== previousPatientId) {
        this.clearCurrentIframe();
        this.cdr.detectChanges();
        this.refreshIframeUrl();
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
    this.currentIframeUrl = '';
    this.iframeUrl = null;
  }

  private refreshIframeUrl(): void {
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
    if (nextUrl === this.currentIframeUrl) return;
    this.currentIframeUrl = nextUrl;
    this.iframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(nextUrl);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
