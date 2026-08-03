import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { HljldFormService } from './hljld-form.service';
import { HljldSourceData, HljldSummary, HljldTimeRow, HljldViewModel, PatientContext } from './hljld-form.models';
import { buildRows, buildSummary, endOfNursingDay, formatDate, startOfNursingDay } from './hljld-form.utils';

@Component({
  standalone: false,
  selector: 'app-hljld-form',
  templateUrl: './hljld-form.component.html',
  styleUrls: ['./hljld-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HljldFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private source: HljldSourceData = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], signatures: [] };
  patient: PatientContext = { pid: '' };
  selectedDate = new Date();
  dateInput = formatDate(this.selectedDate);
  loading = false;
  error = '';
  vm?: HljldViewModel;

  constructor(
    private service: HljldFormService,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p) return;
      const pid = String(p?.id ?? p?._id ?? p?.pid ?? p?.patientId ?? '').trim();
      if (!pid || pid === this.patient.pid) return;
      this.patient = {
        pid,
        mrn: String(p?.mrn ?? p?.hospitalNo ?? ''),
        name: String(p?.name ?? p?.patientName ?? ''),
        sex: String(p?.sex ?? p?.gender ?? ''),
        age: String(p?.age ?? ''),
        bedNo: String(p?.hisBed ?? p?.bedNo ?? p?.bedCode ?? ''),
        diagnosis: String(p?.clinicalDiagnosis ?? p?.diagnosis ?? ''),
        admissionTime: p?.admissionTime || p?.inTime || '',
        dischargeTime: p?.dischargeTime || p?.outTime || '',
      };
      this.query();
      this.cdr.markForCheck();
    });
    if (this.patient.pid) { this.query(); }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  previousDay(): void { this.moveDate(-1); }
  nextDay(): void { this.moveDate(1); }
  today(): void { this.selectedDate = new Date(); this.syncDateAndQuery(); }

  onDateInput(value: string): void {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      this.selectedDate = date;
      this.syncDateAndQuery();
    }
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

  private moveDate(days: number): void {
    const value = new Date(this.selectedDate);
    value.setDate(value.getDate() + days);
    this.selectedDate = value;
    this.syncDateAndQuery();
  }

  private syncDateAndQuery(): void {
    this.dateInput = formatDate(this.selectedDate);
    this.query();
  }

  private query(): void {
    if (!this.patient.pid) { this.error = '未获取到患者 PID'; return; }
    const rangeStart = startOfNursingDay(this.selectedDate);
    const rangeEnd = endOfNursingDay(this.selectedDate);
    this.loading = true;
    this.error = '';
    this.service.load(this.patient.pid, rangeStart, rangeEnd)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: source => { this.source = source; this.vm = this.toViewModel(source, rangeStart, rangeEnd); },
        error: error => { this.error = error && error.message ? error.message : '护理记录加载失败'; },
      });
  }

  private toViewModel(source: HljldSourceData, rangeStart: Date, rangeEnd: Date): HljldViewModel {
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
}
