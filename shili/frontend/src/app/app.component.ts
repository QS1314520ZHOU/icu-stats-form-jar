import { Component, NgZone, OnDestroy } from '@angular/core';
import { catchError, finalize, from, switchMap, throwError, timer } from 'rxjs';
import { FormPrintService } from 'dxm-print-archive';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HostPatientService } from './services/host-patient.service';
import { isSmartCareHostMessage } from './models/smartcare-host-message.model';
import {
  captureElementsToPdfBlob,
  DEFAULT_JAVA_PRINT_OPTS,
} from './utils/capture-elements-to-pdf';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {
  private readonly onWindowMessage = (event: MessageEvent): void => {
    if (event.data == null) {
      return;
    }
    if (!isSmartCareHostMessage(event.data)) {
      return;
    }
    this.ngZone.run(() => {
      this.hostPatient.handleHostMessage(event.data);
    });
  };

  constructor(
    private readonly formPrintService: FormPrintService,
    private readonly message: NzMessageService,
    private readonly hostPatient: HostPatientService,
    private readonly ngZone: NgZone,
  ) {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('message', this.onWindowMessage);
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onWindowMessage);
  }

  dispatchToolbarAction(action: 'help' | 'history' | 'add'): void {
    window.dispatchEvent(new CustomEvent(`page-toolbar-${action}`));
  }

  printCurrentPage(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.ngZone.run(() => this.runPrintAfterPreLayout());
      });
    });
  }

  private runPrintAfterPreLayout(): void {
    const containers = Array.from(
      document.querySelectorAll('.a4-landscape-container:not(.a4-page-measure)'),
    ) as HTMLElement[];
    if (!containers.length) {
      this.message.error('当前页面没有可打印内容');
      document.dispatchEvent(new CustomEvent('smartcare-post-print', { bubbles: true }));
      return;
    }

    const msgId = this.message.loading('正在打印中...', { nzDuration: 0 }).messageId;

    // 使用 timer(50) 让出主线程，确保浏览器能先渲染出 loading 提示框，避免点击按钮后感觉卡顿不响应
    timer(50)
      .pipe(
        switchMap(() => from(captureElementsToPdfBlob(containers))),
        switchMap((blob) => {
          this.message.remove(msgId);
          if (!blob) {
            this.message.error('无法生成打印内容');
            return throwError(() => new Error('empty pdf'));
          }
          return this.formPrintService.printPdfByJava(blob, DEFAULT_JAVA_PRINT_OPTS);
        }),
        finalize(() =>
          document.dispatchEvent(new CustomEvent('smartcare-post-print', { bubbles: true })),
        ),
        catchError((err) => {
          this.message.remove(msgId);
          this.message.error('打印失败：请检查打印服务是否可用（控制台查看详情）');
          // eslint-disable-next-line no-console
          console.error('[print] printPdfByJava failed', err);
          return throwError(() => err);
        }),
      )
      .subscribe({
        next: () => this.message.success('已发送打印任务'),
        error: () => undefined,
      });
  }
}
