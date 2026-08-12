import { Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { combineLatest, Subject } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';

import { HostPatientService } from './services/host-patient.service';

interface BloodSugarContext {
  patientId: string;
  username: string;
  patient: any;
  account: any;
}

@Component({
  standalone: false,
  selector: 'app-blood-sugar',
  templateUrl: './blood-sugar.component.html',
  styleUrls: ['./blood-sugar.component.css'],
})
export class BloodSugarComponent implements OnInit, OnDestroy {
  iframeUrl: SafeResourceUrl | null = null;
  /** 未经 Angular SafeResourceUrl 包装的完整地址，仅用于控制台诊断 */
  rawIframeUrl = '';

  private readonly destroy$ = new Subject<void>();

  private readonly targetUrl =
    'http://10.35.4.101:8484/third-party-bootstrap/layout.html';

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    console.log('[bloodSugar] 组件初始化，等待 patient 和 account 握手数据');

    combineLatest([
      this.hostPatient.patient$,
      this.hostPatient.account$,
    ])
      .pipe(
        map(([patient, account]): BloodSugarContext => ({
          patientId: String(patient?.mrn ?? '').trim(),
          username: String(account?.username ?? '').trim(),
          patient,
          account,
        })),
        distinctUntilChanged(
          (previous, current) =>
            previous.patientId === current.patientId &&
            previous.username === current.username,
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((context) => {
        console.group('[bloodSugar] 收到握手上下文');
        console.log('[bloodSugar] 原始 patient：', context.patient);
        console.log('[bloodSugar] 原始 account：', context.account);
        console.log('[bloodSugar] 原始 patient.mrn：', context.patient?.mrn);
        console.log('[bloodSugar] 原始 account.username：', context.account?.username);
        console.log('[bloodSugar] 最终 patientId：', context.patientId);
        console.log('[bloodSugar] 最终 token：', context.username);
        console.groupEnd();

        this.updateIframeUrl(context.patientId, context.username);
      });
  }

  private updateIframeUrl(patientId: string, username: string): void {
    if (!patientId || !username) {
      this.rawIframeUrl = '';
      this.iframeUrl = null;
      console.error('[bloodSugar] 无法生成加载地址', {
        patientId,
        username,
        missingParameter: !patientId ? 'patient.mrn' : 'account.username',
      });
      return;
    }

    const queryParameters = {
      platCode: '99',
      patientId,
      token: username,
      menuCode: 'DOC_PC_NURSING.STATION_777',
    };

    console.table(queryParameters);

    const params = new URLSearchParams(queryParameters);
    this.rawIframeUrl = `${this.targetUrl}?${params.toString()}`;

    console.log('[bloodSugar] 最终加载地址：', this.rawIframeUrl);

    this.iframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.rawIframeUrl);
  }

  onIframeLoad(): void {
    console.log('[bloodSugar] iframe load 事件已触发', { url: this.rawIframeUrl });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    console.log('[bloodSugar] 组件已销毁');
  }
}
