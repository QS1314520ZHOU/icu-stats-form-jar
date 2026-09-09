import { Component, OnDestroy, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { IcuFormViewerFormDef, IcuFormViewerState, IcuPatient } from './icu-form-viewer.models';
import { ICU_VIEWER_FORMS } from './icu-form-viewer.registry';
import { IcuFormViewerService } from './icu-form-viewer.service';
import { IcuFormViewerContextService } from './icu-form-viewer-context.service';
import { HostPatientService } from './services/host-patient.service';

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
  patientInfo = '';

  private destroy$ = new Subject<void>();
  private querySequence = 0;
  private isUpdatingUrl = false; // 防止 updateUrl 触发无限循环

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private viewerService: IcuFormViewerService,
    private contextService: IcuFormViewerContextService,
    private hostPatient: HostPatientService,
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
      // 如果正在更新 URL，跳过本次触发
      if (this.isUpdatingUrl) {
        return;
      }

      const mrn = params.get('mrn');
      const form = params.get('form');
      const start = params.get('startTime');
      const end = params.get('endTime');
      const startMs = params.get('startTimeMs');
      const endMs = params.get('endTimeMs');

      if (mrn) {
        this.mrnInput = mrn.trim();
      }
      if (form && this.forms.some(f => f.key === form)) {
        this.selectedFormKey = form;
      }

      // 支持时间戳格式和字符串格式
      if (startMs) {
        const date = new Date(Number(startMs));
        if (!isNaN(date.getTime())) {
          this.startTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
      } else if (start) {
        this.startTime = start;
      }

      if (endMs) {
        const date = new Date(Number(endMs));
        if (!isNaN(date.getTime())) {
          this.endTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
      } else if (end) {
        this.endTime = end;
      }

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

    // 清理旧数据
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
    // 用户输入的结束分钟按整分钟包含，转换为下一分钟的排他边界
    const endExclusive = new Date(endInstant.getTime() + 60 * 1000);

    const startTimeIso = IcuFormViewerContextService.toIsoOffset(startInstant);
    const endTimeIso = IcuFormViewerContextService.toIsoOffset(endExclusive);
    const startTimeMs = IcuFormViewerContextService.toTimestamp(startInstant);
    const endTimeMs = IcuFormViewerContextService.toTimestamp(endExclusive);

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

            // CLIENT_SIDE：前端自行判断，直接显示表单
            if (resp.status === 'CLIENT_SIDE') {
              this.loadFormData(pid, startTimeMs, endTimeMs);
              this.updateUrl(mrn, startTimeMs, endTimeMs);
              return;
            }

            if (!resp.hasData) {
              this.state = 'no-form-data';
              this.errorMessage = resp.message || '没有相关的表单数据';
              this.cdr.markForCheck();
              return;
            }

            // Step 3: 加载表单数据
            this.loadFormData(pid, startTimeMs, endTimeMs);
            this.updateUrl(mrn, startTimeMs, endTimeMs);
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

  /** 加载表单数据 - 直接传递患者数据给服务 */
  private loadFormData(pid: string, startTimeMs: string, endTimeMs: string): void {
    this.state = 'loading-form';
    this.cdr.markForCheck();

    // 封装患者数据为 SmartCare 格式
    const patientPayload = this.patient || { id: pid };
    const smartCareMessage = {
      type: 'SmartCare',
      patient: patientPayload,
    };

    // 直接传递患者数据给 HostPatientService
    this.hostPatient.handleHostMessage(smartCareMessage);

    // 表单状态切换为 ready，子表单会自动监听 patient$ 并加载数据
    this.state = 'ready';
    this.cdr.markForCheck();
  }

  /** 更新 URL 查询参数（不刷新页面） */
  private updateUrl(mrn: string, startTimeMs?: string, endTimeMs?: string): void {
    // 设置标志位，防止触发无限循环
    this.isUpdatingUrl = true;

    const queryParams: any = {
      mrn,
      form: this.selectedFormKey,
    };
    // 优先使用时间戳格式
    if (startTimeMs && endTimeMs) {
      queryParams.startTimeMs = startTimeMs;
      queryParams.endTimeMs = endTimeMs;
    } else {
      queryParams.startTime = this.startTime;
      queryParams.endTime = this.endTime;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }).finally(() => {
      // 在下一个 tick 重置标志位
      setTimeout(() => {
        this.isUpdatingUrl = false;
      }, 0);
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
