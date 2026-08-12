import { Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { combineLatest, Subject } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';

import { HostPatientService } from './services/host-patient.service';

interface BloodSugarContext {
  patientId: string;
  username: string;
}

@Component({
  standalone: false,
  selector: 'app-blood-sugar',
  templateUrl: './blood-sugar.component.html',
  styleUrls: ['./blood-sugar.component.css'],
})
export class BloodSugarComponent implements OnInit, OnDestroy {
  iframeUrl: SafeResourceUrl | null = null;

  private readonly destroy$ = new Subject<void>();

  private readonly targetUrl =
    'http://10.35.4.101:8484/third-party-bootstrap/layout.html';

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.hostPatient.patient$,
      this.hostPatient.account$,
    ])
      .pipe(
        map(([patient, account]): BloodSugarContext => ({
          patientId: String(patient?.mrn ?? '').trim(),
          username: String(account?.username ?? '').trim(),
        })),
        distinctUntilChanged(
          (previous, current) =>
            previous.patientId === current.patientId &&
            previous.username === current.username,
        ),
        takeUntil(this.destroy$),
      )
      .subscribe(({ patientId, username }) => {
        this.updateIframeUrl(patientId, username);
      });
  }

  private updateIframeUrl(patientId: string, username: string): void {
    if (!patientId || !username) {
      this.iframeUrl = null;
      return;
    }

    const params = new URLSearchParams({
      platCode: '99',
      patientId,
      token: username,
      menuCode: 'DOC_PC_NURSING.STATION_777',
    });

    const url = `${this.targetUrl}?${params.toString()}`;

    this.iframeUrl =
      this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
