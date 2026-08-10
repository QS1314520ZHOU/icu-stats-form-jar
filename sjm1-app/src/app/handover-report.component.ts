import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { ReplaySubject, Subject, combineLatest, EMPTY } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import {
  DepartmentContext,
  DepartmentDailySnapshot,
  DepartmentPatient,
  DraftConflictError,
  HandoverPatientRow,
  HandoverReportViewModel,
  MetricRow,
  NurseRecord,
  NurseRecordOption,
  ShiftKey,
} from './handover-report.models';
import { HandoverReportService } from './handover-report.service';
import { HostPatientService } from './services/host-patient.service';
import { buildHandoverReport } from './handover-report.utils';
import {
  HandoverPrintPage,
  PatientTableMeasurement,
  createMeasurementContainer,
  destroyMeasurementContainer,
  measurePatientTableRows,
  paginatePatientTable,
  waitForFonts,
  waitForStableRender,
  generatePrintPagesHtml,
} from './handover-report-print.util';

/**
 * 保存状态类型。
 */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

@Component({
  standalone: false,
  selector: 'app-handover-report',
  templateUrl: './handover-report.component.html',
  styleUrls: ['./handover-report.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandoverReportComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new ReplaySubject<void>(1);
  private readonly dateInput$ = new ReplaySubject<string>(1);

  @ViewChildren('autoResizeTextarea')
  private autoResizeTextareas!: QueryList<ElementRef<HTMLTextAreaElement>>;

  @ViewChild('printContainer')
  printContainerRef!: ElementRef<HTMLDivElement>;

  selectedDate = new Date();
  dateInput = this.toDateInput(this.selectedDate);
  departmentContext: DepartmentContext | null = null;

  loading = false;
  error = '';

  /**
   * 保存状态：idle | saving | saved | error | conflict
   */
  saveStatus: SaveStatus = 'idle';

  /**
   * 保存错误信息。
   */
  saveError = '';

  /**
   * 是否有未保存的修改。
   */
  hasUnsavedChanges = false;

  /**
   * 是否正在准备打印（分页渲染中）。
   */
  isPreparingPrint = false;

  /**
   * afterprint 清理函数引用，用于组件销毁时移除。
   */
  private printCleanupFn: (() => void) | null = null;

  snapshot?: DepartmentDailySnapshot;
  vm?: HandoverReportViewModel;

  // ==================== 危重患者选择 ====================

  criticalDialogVisible = false;

  /**
   * 临时选择的患者ID集合，用于弹窗中的两阶段选择。
   */
  pendingCriticalPatientIds = new Set<string>();

  /**
   * 危重患者保存中状态。
   */
  criticalSelectionSaving = false;

  /**
   * 危重患者选择错误信息。
   */
  criticalSelectionError = '';

  /**
   * 当前登录用户ID，用于selectedBy字段。
   */
  currentAccountId = '';

  // ==================== 护理记录弹窗 ====================

  nurseRecordDialogVisible = false;
  recordTarget?: { row: HandoverPatientRow; shift: ShiftKey };
  nurseRecords: NurseRecordOption[] = [];
  selectedRecordIds = new Set<string>();
  nurseRecordLoading = false;
  nurseRecordError = '';

  /** 防止上一个患者的请求晚返回覆盖当前弹窗 */
  private nurseRecordRequestSequence = 0;

  constructor(
    private readonly service: HandoverReportService,
    private readonly hostPatient: HostPatientService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // 科室上下文：combineLatest patient$ + account$
    combineLatest({
      patient: this.hostPatient.patient$.pipe(map((p: any) => p ?? null)),
      account: this.hostPatient.account$.pipe(map((a: any) => a ?? null)),
    }).pipe(
      takeUntil(this.destroy$),
      map(({ patient, account }) => {
        // 提取当前用户ID
        if (account?.id) {
          this.currentAccountId = account.id;
        } else if (account?.userId) {
          this.currentAccountId = account.userId;
        }
        return this.resolveDepartmentContext(patient, account) as DepartmentContext | null;
      }),
      distinctUntilChanged((a: DepartmentContext | null, b: DepartmentContext | null) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.departmentName === b.departmentName && a.departmentCode === b.departmentCode;
      }),
    ).subscribe((ctx: DepartmentContext | null) => {
      this.departmentContext = ctx;
      if (!ctx) {
        this.error = '未获取到当前科室，请检查患者或账号的科室配置。';
        this.cdr.markForCheck();
        return;
      }
      const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
      if (isDev) { console.info('[HANDOVER][department]', ctx); }
      this.reload$.next();
    });

    // 加载触发
    this.reload$.pipe(
      takeUntil(this.destroy$),
      map(() => ({ reportDate: this.dateInput, department: this.departmentContext?.departmentName, departmentCode: this.departmentContext?.departmentCode })),
      switchMap(condition => {
        this.loading = true;
        this.error = '';
        this.cdr.markForCheck();
        return this.service.loadDaily(condition).pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }));
      }),
    ).subscribe({
      next: snapshot => {
        this.snapshot = snapshot;
        this.hasUnsavedChanges = false;
        this.saveStatus = 'idle';
        this.rebuild();
      },
      error: error => { this.error = error?.message || '交班报告加载失败'; this.cdr.markForCheck(); },
    });
  }

  ngOnDestroy(): void {
    // 移除打印清理监听器
    this.removePrintCleanup();
    // 检查未保存内容
    if (this.hasUnsavedChanges) {
      console.warn('[HANDOVER] 页面关闭时存在未保存内容');
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    this.resizeAllTextareas();
    this.autoResizeTextareas?.changes
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.resizeAllTextareas();
      });
  }

  // ==================== textarea 自动高度 ====================

  autoResizeTextarea(textarea: HTMLTextAreaElement): void {
    if (!textarea) { return; }
    textarea.style.height = 'auto';
    const minHeight = parseFloat(getComputedStyle(textarea).minHeight) || 30;
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
  }

  onTextareaInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea) { return; }
    this.autoResizeTextarea(textarea);
  }

  private resizeAllTextareas(): void {
    requestAnimationFrame(() => {
      this.autoResizeTextareas?.forEach(ref => {
        this.autoResizeTextarea(ref.nativeElement);
      });
    });
  }

  previousDay(): void { this.moveDate(-1); }
  nextDay(): void { this.moveDate(1); }
  today(): void { this.selectedDate = new Date(); this.dateInput = this.toDateInput(this.selectedDate); this.dateInput$.next(this.dateInput); this.reload$.next(); }
  onDateChange(value: string): void {
    if (this.hasUnsavedChanges) {
      if (!confirm('当前有未保存的修改，切换日期将丢失这些修改。是否继续？')) {
        return;
      }
    }
    const d = new Date(`${value}T00:00:00`);
    if (isNaN(d.getTime())) return;
    this.selectedDate = d;
    this.dateInput = value;
    this.dateInput$.next(value);
    this.reload$.next();
  }

  // ==================== 危重患者选择（两阶段选择） ====================

  /**
   * 打开危重患者选择弹窗，复制数据库中的选择到临时集合。
   */
  openCriticalDialog(): void {
    const selectedIds = this.snapshot?.draft.criticalPatients
      ?.map(item => String(item.patientId ?? '').trim())
      .filter(Boolean) ?? [];

    this.pendingCriticalPatientIds = new Set(selectedIds);
    this.criticalSelectionError = '';
    this.criticalDialogVisible = true;
    this.cdr.markForCheck();
  }

  /**
   * 关闭危重患者选择弹窗（取消）。
   */
  closeCriticalDialog(): void {
    this.cancelCriticalSelection();
  }

  /**
   * 取消危重患者选择，完全丢弃临时修改。
   */
  cancelCriticalSelection(): void {
    this.pendingCriticalPatientIds.clear();
    this.criticalSelectionError = '';
    this.criticalDialogVisible = false;
    this.cdr.markForCheck();
  }

  /**
   * 统一获得患者唯一ID。
   * 优先使用id，其次使用_id。
   * 防御性处理：过滤无效值如 [object Object]、undefined、null。
   */
  patientKey(patient: DepartmentPatient): string {
    const raw = patient.id ?? patient._id ?? '';
    const id = String(raw).trim();
    // 过滤无效值：[object Object]、undefined、null 的字符串形式
    if (!id || id === '[object Object]' || id === 'undefined' || id === 'null') {
      return '';
    }
    return id;
  }

  /**
   * 检查患者是否有有效的唯一ID。
   */
  hasPatientKey(patient: DepartmentPatient): boolean {
    return this.patientKey(patient).length > 0;
  }

  /**
   * 检查患者是否可选为危重患者。
   * 排除当日入院/转入/出院/转出/死亡的患者。
   */
  isCriticalSelectable(patient: DepartmentPatient): boolean {
    const ranges = this.vm?.ranges;
    if (!ranges) return false;

    const admissionShift = this.resolvePatientEventShift(patient.icuAdmissionTime, ranges);
    const dischargeShift = this.resolvePatientEventShift(patient.icuDischargeTime, ranges);

    const admissionType = String(patient.admissionType ?? '');
    const dischargedType = String(patient.dischargedType ?? '');

    const isSameDayAdmission = !!admissionShift && (admissionType.includes('入院') || admissionType.includes('转入'));
    const isSameDayDischarge = !!dischargeShift && (
      dischargedType.includes('出院') ||
      dischargedType.includes('转出') ||
      dischargedType.includes('转科') ||
      dischargedType.includes('死亡')
    );

    return !isSameDayAdmission && !isSameDayDischarge;
  }

  /**
   * 解析患者事件发生的班次。
   */
  private resolvePatientEventShift(time: string | undefined, ranges: Record<string, { start: Date; end: Date }>): string | null {
    if (!time) return null;
    const ts = new Date(time).getTime();
    if (isNaN(ts)) return null;

    for (const [key, range] of Object.entries(ranges)) {
      if (ts >= range.start.getTime() && ts < range.end.getTime()) {
        return key;
      }
    }
    return null;
  }

  /**
   * 检查患者是否在临时选择中。
   */
  isPendingCriticalSelected(patient: DepartmentPatient): boolean {
    const id = this.patientKey(patient);
    return !!id && this.pendingCriticalPatientIds.has(id);
  }

  /**
   * 获取可选为危重患者的患者列表。
   * 排除当日入院/转入/出院/转出/死亡的患者。
   */
  get criticalCandidatePatients(): DepartmentPatient[] {
    return this.snapshot?.patients?.filter(p => this.isCriticalSelectable(p)) ?? [];
  }

  /**
   * 切换临时选择状态。
   */
  togglePendingCritical(patient: DepartmentPatient, checked: boolean): void {
    const id = this.patientKey(patient);
    if (!id) {
      this.criticalSelectionError = '该患者缺少唯一ID，无法选择。';
      this.cdr.markForCheck();
      return;
    }

    const next = new Set(this.pendingCriticalPatientIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.pendingCriticalPatientIds = next;
    this.criticalSelectionError = '';
    this.cdr.markForCheck();
  }

  /**
   * 确认危重患者选择，提交到数据库。
   */
  confirmCriticalSelection(): void {
    if (!this.snapshot || this.criticalSelectionSaving) {
      return;
    }

    const patientIds = Array.from(this.pendingCriticalPatientIds);

    // 校验每个患者ID非空且唯一
    const uniqueIds = new Set(patientIds);
    if (uniqueIds.size !== patientIds.length) {
      this.criticalSelectionError = '存在重复的患者ID，请检查选择。';
      this.cdr.markForCheck();
      return;
    }

    this.criticalSelectionSaving = true;
    this.criticalSelectionError = '';
    this.cdr.markForCheck();

    this.service.replaceCriticalPatients({
      departmentId: this.snapshot.draft.departmentId,
      reportDate: this.snapshot.draft.reportDate,
      baseVersion: this.snapshot.draft.version,
      patientIds,
      selectedBy: this.currentAccountId,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.criticalSelectionSaving = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: draft => {
        if (!this.snapshot) { return; }
        this.snapshot.draft = draft;
        this.criticalDialogVisible = false;
        this.pendingCriticalPatientIds.clear();
        this.hasUnsavedChanges = false;
        this.rebuild();
      },
      error: error => {
        if (error?.status === 409 || error?.status === 412) {
          this.criticalSelectionError = '危重患者选择已被其他用户修改，请重新加载后再提交。';
        } else {
          this.criticalSelectionError = error?.error?.message || '危重患者选择保存失败';
        }
        // 不清空pendingCriticalPatientIds，保留用户本次选择
        this.cdr.markForCheck();
      },
    });
  }

  // ==================== 患者交班文本 ====================

  canEditShift(row: HandoverPatientRow, shift: ShiftKey): boolean {
    return row.editableShifts.includes(shift);
  }

  /**
   * 更新患者交班文本，使用字段级补丁保存。
   */
  updatePatientText(row: HandoverPatientRow, shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    // 更新 draft
    if (!this.snapshot.draft.patientTexts[row.key]) {
      this.snapshot.draft.patientTexts[row.key] = {};
    }
    this.snapshot.draft.patientTexts[row.key][shift] = value;

    // 关键：立即同步当前表格显示
    row.shiftTexts = {
      ...row.shiftTexts,
      [shift]: value,
    };

    this.hasUnsavedChanges = true;
    this.cdr.markForCheck();

    // 使用防抖字段级保存
    this.debouncedSavePatientText(row.key, shift, value);
  }

  /**
   * 防抖保存患者交班文本。
   */
  private savePatientTextTimers = new Map<string, any>();

  private debouncedSavePatientText(rowKey: string, shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    const timerKey = `${rowKey}.${shift}`;
    if (this.savePatientTextTimers.has(timerKey)) {
      clearTimeout(this.savePatientTextTimers.get(timerKey));
    }

    const timerId = setTimeout(() => {
      this.savePatientTextTimers.delete(timerKey);
      this.doSavePatientText(rowKey, shift, value);
    }, 500);

    this.savePatientTextTimers.set(timerKey, timerId);
  }

  private doSavePatientText(rowKey: string, shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    this.saveStatus = 'saving';
    this.cdr.markForCheck();

    this.service.setPatientText({
      departmentId: this.snapshot.draft.departmentId,
      reportDate: this.snapshot.draft.reportDate,
      baseVersion: this.snapshot.draft.version,
      rowKey,
      shift,
      value,
    }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: draft => {
        if (!this.snapshot) { return; }
        this.snapshot.draft = draft;
        this.hasUnsavedChanges = false;
        this.saveStatus = 'saved';
        this.cdr.markForCheck();
        // 3秒后恢复为idle
        setTimeout(() => {
          if (this.saveStatus === 'saved') {
            this.saveStatus = 'idle';
            this.cdr.markForCheck();
          }
        }, 3000);
      },
      error: error => {
        if (error instanceof DraftConflictError) {
          this.saveStatus = 'conflict';
          this.saveError = '报告已被其他用户更新，请刷新后合并。';
        } else {
          this.saveStatus = 'error';
          this.saveError = '保存失败';
        }
        this.cdr.markForCheck();
      },
    });
  }

  // ==================== 护理记录 ====================

  openNurseRecords(row: HandoverPatientRow, shift: ShiftKey): void {
    const range = this.vm?.ranges?.[shift];

    this.recordTarget = { row, shift };
    this.selectedRecordIds = new Set<string>();
    this.nurseRecords = [];
    this.nurseRecordError = '';
    this.nurseRecordDialogVisible = true;

    if (!range) {
      this.nurseRecordError = '未获取到当前班次时间范围';
      this.cdr.markForCheck();
      return;
    }

    const pid = String(row.nurseRecordPid ?? row.patientId ?? '').trim();
    if (!pid) {
      this.nurseRecordError = '当前患者缺少护理记录关联ID，无法查询护理记录';
      this.cdr.markForCheck();
      return;
    }

    const requestSequence = ++this.nurseRecordRequestSequence;
    this.nurseRecordLoading = true;
    this.cdr.markForCheck();

    this.service.loadNurseRecords(pid, range.start, range.end).pipe(
      takeUntil(this.destroy$),
      map(records => records.map((record, index) => this.toNurseRecordOption(record, index))),
      catchError(error => {
        if (requestSequence !== this.nurseRecordRequestSequence) { return EMPTY; }
        this.nurseRecordError = error?.error?.message || error?.message || '护理记录查询失败，请稍后重试';
        this.nurseRecords = [];
        return EMPTY;
      }),
      finalize(() => {
        if (requestSequence === this.nurseRecordRequestSequence) {
          this.nurseRecordLoading = false;
          this.cdr.markForCheck();
        }
      }),
    ).subscribe(records => {
      if (requestSequence !== this.nurseRecordRequestSequence) { return; }
      this.nurseRecords = records;

      const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
      if (isDev) {
        console.info('[HANDOVER][nurse-records]', {
          patientName: row.name,
          patientId: row.patientId,
          nurseRecordPid: pid,
          shift,
          startTime: range.start.toISOString(),
          endTime: range.end.toISOString(),
          count: records.length,
        });
      }

      this.cdr.markForCheck();
    });
  }

  closeNurseRecordDialog(): void {
    this.nurseRecordRequestSequence++;
    this.nurseRecordDialogVisible = false;
    this.nurseRecordLoading = false;
    this.nurseRecordError = '';
    this.nurseRecords = [];
    this.selectedRecordIds = new Set<string>();
    this.recordTarget = undefined;
    this.cdr.markForCheck();
  }

  toggleNurseRecord(recordId: string, checked: boolean): void {
    const next = new Set(this.selectedRecordIds);
    if (checked) {
      next.add(recordId);
    } else {
      next.delete(recordId);
    }
    this.selectedRecordIds = next;
    this.cdr.markForCheck();
  }

  applyNurseRecords(): void {
    if (!this.recordTarget || this.selectedRecordIds.size === 0) { return; }

    const selectedText = this.nurseRecords
      .filter(record => this.selectedRecordIds.has(record.id))
      .map(record => this.formatNurseRecordForInsert(record))
      .filter(Boolean)
      .join('\n');

    if (!selectedText) { return; }

    const { row, shift } = this.recordTarget;
    const oldText = String(row.shiftTexts[shift] ?? '').trimEnd();
    const nextText = oldText ? `${oldText}\n${selectedText}` : selectedText;

    this.updatePatientText(row, shift, nextText);
    this.closeNurseRecordDialog();
  }

  // ==================== 安全指标 ====================

  readonly metricShifts: ShiftKey[] = ['day', 'evening', 'night'];

  private saveRemarkTimers = new Map<string, any>();

  /**
   * 更新手工安全指标，使用字段级补丁保存。
   */
  updateManualMetric(metricKey: string, shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    // 更新本地视图（嵌套结构）
    if (!this.snapshot.draft.manualMetrics[metricKey]) {
      this.snapshot.draft.manualMetrics[metricKey] = {};
    }
    this.snapshot.draft.manualMetrics[metricKey][shift] = value;
    this.hasUnsavedChanges = true;

    // 使用防抖字段级保存
    this.debouncedSaveManualMetric(metricKey, shift, value);
  }

  /**
   * 防抖保存手工指标。
   */
  private saveManualMetricTimers = new Map<string, any>();

  private debouncedSaveManualMetric(metricKey: string, shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    const timerKey = `${metricKey}.${shift}`;
    if (this.saveManualMetricTimers.has(timerKey)) {
      clearTimeout(this.saveManualMetricTimers.get(timerKey));
    }

    const timerId = setTimeout(() => {
      this.saveManualMetricTimers.delete(timerKey);
      this.doSaveManualMetric(metricKey, shift, value);
    }, 500);

    this.saveManualMetricTimers.set(timerKey, timerId);
  }

  private doSaveManualMetric(metricKey: string, shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    this.saveStatus = 'saving';
    this.cdr.markForCheck();

    this.service.setManualMetric({
      departmentId: this.snapshot.draft.departmentId,
      reportDate: this.snapshot.draft.reportDate,
      baseVersion: this.snapshot.draft.version,
      metricKey,
      shift,
      value,
    }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: draft => {
        if (!this.snapshot) { return; }
        this.snapshot.draft = draft;
        this.hasUnsavedChanges = false;
        this.saveStatus = 'saved';
        this.cdr.markForCheck();
        // 3秒后恢复为idle
        setTimeout(() => {
          if (this.saveStatus === 'saved') {
            this.saveStatus = 'idle';
            this.cdr.markForCheck();
          }
        }, 3000);
      },
      error: error => {
        if (error instanceof DraftConflictError) {
          this.saveStatus = 'conflict';
          this.saveError = '报告已被其他用户更新，请刷新后合并。';
        } else {
          this.saveStatus = 'error';
          this.saveError = '保存失败';
        }
        this.cdr.markForCheck();
      },
    });
  }

  updateRemark(shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    if (!this.snapshot.draft.remarks) {
      this.snapshot.draft.remarks = {};
    }
    this.snapshot.draft.remarks[shift] = value;
    this.hasUnsavedChanges = true;
    this.cdr.markForCheck();

    const timerKey = `remark.${shift}`;
    if (this.saveRemarkTimers.has(timerKey)) {
      clearTimeout(this.saveRemarkTimers.get(timerKey));
    }

    const timerId = setTimeout(() => {
      this.saveRemarkTimers.delete(timerKey);
      this.doSaveRemark(shift, value);
    }, 500);

    this.saveRemarkTimers.set(timerKey, timerId);
  }

  private doSaveRemark(shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }

    this.saveStatus = 'saving';
    this.cdr.markForCheck();

    this.service.setRemark({
      departmentId: this.snapshot.draft.departmentId,
      reportDate: this.snapshot.draft.reportDate,
      baseVersion: this.snapshot.draft.version,
      shift,
      value,
    }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: draft => {
        if (!this.snapshot) { return; }
        this.snapshot.draft = draft;
        this.hasUnsavedChanges = false;
        this.saveStatus = 'saved';
        this.cdr.markForCheck();

        setTimeout(() => {
          if (this.saveStatus === 'saved') {
            this.saveStatus = 'idle';
            this.cdr.markForCheck();
          }
        }, 3000);
      },
      error: error => {
        if (error instanceof DraftConflictError) {
          this.saveStatus = 'conflict';
          this.saveError = '备注已被其他用户修改，请刷新后重试。';
        } else {
          this.saveStatus = 'error';
          this.saveError = '备注保存失败';
        }
        this.cdr.markForCheck();
      },
    });
  }

  metricShiftLabel(shift: ShiftKey): string {
    switch (shift) {
      case 'day': return '白班';
      case 'evening': return '中班';
      case 'night': return '夜班';
    }
  }

  shiftLabel(shift: ShiftKey): string {
    switch (shift) {
      case 'day': return '白班';
      case 'evening': return '中班';
      case 'night': return '夜班';
      default: return '';
    }
  }

  trackMetric(_: number, metric: MetricRow): string {
    return metric.key;
  }

  // ==================== 签名 ====================

  /**
   * 保存护士长签名。
   */
  saveHeadNurseSignature(): void {
    if (!this.snapshot) { return; }

    this.hasUnsavedChanges = true;

    this.service.setHeadNurseSignature({
      departmentId: this.snapshot.draft.departmentId,
      reportDate: this.snapshot.draft.reportDate,
      baseVersion: this.snapshot.draft.version,
      accountId: this.snapshot.draft.headNurseSignature || '',
    }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: draft => {
        if (!this.snapshot) { return; }
        this.snapshot.draft = draft;
        this.hasUnsavedChanges = false;
        this.saveStatus = 'saved';
        this.cdr.markForCheck();
        setTimeout(() => {
          if (this.saveStatus === 'saved') {
            this.saveStatus = 'idle';
            this.cdr.markForCheck();
          }
        }, 3000);
      },
      error: error => {
        if (error instanceof DraftConflictError) {
          this.saveStatus = 'conflict';
          this.saveError = '签名已被其他用户修改，请刷新后重试。';
        } else {
          this.saveStatus = 'error';
          this.saveError = '签名保存失败';
        }
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * 设置班次护士签名。
   */
  setShiftSignature(shift: ShiftKey, accountId: string): void {
    if (!this.snapshot) { return; }

    this.snapshot.draft.shiftSignatures[shift] = accountId;
    this.hasUnsavedChanges = true;

    this.service.setShiftSignature({
      departmentId: this.snapshot.draft.departmentId,
      reportDate: this.snapshot.draft.reportDate,
      baseVersion: this.snapshot.draft.version,
      shift,
      accountId,
    }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: draft => {
        if (!this.snapshot) { return; }
        this.snapshot.draft = draft;
        this.hasUnsavedChanges = false;
        this.saveStatus = 'saved';
        this.cdr.markForCheck();
        setTimeout(() => {
          if (this.saveStatus === 'saved') {
            this.saveStatus = 'idle';
            this.cdr.markForCheck();
          }
        }, 3000);
      },
      error: error => {
        if (error instanceof DraftConflictError) {
          this.saveStatus = 'conflict';
          this.saveError = '签名已被其他用户修改，请刷新后重试。';
        } else {
          this.saveStatus = 'error';
          this.saveError = '签名保存失败';
        }
        this.cdr.markForCheck();
      },
    });
  }

  signatureName(shift: ShiftKey): string {
    const accountId = this.snapshot?.draft.shiftSignatures[shift];
    if (!accountId) { return ''; }
    const account = this.snapshot?.nurseAccounts.find(item => item.id === accountId);
    return account?.trueName ?? '';
  }

  // ==================== 打印 ====================

  /**
   * 打印流程：
   * 1. isPreparingPrint = true
   * 2. resizeAllTextareas → waitForFonts → waitForStableRender
   * 3. 在度量容器中测量每行高度
   * 4. paginatePatientTable 分页
   * 5. generatePrintPagesHtml 生成显式打印页面 HTML
   * 6. 注入打印容器 → detectChanges → waitForStableRender
   * 7. 注册 afterprint → window.print() → afterprint 清理
   */
  async print(): Promise<void> {
    if (this.isPreparingPrint) { return; }
    if (!this.snapshot || !this.vm) { return; }

    this.isPreparingPrint = true;
    this.cdr.markForCheck();

    try {
      // 1. 调整 textarea 高度
      this.resizeAllTextareas();

      // 2. 等待字体加载
      await waitForFonts(document);

      // 3. 等待渲染稳定
      await waitForStableRender();

      // 4. 创建度量容器
      const measureContainer = createMeasurementContainer(document);

      // 5. 度量每行高度
      const measurement = measurePatientTableRows(
        this.vm.rows,
        measureContainer,
        document,
      );

      // 6. 分页
      const pages = paginatePatientTable(this.vm.rows, measurement);

      // 7. 生成显式打印页面 HTML（安全报告从数据生成，避免 DOM 重复）
      const pagesHtml = generatePrintPagesHtml(
        pages,
        { statistics: this.vm.statistics, metrics: this.vm.metrics },
        {
          departmentName: this.snapshot.departmentName,
          departmentId: this.snapshot.departmentId,
          draft: this.snapshot.draft,
        },
        this.dateInput,
        (shift: ShiftKey) => this.signatureName(shift),
        this.metricShifts,
        (shift: ShiftKey) => this.metricShiftLabel(shift),
      );

      // 8. 注入打印容器
      const containerEl = this.printContainerRef?.nativeElement;
      if (containerEl) {
        containerEl.innerHTML = pagesHtml;
      }

      // 9. 清理度量容器
      destroyMeasurementContainer(measureContainer);

      // 10. 触发变更检测，让 Angular 渲染打印页面
      this.cdr.detectChanges();

      // 11. 等待渲染稳定
      await waitForStableRender();

      // 12. 注册 afterprint 清理（必须在 window.print() 之前）
      this.registerPrintCleanup(containerEl);

      // 13. 打印
      window.print();
    } catch (err) {
      console.error('[HANDOVER] 打印准备失败', err);
      this.isPreparingPrint = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * 注册 afterprint 清理监听器（幂等）。
   */
  private registerPrintCleanup(containerEl: HTMLElement | undefined): void {
    // 先移除旧的监听器
    this.removePrintCleanup();

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) { return; } // 幂等
      cleaned = true;
      if (containerEl) {
        containerEl.innerHTML = '';
      }
      this.isPreparingPrint = false;
      this.cdr.markForCheck();
      window.removeEventListener('afterprint', cleanup);
      if (this.printCleanupFn === cleanup) {
        this.printCleanupFn = null;
      }
    };

    this.printCleanupFn = cleanup;
    window.addEventListener('afterprint', cleanup);

    // 兜底：如果 afterprint 未触发（某些浏览器），5秒后自动清理
    setTimeout(() => {
      if (this.isPreparingPrint) {
        cleanup();
      }
    }, 5000);
  }

  /**
   * 移除 afterprint 清理监听器。
   */
  private removePrintCleanup(): void {
    if (this.printCleanupFn) {
      window.removeEventListener('afterprint', this.printCleanupFn);
      this.printCleanupFn = null;
    }
  }

  // ==================== 其他工具方法 ====================

  trackRow(_: number, row: HandoverPatientRow): string { return row.key; }
  statusText(status: string): string { return ['死亡', '转入', '入院', '手术'].includes(status) ? `"${status}"` : status; }

  /**
   * 重新加载草稿（解决冲突时使用）。
   */
  reloadDraft(): void {
    this.hasUnsavedChanges = false;
    this.saveStatus = 'idle';
    this.saveError = '';
    this.reload$.next();
  }

  private resolveDepartmentContext(patient: any, account: any): DepartmentContext | null {
    const patientDept = String(patient?.dept ?? '').trim();
    const patientDeptCode = String(patient?.deptCode ?? '').trim();
    const accountDeptCode = String(account?.departmentCode ?? '').trim();
    if (patientDept) return { departmentName: patientDept, departmentCode: patientDeptCode || accountDeptCode, queryValue: patientDept, source: 'patient.dept' };
    if (patientDeptCode) return { departmentName: patientDeptCode, departmentCode: patientDeptCode, queryValue: patientDeptCode, source: 'patient.deptCode' };
    if (accountDeptCode) return { departmentName: accountDeptCode, departmentCode: accountDeptCode, queryValue: accountDeptCode, source: 'account.departmentCode' };
    return null;
  }

  private toNurseRecordOption(record: NurseRecord, index: number): NurseRecordOption {
    const pid = String(record?.pid ?? '').trim();
    const time = String(record?.time ?? '').trim();
    const desc = String(record?.desc ?? '').trim();

    const rawId = String(record?.id ?? record?._id ?? '').trim();
    const sourceId =
      rawId &&
      rawId !== '[object Object]' &&
      rawId !== 'undefined' &&
      rawId !== 'null'
        ? rawId
        : '';

    const id = sourceId || `${pid}:${time}:${index}`;

    const recorder = String(
      record?.username ??
      record?.trueName ??
      record?.editUser ??
      record?.userId ??
      ''
    ).trim();

    return {
      id,
      pid,
      time,
      desc,
      recorder,
      valid: record?.valid !== false,
    };
  }

  private formatNurseRecordForInsert(record: NurseRecordOption): string {
    const timeText = this.formatRecordTime(record.time);
    const recorderText = record.recorder ? ` ${record.recorder}` : '';
    return [timeText, record.desc, recorderText].filter(Boolean).join(' ').trim();
  }

  formatRecordTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) { return value; }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private rebuild(): void {
    if (!this.snapshot) { this.vm = undefined; return; }
    this.vm = buildHandoverReport(this.snapshot, this.selectedDate);
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
    if (isDev) {
      console.info('[HANDOVER][source-counts]', {
        patients: this.snapshot.patients.length,
        bedsideRecords: this.snapshot.bedsideRecords.length,
        bloodSugarRecords: this.snapshot.bloodSugarRecords.length,
        orders: this.snapshot.orders.length,
        tubeExecutions: this.snapshot.tubeExecutions.length,
        nurseRecords: this.snapshot.nurseRecords.length,
        nurseAccounts: this.snapshot.nurseAccounts.length,
      });
    }
    this.cdr.markForCheck();
    queueMicrotask(() => {
      this.resizeAllTextareas();
    });
  }

  private moveDate(days: number): void {
    if (this.hasUnsavedChanges) {
      if (!confirm('当前有未保存的修改，切换日期将丢失这些修改。是否继续？')) {
        return;
      }
    }
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + days);
    this.selectedDate = d;
    this.dateInput = this.toDateInput(d);
    this.dateInput$.next(this.dateInput);
    this.reload$.next();
  }

  private toDateInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
