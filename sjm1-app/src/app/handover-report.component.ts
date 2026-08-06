import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, ReplaySubject, firstValueFrom } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { HandoverReportService } from './handover-report.service';
import {
  CriticalPatient,
  HandoverDetail,
  HandoverReport,
  HandoverReportContent,
  LoadResult,
  ShiftDefinition,
  ShiftKind,
  SourceStatus,
  StatusItem,
} from './handover-report.models';
import {
  calculateStatusItems,
  getCurrentShift,
  getShiftRange,
  getSettlementTime,
  SHIFT_DEFINITIONS,
  sortDetails,
  buildCriticalPatientInfo,
} from './handover-report.utils';
import { getSmartCarePatientPid } from './models/smartcare-host-message.model';

@Component({
  standalone: false,
  selector: 'app-handover-report',
  templateUrl: './handover-report.component.html',
  styleUrls: ['./handover-report.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandoverReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly loadTrigger$ = new ReplaySubject<void>(1);

  patient: any = null;
  pid = '';
  department = '';
  selectedDate = new Date();
  selectedShift: ShiftKind = getCurrentShift().kind;
  loading = false;
  error = '';
  sourceError = '';
  vm?: { shift: ShiftDefinition; details: HandoverDetail[]; statusItems: StatusItem[]; criticalPatients: CriticalPatient[]; nurseSignature: string; remark: string };

  private bedside: any[] = [];
  private tubeExecutions: any[] = [];
  private savedReport: HandoverReport | null = null;
  private accountMap = new Map<string, string>();

  constructor(
    private service: HandoverReportService,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadTrigger$.pipe(
      takeUntil(this.destroy$),
      map(() => ({ pid: this.pid, date: new Date(this.selectedDate), shift: this.selectedShift })),
      distinctUntilChanged((a, b) => a.pid === b.pid && a.date.getTime() === b.date.getTime() && a.shift === b.shift),
      switchMap(cond => this.loadData(cond.pid, cond.date, cond.shift)),
    ).subscribe({
      next: result => {
        this.bedside = result.bedside;
        this.tubeExecutions = result.tubeExecutions;
        this.sourceError = this.buildSourceError(result.statuses);
        this.buildViewModel();
        this.cdr.markForCheck();
      },
      error: err => {
        this.loading = false;
        this.error = err?.message || '数据加载异常';
        this.cdr.markForCheck();
      },
    });

    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p) { this.patient = null; this.pid = ''; this.department = ''; this.cdr.markForCheck(); return; }
      const nextPid = getSmartCarePatientPid(p);
      if (!nextPid || nextPid === this.pid) return;
      this.patient = p;
      this.pid = nextPid;
      this.department = String(p?.department ?? p?.deptName ?? p?.departmentName ?? '').trim();
      this.loadTrigger$.next();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onShiftChange(kind: ShiftKind): void {
    this.selectedShift = kind;
    this.loadTrigger$.next();
  }

  onDateChange(dateStr: string): void {
    const d = new Date(`${dateStr}T00:00:00`);
    if (!isNaN(d.getTime())) {
      this.selectedDate = d;
      this.loadTrigger$.next();
    }
  }

  print(): void { window.print(); }

  save(): void { /* TODO: auto-save debounce */ }

  trackDetail(_: number, item: HandoverDetail): string { return `${item.eventType}-${item.time}-${item.bedNo}`; }
  trackShift(_: number, shift: ShiftDefinition): string { return shift.kind; }
  trackStatusItem(_: number, item: StatusItem): string { return item.label; }

  private loadData(pid: string, date: Date, shift: ShiftKind): Promise<LoadResult> {
    this.loading = true;
    this.error = '';
    const { start, end } = getShiftRange(shift, date);
    return firstValueFrom(this.service.loadSourceData(pid, start, end).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ));
  }

  private buildViewModel(): void {
    const shift = SHIFT_DEFINITIONS.find(s => s.kind === this.selectedShift)!;
    const statusItems = calculateStatusItems(this.bedside, this.tubeExecutions, shift, this.selectedDate);
    const criticalPatients = this.pid ? [buildCriticalPatientInfo(this.bedside, this.tubeExecutions, this.patient, shift, this.selectedDate)] : [];
    const details: HandoverDetail[] = []; // TODO: build from bedside events

    this.vm = { shift, details: sortDetails(details), statusItems, criticalPatients, nurseSignature: '', remark: '' };
  }

  private buildSourceError(statuses: SourceStatus[]): string {
    const errors = statuses.filter(s => s.status === 'error');
    if (!errors.length) return '';
    return `部分数据接口异常：${errors.map(e => `${e.source}(${e.httpStatus || '?'})`).join('、')}`;
  }
}
