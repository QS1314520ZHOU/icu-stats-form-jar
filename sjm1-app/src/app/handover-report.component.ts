import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
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
export class HandoverReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new ReplaySubject<void>(1);
  private readonly dateInput$ = new ReplaySubject<string>(1);

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
    // 检查未保存内容
    if (this.hasUnsavedChanges) {
      console.warn('[HANDOVER] 页面关闭时存在未保存内容');
    }
    this.destroy$.next();
    this.destroy$.complete();
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
   */
  patientKey(patient: DepartmentPatient): string {
    const id = String(patient.id ?? patient._id ?? '').trim();
    return id;
  }

  /**
   * 检查患者是否有有效的唯一ID。
   */
  hasPatientKey(patient: DepartmentPatient): boolean {
    return this.patientKey(patient).length > 0;
  }

  /**
   * 检查患者是否在临时选择中。
   */
  isPendingCriticalSelected(patient: DepartmentPatient): boolean {
    const id = this.patientKey(patient);
    return !!id && this.pendingCriticalPatientIds.has(id);
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

    // 更新本地视图
    if (!this.snapshot.draft.patientTexts[row.key]) {
      this.snapshot.draft.patientTexts[row.key] = {};
    }
    this.snapshot.draft.patientTexts[row.key][shift] = value;
    this.hasUnsavedChanges = true;

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
    this.selectedRecordIds.clear();
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
    this.selectedRecordIds.clear();
    this.recordTarget = undefined;
    this.cdr.markForCheck();
  }

  toggleNurseRecord(recordId: string, checked: boolean): void {
    if (checked) this.selectedRecordIds.add(recordId);
    else this.selectedRecordIds.delete(recordId);
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

  metricShiftLabel(shift: ShiftKey): string {
    switch (shift) {
      case 'day': return '白班';
      case 'evening': return '中班';
      case 'night': return '夜班';
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

  print(): void { window.print(); }

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
    const sourceId = String(record?.id ?? record?._id ?? '').trim();
    const id = sourceId || `${pid}:${time}:${index}`;
    const recorder = String(record?.username ?? record?.trueName ?? record?.editUser ?? record?.userId ?? '').trim();
    return { id, pid, time, desc, recorder, valid: record?.valid !== false };
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
