import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { sm4EcbEncryptHex } from './sm4.util';

/**
 * 输血系统（第三方）调阅页。
 * 本地输血记录单表单已屏蔽，改为 iframe 调阅输血系统：
 * sign = SM4-ECB(登录参数) 的 Hex，login_id 取当前登录账号 username，其余为固定默认值。
 */
@Component({
  standalone: false,
  selector: 'app-transfusion-system',
  templateUrl: './transfusion-system.component.html',
  styleUrls: ['./transfusion-system.component.css'],
})
export class TransfusionSystemComponent implements OnInit, OnDestroy {
  iframeUrl: SafeResourceUrl | null = null;

  private account: any = null;
  private currentUsername = '';
  private currentIframeUrl = '';
  private iframeReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly destroy$ = new Subject<void>();

  private readonly targetUrl = 'https://10.35.2.8:18072/bis6/signin';
  private readonly appKey = 'CDYXH72';
  private readonly signKeyHex = '2CC1158DF75C4AB4AADF83CE08195A23';

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(account => {
      this.account = account;
      const nextUsername = String(account?.username ?? '').trim();
      const changed = nextUsername !== this.currentUsername;
      this.currentUsername = nextUsername;
      if (!nextUsername) {
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
    const username = this.currentUsername;

    if (!username) {
      this.clearCurrentIframe();
      return;
    }

    const signPlain =
      `user_type=2&login_id=${username}&dept_id=125011` +
      '&patient_class=1&hospital_id=50A016&area_id=A001';

    let sign: string;
    try {
      sign = sm4EcbEncryptHex(signPlain, this.signKeyHex);
    } catch {
      this.clearCurrentIframe();
      return;
    }

    const nextUrl = `${this.targetUrl}?app_key=${this.appKey}&sign=${sign}`;

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
