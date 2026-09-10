import { Component, OnDestroy, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { IcuFormViewerFormDef, IcuFormViewerState, IcuPatient } from './icu-form-viewer.models';
import { ICU_VIEWER_FORMS } from './icu-form-viewer.registry';
import { IcuFormViewerService } from './icu-form-viewer.service';
import { IcuFormViewerContextService } from './icu-form-viewer-context.service';
import { HostPatientService } from './services/host-patient.service';

/** 需要时间范围选择的表单 key */
const TIME_RANGE_FORMS = new Set([
  'hljldFormPDFNew',   // 重症监护护理记录单
  'handoverReport',    // ICU 交班报告
  'crrtOrderForm',     // CRRT 治疗医嘱单
  'crrtForm',          // CRRT 护理记录单（血液净化）
]);

/** 只需要单日选择的表单 key */
const SINGLE_DAY_FORMS = new Set([
  'handoverReport',    // ICU 交班报告（只展示一天）
]);

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
  startDate = ''; // yyyy-MM-dd 格式
  endDate = '';   // yyyy-MM-dd 格式
  singleDate = ''; // 单日日期（交班报告用）
  state: IcuFormViewerState = 'idle';
  patient: IcuPatient | null = null;
  errorMessage = '';
  patientInfo = '';
  isViewerMode = false; // 调阅模式，所有控件只读

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
    // 初始化默认日期（今天）
    this.startDate = IcuFormViewerContextService.getTodayDate();
    this.endDate = IcuFormViewerContextService.getTodayDate();
    this.singleDate = this.startDate;

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
      const start = params.get('startDate');
      const end = params.get('endDate');
      const startMs = params.get('startTimeMs');
      const endMs = params.get('endTimeMs');
      const viewer = params.get('viewer');

      // 设置调阅模式标志
      this.isViewerMode = viewer === '1';

      if (mrn) {
        this.mrnInput = mrn.trim();
      }
      if (form && this.forms.some(f => f.key === form)) {
        this.selectedFormKey = form;
      }

      // 支持时间戳格式和日期字符串格式
      if (startMs) {
        const date = new Date(Number(startMs));
        if (!isNaN(date.getTime())) {
          this.startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
      } else if (start) {
        this.startDate = start;
      }

      if (endMs) {
        const date = new Date(Number(endMs));
        if (!isNaN(date.getTime())) {
          this.endDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
      } else if (end) {
        this.endDate = end;
      }

      // 同步单日日期（用于交班报告）
      this.singleDate = this.startDate;

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

  /** 当前表单是否需要时间范围选择 */
  get needTimeRange(): boolean {
    return TIME_RANGE_FORMS.has(this.selectedFormKey);
  }

  /** 当前表单是否只需要单日选择 */
  get isSingleDayForm(): boolean {
    return SINGLE_DAY_FORMS.has(this.selectedFormKey);
  }

  /** 表单下拉框变更 */
  onFormChange(): void {
    if (this.patient && this.patient.id) {
      // 已有患者，自动重新查询
      this.doQuery();
    }
    // 无患者时只修改选中项
  }

  /** 单日日期变更（交班报告用） */
  onSingleDateChange(): void {
    if (this.singleDate) {
      this.startDate = this.singleDate;
      this.endDate = this.singleDate;
      if (this.patient && this.patient.id) {
        this.doQuery();
      }
    }
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

    // 校验日期格式
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(this.startDate) || !datePattern.test(this.endDate)) {
      this.state = 'error';
      this.errorMessage = '日期格式不正确，请选择正确的日期';
      this.cdr.markForCheck();
      return;
    }

    // 校验日期先后
    if (this.startDate > this.endDate) {
      this.state = 'error';
      this.errorMessage = '开始日期不能晚于结束日期';
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

    // 计算查询时间范围（日期转时间戳）
    // 开始日期：当天 00:00:00
    const startInstant = IcuFormViewerContextService.parseDateStart(this.startDate);
    // 结束日期：当天 23:59:59（包含全天数据）
    const endInstant = IcuFormViewerContextService.parseDateEnd(this.endDate);
    if (!startInstant || !endInstant) {
      this.state = 'error';
      this.errorMessage = '日期格式不正确';
      this.cdr.markForCheck();
      return;
    }

    const startTimeMs = IcuFormViewerContextService.toTimestamp(startInstant);
    const endTimeMs = IcuFormViewerContextService.toTimestamp(endInstant);

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

        // Step 2: 直接加载表单数据，子表单会自己查询数据
        this.loadFormData(pid, startTimeMs, endTimeMs);
        this.updateUrl(mrn, startTimeMs, endTimeMs);
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
    // 先设置为非 ready 状态，销毁子组件
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

    // 传递时间范围给子表单
    if (this.needTimeRange) {
      this.hostPatient.setTimeRange(startTimeMs, endTimeMs);
    }

    // 在下一个 tick 设置为 ready，确保子组件被销毁后重新创建
    setTimeout(() => {
      this.state = 'ready';
      this.cdr.markForCheck();
    }, 0);
  }

  /** 更新 URL 查询参数（不刷新页面） */
  private updateUrl(mrn: string, startTimeMs?: string, endTimeMs?: string): void {
    // 设置标志位，防止触发无限循环
    this.isUpdatingUrl = true;

    const queryParams: any = {
      mrn,
      form: this.selectedFormKey,
      viewer: '1', // 标记为 viewer 模式，让子表单隐藏工具栏
      startDate: this.startDate,
      endDate: this.endDate,
    };
    // 交班报告只需日期字符串，HLJLD 等需要时间戳
    if (!this.isSingleDayForm && startTimeMs && endTimeMs) {
      queryParams.startTimeMs = startTimeMs;
      queryParams.endTimeMs = endTimeMs;
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
