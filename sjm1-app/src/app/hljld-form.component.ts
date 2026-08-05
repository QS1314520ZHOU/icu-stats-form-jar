import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, ReplaySubject, firstValueFrom } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { HljldFormService, LoadResult } from './hljld-form.service';
import { BedsideRecord, DrugExecution, HljldDisplayRow, HljldSourceData, HljldSummary, HljldViewModel, NurseRecord, PatientContext } from './hljld-form.models';
import { buildDisplayRows, buildRenderItems, buildRows, buildSummary, DEFAULT_REMARK_LINES, endOfNursingDay, startOfNursingDay } from './hljld-form.utils';
import { getSmartCarePatientPid } from './models/smartcare-host-message.model';

@Component({
  standalone: false,
  selector: 'app-hljld-form',
  templateUrl: './hljld-form.component.html',
  styleUrls: ['./hljld-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HljldFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  /*
   * ReplaySubject(1) 缓存最近一次加载触发。
   * 即使患者 BehaviorSubject 同步发送，也不会丢失第一次加载事件。
   */
  private readonly dateChange$ = new ReplaySubject<void>(1);

  patient: PatientContext = { pid: '' };
  selectedDate = new Date();
  dateInput = this.toDateString(this.selectedDate);
  loading = false;
  error = '';
  sourceError = '';
  vm?: HljldViewModel;
  readonly defaultRemarkLines = DEFAULT_REMARK_LINES;
  private source: HljldSourceData = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], signatures: [] };

  constructor(
    private service: HljldFormService,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    /*
     * 必须先订阅加载触发流，再订阅 patient$。
     * 否则 BehaviorSubject 同步发送缓存患者时，
     * 第一次 dateChange$.next() 会发生在订阅建立之前。
     */
    this.dateChange$.pipe(
      takeUntil(this.destroy$),
      map(() => ({ pid: this.patient.pid, date: new Date(this.selectedDate) })),
      filter(condition => !!condition.pid),
      distinctUntilChanged((a, b) => a.pid === b.pid && this.isSameLocalDate(a.date, b.date)),
      switchMap(condition => this.loadCondition(condition.pid, condition.date).pipe(
        map(result => ({ result, pid: condition.pid })),
      )),
    ).subscribe({
      next: async ({ result, pid }) => {
        if (pid !== this.patient.pid) return;
        this.sourceError = this.buildSourceError(result.statuses);
        this.source = result.data;

        // 收集签名用户ID并批量查询账户
        const accountMap = await this.collectSignatures(result.data);

        if (pid !== this.patient.pid) return;
        this.source = result.data;
        this.vm = this.toViewModel(result.data, accountMap);
        this.loading = false;

        const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
        if (isDev) {
          console.info('[HLJLD][source-counts]', {
            pid: this.patient.pid,
            bedside: result.data.bedside.length,
            drugExecutions: result.data.drugExecutions.length,
            drugMethods: result.data.drugMethods.length,
            nurseRecords: result.data.nurseRecords.length,
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

    /*
     * 加载流建立后，再订阅患者。
     */
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p) {
        this.resetPatientData();
        this.cdr.markForCheck();
        return;
      }
      const nextPid = getSmartCarePatientPid(p);
      if (!nextPid) {
        this.resetPatientData();
        this.error = '未获取到患者数据库主键，无法查询护理记录';
        this.cdr.markForCheck();
        return;
      }
      const previousPid = this.patient.pid;
      this.patient = this.toPatientContext(p);
      if (nextPid !== previousPid) {
        this.clearClinicalData();
        this.dateChange$.next();
      }
      const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
      if (isDev) {
        console.info('[HLJLD][patient-sync]', {
          transportId: p.id,
          mongoIdAlias: (p as any)._id,
          resolvedPid: nextPid,
          mrn: this.patient.mrn,
          bedNo: this.patient.bedNo,
        });
      }
      this.cdr.markForCheck();
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

  openDatePicker(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (!input || input.disabled) { return; }
    if (event instanceof KeyboardEvent) { event.preventDefault(); }
    try {
      if (typeof input.showPicker === 'function') { input.showPicker(); } else { input.focus(); }
    } catch { input.focus(); }
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
  trackRow(_: number, row: HljldDisplayRow): string { return row.key; }
  trackRenderItem(_: number, item: import('./hljld-form.models').HljldRenderItem): string { return item.key; }
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

  private toViewModel(source: HljldSourceData, accountMap: Map<string, string>): HljldViewModel {
    const rangeStart = startOfNursingDay(this.selectedDate);
    const rangeEnd = endOfNursingDay(this.selectedDate);
    const dayEnd = new Date(rangeStart); dayEnd.setHours(17, 0, 0, 0);
    const nextMorning = new Date(rangeStart); nextMorning.setDate(nextMorning.getDate() + 1); nextMorning.setHours(7, 0, 0, 0);
    const rows = buildRows(source, rangeStart, rangeEnd, accountMap);
    const displayRows = buildDisplayRows(rows);
    const daySummary = buildSummary('day', this.patient, source, rangeStart, dayEnd);
    const fullDaySummary = buildSummary('24h', this.patient, source, rangeStart, nextMorning);
    const renderItems = buildRenderItems(displayRows, daySummary, fullDaySummary, rangeStart);
    return {
      patient: this.patient,
      selectedDate: this.selectedDate,
      rangeStart,
      rangeEnd,
      rows,
      displayRows,
      renderItems,
      daySummary,
      fullDaySummary,
      remark: '',
    };
  }

  /**
   * 只收集 param_Yishi 的 editUser，批量查询账户信息。
   */
  private async collectSignatures(source: HljldSourceData): Promise<Map<string, string>> {
    const userIds = source.bedside
      .filter(item => item.valid !== false && item.code === 'param_Yishi' && !!item.time && !!item.editUser)
      .map(item => String(item.editUser).trim())
      .filter(Boolean);

    if (!userIds.length) { return new Map(); }
    return firstValueFrom(this.service.queryAccounts(userIds));
  }

  private toPatientContext(p: any): PatientContext {
    return {
      pid: getSmartCarePatientPid(p),
      mrn: String(p?.mrn ?? p?.hospitalNo ?? '').trim(),
      name: String(p?.name ?? p?.patientName ?? '').trim(),
      sex: this.genderText(p?.sex ?? p?.gender ?? ''),
      age: String(p?.age ?? '').trim(),
      bedNo: String(p?.hisBed ?? p?.bedNo ?? p?.bedCode ?? '').trim(),
      diagnosis: this.formatDiagnosis(p?.clinicalDiagnosis ?? p?.diagnosis ?? ''),
      admissionTime: p?.admissionTime || p?.inTime || '',
      dischargeTime: p?.dischargeTime || p?.outTime || '',
    };
  }

  private genderText(gender?: string): string {
    const value = String(gender ?? '').trim();
    if (value === 'Male' || value === 'M' || value === '男') { return '男'; }
    if (value === 'Female' || value === 'F' || value === '女') { return '女'; }
    return value;
  }

  private formatDiagnosis(diagnosis?: string): string {
    const value = String(diagnosis ?? '').trim();
    if (!value) { return ''; }
    let idx = -1;
    for (const sep of [';', '；', ',', '，']) {
      const cur = value.indexOf(sep);
      if (cur >= 0 && (idx < 0 || cur < idx)) { idx = cur; }
    }
    return idx >= 0 ? value.substring(0, idx).trim() : value;
  }

  private resetPatientData(): void {
    this.patient = { pid: '' };
    this.vm = undefined;
    this.source = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], signatures: [] };
  }

  private clearClinicalData(): void {
    this.vm = undefined;
    this.error = '';
    this.sourceError = '';
    this.source = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], signatures: [] };
  }

  private buildSourceError(statuses: import('./hljld-form.service').SourceStatus[]): string {
    const errors = statuses.filter(s => s.status === 'error');
    if (!errors.length) return '';
    const names = errors.map(e => `${e.source}(${e.httpStatus || '?'})`).join('、');
    return `部分数据接口异常：${names}`;
  }
}
