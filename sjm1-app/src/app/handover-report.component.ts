import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ReplaySubject, Subject, combineLatest, debounceTime, EMPTY } from 'rxjs';
import { catchError, distinctUntilChanged, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { DepartmentContext, DepartmentDailySnapshot, DraftConflictError, HandoverPatientRow, HandoverReportViewModel, NurseRecord, ShiftKey } from './handover-report.models';
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
  nurseRecords: NurseRecord[] = [];
  selectedRecordIds = new Set<string>();

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
    this.recordTarget = { row, shift };
    this.selectedRecordIds.clear();
    this.nurseRecords = (this.snapshot?.nurseRecords || [])
      .filter(r => r.valid !== false && r.pid === row.patientId)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    this.nurseRecordDialogVisible = true;
    this.cdr.markForCheck();
  }

  toggleNurseRecord(recordId: string, checked: boolean): void {
    if (checked) this.selectedRecordIds.add(recordId);
    else this.selectedRecordIds.delete(recordId);
  }

  applyNurseRecords(): void {
    if (!this.recordTarget) return;
    const text = this.nurseRecords.filter(r => this.selectedRecordIds.has(r.id)).map(r => r.desc).join('\n');
    const old = this.recordTarget.row.shiftTexts[this.recordTarget.shift] || '';
    this.updatePatientText(this.recordTarget.row, this.recordTarget.shift, [old, text].filter(Boolean).join('\n'));
    this.nurseRecordDialogVisible = false;
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
}
