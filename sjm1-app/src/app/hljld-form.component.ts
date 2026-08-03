import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, merge } from 'rxjs';
import { distinctUntilChanged, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { HljldFormService, LoadResult } from './hljld-form.service';
import { HljldSourceData, HljldSummary, HljldTimeRow, HljldViewModel, PatientContext } from './hljld-form.models';
import { buildRows, buildSummary, DEFAULT_REMARK_LINES, endOfNursingDay, formatDate, startOfNursingDay } from './hljld-form.utils';

@Component({
  standalone: false,
  selector: 'app-hljld-form',
  templateUrl: './hljld-form.component.html',
  styleUrls: ['./hljld-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HljldFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly dateChange$ = new Subject<void>();
  patient: PatientContext = { pid: '' };
  selectedDate = new Date();
  dateInput = this.toDateString(this.selectedDate);
  loading = false;
  error = '';
  sourceError = '';
  vm?: HljldViewModel;
  readonly defaultRemarkLines = DEFAULT_REMARK_LINES;

  constructor(
    private service: HljldFormService,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p) return;
      const pid = String(p?._id ?? '').trim();
      if (!pid) {
        this.patient = { pid: '' };
        this.vm = undefined;
        this.error = '未获取到患者MongoDB _id，无法查询护理记录';
        this.cdr.markForCheck();
        return;
      }
      if (pid === this.patient.pid) return;
      this.patient = this.toPatientContext(p);
      this.vm = undefined;
      this.error = '';
      this.sourceError = '';
      const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
      if (isDev) {
        console.info('[HLJLD][patient-context]', {
          mongoPatientId: pid,
          hasMongoPatientId: !!pid,
          mrn: this.patient.mrn,
          bedNo: this.patient.bedNo,
        });
      }
      this.dateChange$.next();
    });

    merge(this.dateChange$).pipe(
      takeUntil(this.destroy$),
      map(() => ({ pid: this.patient.pid, date: new Date(this.selectedDate) })),
      distinctUntilChanged((a, b) => a.pid === b.pid && this.isSameLocalDate(a.date, b.date)),
      switchMap(condition => this.loadCondition(condition.pid, condition.date).pipe(
        map(result => ({ result, pid: condition.pid })),
      )),
    ).subscribe({
      next: ({ result, pid }) => {
        if (pid !== this.patient.pid) return;
        this.loading = false;
        this.sourceError = this.buildSourceError(result.statuses);
        this.source = result.data;
        this.vm = this.toViewModel(result.data);
        const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
        if (isDev) {
          console.info('[HLJLD][source-counts]', {
            mongoPatientId: this.patient.pid,
            bedside: result.data.bedside.length,
            drugExecutions: result.data.drugExecutions.length,
            drugMethods: result.data.drugMethods.length,
            nurseRecords: result.data.nurseRecords.length,
            signatures: result.data.signatures.length,
          });
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.loading = false;
        this.error = err?.message || '护理数据加载异常，请检查数据接口';
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  previousDay(): void { this.moveDate(-1); }
  nextDay(): void { this.moveDate(1); }
  today(): void {
    this.selectedDate = new Date();
    this.dateInput = this.toDateString(this.selectedDate);
    this.dateChange$.next();
  }

  onDateInput(value: string): void {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      this.selectedDate = date;
      this.dateInput = this.toDateString(date);
      this.dateChange$.next();
    }
  }

  isTodaySelected(): boolean {
    const s = this.selectedDate;
    const t = new Date();
    return s.getFullYear() === t.getFullYear() && s.getMonth() === t.getMonth() && s.getDate() === t.getDate();
  }

  print(): void { window.print(); }
  trackRow(_: number, row: HljldTimeRow): string { return row.key; }
  trackText(index: number): number { return index; }

  summaryValues(summary: HljldSummary): Array<{ label: string; value: number }> {
    return [
      { label: '总入量', value: summary.totalInput },
      { label: '输液量', value: summary.infusion },
      { label: '饮食量', value: summary.diet },
      { label: '总出量', value: summary.totalOutput },
      { label: '平衡量', value: summary.balance },
      { label: '尿量', value: summary.urine },
      { label: '其它出量', value: summary.otherOutput },
    ];
  }

  private source: HljldSourceData = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], signatures: [] };

  private moveDate(days: number): void {
    const value = new Date(this.selectedDate);
    value.setDate(value.getDate() + days);
    this.selectedDate = value;
    this.dateInput = this.toDateString(value);
    this.dateChange$.next();
  }

  private toDateString(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private isSameLocalDate(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  private loadCondition(pid: string, date: Date) {
    this.loading = true;
    this.error = '';
    this.sourceError = '';
    this.cdr.markForCheck();
    const rangeStart = startOfNursingDay(date);
    const rangeEnd = endOfNursingDay(date);
    return this.service.load(pid, rangeStart, rangeEnd)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
      );
  }

  private toViewModel(source: HljldSourceData): HljldViewModel {
    const rangeStart = startOfNursingDay(this.selectedDate);
    const rangeEnd = endOfNursingDay(this.selectedDate);
    const dayEnd = new Date(rangeStart); dayEnd.setHours(17, 0, 0, 0);
    const nextMorning = new Date(rangeStart); nextMorning.setDate(nextMorning.getDate() + 1); nextMorning.setHours(7, 0, 0, 0);
    return {
      patient: this.patient,
      selectedDate: this.selectedDate,
      rangeStart,
      rangeEnd,
      rows: buildRows(source, rangeStart, rangeEnd),
      daySummary: buildSummary('day', this.patient, source, rangeStart, dayEnd),
      fullDaySummary: buildSummary('24h', this.patient, source, rangeStart, nextMorning),
      remark: '',
    };
  }

  private toPatientContext(p: any): PatientContext {
    return {
      pid: String(p?._id ?? '').trim(),
      mrn: String(p?.mrn ?? p?.hospitalNo ?? ''),
      name: String(p?.name ?? p?.patientName ?? ''),
      sex: String(p?.sex ?? p?.gender ?? ''),
      age: String(p?.age ?? ''),
      bedNo: String(p?.hisBed ?? p?.bedNo ?? p?.bedCode ?? ''),
      diagnosis: String(p?.clinicalDiagnosis ?? p?.diagnosis ?? ''),
      admissionTime: p?.admissionTime || p?.inTime || '',
      dischargeTime: p?.dischargeTime || p?.outTime || '',
    };
  }

  private buildSourceError(statuses: import('./hljld-form.service').SourceStatus[]): string {
    const errors = statuses.filter(s => s.status === 'error');
    if (!errors.length) return '';
    const names = errors.map(e => `${e.source}(${e.httpStatus || '?'})`).join('、');
    return `部分数据接口异常：${names}`;
  }
}
