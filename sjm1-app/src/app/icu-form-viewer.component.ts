import { Component, OnDestroy, OnInit, NgZone, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, timer } from 'rxjs';
import { switchMap, takeUntil, filter, debounceTime } from 'rxjs/operators';
import { IcuFormViewerFormDef, IcuFormViewerState, IcuPatient } from './icu-form-viewer.models';
import { ICU_VIEWER_FORMS } from './icu-form-viewer.registry';
import { IcuFormViewerService } from './icu-form-viewer.service';
import { IcuFormViewerContextService } from './icu-form-viewer-context.service';

@Component({
  standalone: false,
  selector: 'app-icu-form-viewer',
  templateUrl: './icu-form-viewer.component.html',
  styleUrls: ['./icu-form-viewer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IcuFormViewerComponent implements OnInit, OnDestroy {

  readonly forms = ICU_VIEWER_FORMS;

  selectedFormKey = 'hljldFormPDFNew';
  mrnInput = '';
  startTime = '';
  endTime = '';
  state: IcuFormViewerState = 'idle';
  patient: IcuPatient | null = null;
  errorMessage = '';
  iframeSrc = '';
  patientInfo = '';

  private destroy$ = new Subject<void>();
  private querySequence = 0;
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private iframeLoadHandler: (() => void) | null = null;
  private readyTimer: any = null;
  private readyCount = 0;
  private readonly MAX_READY_RETRIES = 10;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private viewerService: IcuFormViewerService,
    private contextService: IcuFormViewerContextService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // 初始化默认时间
    this.startTime = IcuFormViewerContextService.getTodayStart();
    this.endTime = IcuFormViewerContextService.getTodayEnd();

    // 从 URL 读取查询参数
    this.route.queryParamMap.pipe(
      takeUntil(this.destroy$),
    ).subscribe(params => {
      const mrn = params.get('mrn');
      const form = params.get('form');
      const start = params.get('startTime');
      const end = params.get('endTime');

      if (mrn) {
        this.mrnInput = mrn.trim();
      }
      if (form && this.forms.some(f => f.key === form)) {
        this.selectedFormKey = form;
      }
      if (start) this.startTime = start;
      if (end) this.endTime = end;

      // URL 中有 mrn 时自动查询
      if (this.mrnInput) {
        this.doQuery();
      }

      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupIframe();
  }

  /** 获取当前选中的表单定义 */
  get selectedForm(): IcuFormViewerFormDef {
    return this.forms.find(f => f.key === this.selectedFormKey) || this.forms[0];
  }

  /** 表单下拉框变更 */
  onFormChange(): void {
    if (this.patient && this.patient.id) {
      // 已有患者，自动重新查询
      this.doQuery();
    }
    // 无患者时只修改选中项
  }

  /** 点击查询按钮 */
  onQuery(): void {
    const mrn = this.mrnInput.trim();
    if (!mrn) {
      this.state = 'error';
      this.errorMessage = '请输入住院号';
      this.cdr.markForCheck();
      // 聚焦住院号输入框
      const input = document.getElementById('mrn-input') as HTMLInputElement;
      if (input) input.focus();
      return;
    }

    // 校验时间格式
    const timePattern = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/;
    if (!timePattern.test(this.startTime) || !timePattern.test(this.endTime)) {
      this.state = 'error';
      this.errorMessage = '时间格式不正确，请使用 yyyy-MM-dd HH:mm';
      this.cdr.markForCheck();
      return;
    }

    // 校验时间先后
    const start = IcuFormViewerContextService.parseShanghaiDateTime(this.startTime);
    const end = IcuFormViewerContextService.parseShanghaiDateTime(this.endTime);
    if (!start || !end) {
      this.state = 'error';
      this.errorMessage = '时间格式不正确，请使用 yyyy-MM-dd HH:mm';
      this.cdr.markForCheck();
      return;
    }
    if (start.getTime() > end.getTime()) {
      this.state = 'error';
      this.errorMessage = '开始时间不能晚于结束时间';
      this.cdr.markForCheck();
      return;
    }

    this.doQuery();
  }

  /** 执行查询流程 */
  private doQuery(): void {
    const seq = ++this.querySequence;
    const mrn = this.mrnInput.trim();

    if (!mrn) {
      this.state = 'error';
      this.errorMessage = '请输入住院号';
      this.cdr.markForCheck();
      return;
    }

    // 清理旧 iframe
    this.cleanupIframe();
    this.patient = null;
    this.patientInfo = '';

    // 计算查询时间范围
    const startInstant = IcuFormViewerContextService.parseShanghaiDateTime(this.startTime);
    const endInstant = IcuFormViewerContextService.parseShanghaiDateTime(this.endTime);
    if (!startInstant || !endInstant) {
      this.state = 'error';
      this.errorMessage = '时间格式不正确，请使用 yyyy-MM-dd HH:mm';
      this.cdr.markForCheck();
      return;
    }
    // 结束时间补到秒级末尾 59
    const endWithSeconds = new Date(endInstant.getTime() + 59 * 1000);

    const startTimeIso = IcuFormViewerContextService.toIsoOffset(startInstant);
    const endTimeIso = IcuFormViewerContextService.toIsoOffset(endWithSeconds);

    // Step 1: 查询患者
    this.state = 'loading-patient';
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.viewerService.getPatientByMrn(mrn).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: (patient) => {
        if (seq !== this.querySequence) return;

        if (!patient) {
          this.state = 'patient-not-found';
          this.errorMessage = '请输入正确的住院号再进行查询';
          this.cdr.markForCheck();
          return;
        }

        const pid = patient.id || patient._id;
        if (!pid) {
          this.state = 'error';
          this.errorMessage = '系统错误：患者数据缺少有效 ID';
          this.cdr.markForCheck();
          return;
        }

        this.patient = patient;
        this.patientInfo = this.buildPatientInfo(patient);

        // Step 2: 检查表单数据可用性
        this.state = 'checking-data';
        this.cdr.markForCheck();

        this.viewerService.checkFormAvailability(
          pid, this.selectedFormKey, startTimeIso, endTimeIso
        ).pipe(
          takeUntil(this.destroy$),
        ).subscribe({
          next: (resp) => {
            if (seq !== this.querySequence) return;

            if (resp.status === 'ERROR') {
              this.state = 'error';
              this.errorMessage = resp.message || '查询失败，请稍后重试';
              this.cdr.markForCheck();
              return;
            }

            // CLIENT_SIDE：前端自行判断，直接加载 iframe
            if (resp.status === 'CLIENT_SIDE') {
              this.loadFormIframe(pid, startTimeIso, endTimeIso);
              this.updateUrl(mrn);
              return;
            }

            if (!resp.hasData) {
              this.state = 'no-form-data';
              this.errorMessage = resp.message || '没有相关的表单数据';
              this.cdr.markForCheck();
              return;
            }

            // Step 3: 加载表单 iframe
            this.loadFormIframe(pid, startTimeIso, endTimeIso);
            this.updateUrl(mrn);
          },
          error: () => {
            if (seq !== this.querySequence) return;
            this.state = 'error';
            this.errorMessage = '查询失败，请稍后重试';
            this.cdr.markForCheck();
          }
        });
      },
      error: (err) => {
        if (seq !== this.querySequence) return;
        if (err.status === 404) {
          this.state = 'patient-not-found';
          this.errorMessage = '请输入正确的住院号再进行查询';
        } else {
          this.state = 'error';
          this.errorMessage = '查询失败，请稍后重试';
        }
        this.cdr.markForCheck();
      }
    });
  }

  /** 加载表单 iframe */
  private loadFormIframe(pid: string, startTimeIso: string, endTimeIso: string): void {
    this.state = 'loading-form';
    this.cdr.markForCheck();

    const form = this.selectedForm;
    const src = `/form/${form.route}?viewer=1&startTime=${encodeURIComponent(startTimeIso)}&endTime=${encodeURIComponent(endTimeIso)}`;
    this.iframeSrc = src;

    // 等待 Angular 更新 iframe src，然后设置 load 和 message 监听
    setTimeout(() => {
      this.setupIframeListeners(pid);
    }, 0);
  }

  /** 设置 iframe 的 load 和 message 监听 */
  private setupIframeListeners(pid: string): void {
    const iframe = document.getElementById('viewer-iframe') as HTMLIFrameElement;
    if (!iframe) {
      this.state = 'ready';
      this.cdr.markForCheck();
      return;
    }

    // 监听子页面的 SmartCareReady 消息
    this.messageHandler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SmartCareReady') {
        this.sendPatientToIframe(iframe, pid);
      }
    };
    window.addEventListener('message', this.messageHandler);

    // iframe load 事件
    this.iframeLoadHandler = () => {
      // iframe 加载完成后也尝试发送患者信息
      this.sendPatientToIframe(iframe, pid);
    };
    iframe.addEventListener('load', this.iframeLoadHandler);

    // 超时重试：如果 iframe 一直没有收到 SmartCareReady，定时重试
    this.readyCount = 0;
    this.readyTimer = timer(500, 500).pipe(
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.readyCount++;
      if (this.readyCount >= this.MAX_READY_RETRIES) {
        if (this.readyTimer) {
          this.readyTimer.unsubscribe();
          this.readyTimer = null;
        }
        return;
      }
      try {
        this.sendPatientToIframe(iframe, pid);
      } catch (_) {
        // 跨域或 iframe 未就绪
      }
    });

    this.state = 'ready';
    this.cdr.markForCheck();
  }

  /** 向 iframe 发送患者信息 */
  private sendPatientToIframe(iframe: HTMLIFrameElement, pid: string): void {
    if (!iframe.contentWindow) return;
    const patientPayload = this.patient || { id: pid };
    iframe.contentWindow.postMessage(
      { type: 'SmartCare', patient: patientPayload },
      window.location.origin
    );
  }

  /** 清理 iframe 相关监听 */
  private cleanupIframe(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    if (this.readyTimer) {
      this.readyTimer.unsubscribe();
      this.readyTimer = null;
    }
    // iframe 的 load 监听会在 iframe 被替换时自动清理
    this.iframeLoadHandler = null;
    this.readyCount = 0;
  }

  /** 更新 URL 查询参数（不刷新页面） */
  private updateUrl(mrn: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        mrn,
        form: this.selectedFormKey,
        startTime: this.startTime,
        endTime: this.endTime,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** 构建患者简要信息 */
  private buildPatientInfo(patient: IcuPatient): string {
    const parts: string[] = [];
    if (patient.name) parts.push(patient.name);
    if (patient.hisBed) parts.push(patient.hisBed + '床');
    if (patient.gender) {
      parts.push(patient.gender === 'Male' ? '男' : patient.gender === 'Female' ? '女' : patient.gender);
    }
    return parts.join(' · ');
  }
}
