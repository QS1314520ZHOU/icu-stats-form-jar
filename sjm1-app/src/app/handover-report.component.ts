import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ReplaySubject, Subject, combineLatest, EMPTY } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { DepartmentContext, DepartmentDailySnapshot, DraftConflictError, HandoverPatientRow, HandoverReportViewModel, MetricRow, NurseRecord, NurseRecordOption, ShiftKey } from './handover-report.models';
import { HandoverReportService } from './handover-report.service';
import { HostPatientService } from './services/host-patient.service';
import { buildHandoverReport } from './handover-report.utils';

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
  private readonly save$ = new Subject<void>();
  private readonly dateInput$ = new ReplaySubject<string>(1);

  selectedDate = new Date();
  dateInput = this.toDateInput(this.selectedDate);
  departmentContext: DepartmentContext | null = null;

  loading = false;
  saving = false;
  error = '';
  snapshot?: DepartmentDailySnapshot;
  vm?: HandoverReportViewModel;

  criticalDialogVisible = false;
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
      map(({ patient, account }) => this.resolveDepartmentContext(patient, account) as DepartmentContext | null),
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
      next: snapshot => { this.snapshot = snapshot; this.rebuild(); },
      error: error => { this.error = error?.message || '交班报告加载失败'; this.cdr.markForCheck(); },
    });

    // 自动保存
    this.save$.pipe(
      debounceTime(500),
      takeUntil(this.destroy$),
      switchMap(() => {
        if (!this.snapshot) return EMPTY;
        this.saving = true;
        this.cdr.markForCheck();
        return this.service.saveDraft(this.snapshot.draft).pipe(
          catchError(error => { this.saving = false; this.error = error instanceof DraftConflictError ? '报告已被其他用户更新，请刷新后合并。' : '保存失败'; this.cdr.markForCheck(); return EMPTY; }),
          finalize(() => { this.saving = false; this.cdr.markForCheck(); }),
        );
      }),
    ).subscribe(draft => { if (this.snapshot) { this.snapshot.draft = draft; this.rebuild(); } });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  previousDay(): void { this.moveDate(-1); }
  nextDay(): void { this.moveDate(1); }
  today(): void { this.selectedDate = new Date(); this.dateInput = this.toDateInput(this.selectedDate); this.dateInput$.next(this.dateInput); this.reload$.next(); }
  onDateChange(value: string): void { const d = new Date(`${value}T00:00:00`); if (isNaN(d.getTime())) return; this.selectedDate = d; this.dateInput = value; this.dateInput$.next(value); this.reload$.next(); }
  openCriticalDialog(): void { this.criticalDialogVisible = true; }
  closeCriticalDialog(): void { this.criticalDialogVisible = false; }

  isCriticalSelected(patientId: string): boolean {
    return this.snapshot?.draft.criticalPatients.some(item => item.patientId === patientId) || false;
  }

  toggleCritical(patientId: string, checked: boolean): void {
    if (!this.snapshot) return;
    if (checked) { if (!this.isCriticalSelected(patientId)) { this.snapshot.draft.criticalPatients.push({ patientId, selectedAt: new Date().toISOString(), selectedBy: 'current-user' }); } }
    else { this.snapshot.draft.criticalPatients = this.snapshot.draft.criticalPatients.filter(item => item.patientId !== patientId); }
    this.saveSoon();
  }

  canEditShift(row: HandoverPatientRow, shift: ShiftKey): boolean { return row.editableShifts.includes(shift); }
  updatePatientText(row: HandoverPatientRow, shift: ShiftKey, value: string): void {
    if (!this.snapshot) return;
    this.snapshot.draft.patientTextOverrides[`${row.key}.${shift}`] = value;
    this.saveSoon();
  }

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

  shiftLabel(shift: ShiftKey): string {
    switch (shift) {
      case 'day': return '白班';
      case 'evening': return '中班';
      case 'night': return '夜班';
    }
  }

  setShiftSignature(shift: ShiftKey, accountId: string): void {
    if (!this.snapshot) return;
    this.snapshot.draft.shiftSignatures[shift] = accountId;
    this.saveSoon();
  }

  print(): void { window.print(); }
  trackRow(_: number, row: HandoverPatientRow): string { return row.key; }
  statusText(status: string): string { return ['死亡', '转入', '入院', '手术'].includes(status) ? `“${status}”` : status; }

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

  private formatRecordTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) { return value; }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private rebuild(): void {
    if (!this.snapshot) { this.vm = undefined; return; }
    this.vm = buildHandoverReport(this.snapshot, this.selectedDate);
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
    if (isDev) { console.info('[HANDOVER][source-counts]', { patients: this.snapshot.patients.length, bedsideRecords: this.snapshot.bedsideRecords.length, bloodSugarRecords: this.snapshot.bloodSugarRecords.length, orders: this.snapshot.orders.length, tubeExecutions: this.snapshot.tubeExecutions.length, nurseRecords: this.snapshot.nurseRecords.length, nurseAccounts: this.snapshot.nurseAccounts.length }); }
    this.cdr.markForCheck();
  }

  private saveSoon(): void { this.rebuild(); this.save$.next(); }
  private moveDate(days: number): void { const d = new Date(this.selectedDate); d.setDate(d.getDate() + days); this.selectedDate = d; this.dateInput = this.toDateInput(d); this.dateInput$.next(this.dateInput); this.reload$.next(); }
  private toDateInput(date: Date): string { const pad = (n: number) => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

  readonly metricShifts: ShiftKey[] = ['day', 'evening', 'night'];

  updateManualMetric(metricKey: string, shift: ShiftKey, value: string): void {
    if (!this.snapshot) { return; }
    this.snapshot.draft.manualMetrics[`${metricKey}.${shift}`] = value;
    this.saveSoon();
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

  signatureName(shift: ShiftKey): string {
    const accountId = this.snapshot?.draft.shiftSignatures[shift];
    if (!accountId) { return ''; }
    const account = this.snapshot?.nurseAccounts.find(item => item.id === accountId);
    return account?.trueName ?? '';
  }
}
