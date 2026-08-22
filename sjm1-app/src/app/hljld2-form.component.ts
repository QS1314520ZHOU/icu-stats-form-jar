import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject, ReplaySubject, EMPTY, firstValueFrom, interval } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { Hljld2FormService } from './hljld2-form.service';
import { HljldDisplayRow, HljldPageState, HljldSourceData, HljldSummary, HljldTimelineItem, HljldViewModel, PatientContext } from './hljld2-form.models';
import { buildDisplayGroups, buildTimeline, buildRows, buildSummary, collectDrainNames, DEFAULT_REMARK_LINES, endOfNursingDay, minuteInstant, parsePatientDateTime, resolveActiveStayRange, startOfNursingDay } from './hljld2-form.utils';
import { getSmartCarePatientPid } from './models/smartcare-host-message.model';
import { printHljld2Record, printAllViaIframe2 } from "./hljld2-print.util";

@Component({
  standalone: false,
  selector: 'app-hljld-form2',
  templateUrl: './hljld2-form.component.html',
  styleUrls: ['./hljld2-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hljld2FormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly dateChange$ = new ReplaySubject<void>(1);

  patient: PatientContext = { pid: '' };
  selectedDate = new Date();
  dateInput = this.toDateString(this.selectedDate);
  loading = false;
  error = '';
  sourceError = '';
  pageState: HljldPageState = 'waiting-patient';
  vm?: HljldViewModel;
  readonly defaultRemarkLines = DEFAULT_REMARK_LINES;
  printing = false;
  printingAll = false;
  private source: HljldSourceData = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], tubeExecutions: [], tubeViews: [], signatures: [] };
  private accountMap = new Map<string, string>();
  private readonly clockRefresh$ = interval(60_000);

  /** 请求版本令牌，每次日期请求递增，防止异步竞态 */
  private loadVersion = 0;

  constructor(
    private service: Hljld2FormService,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.dateChange$.pipe(
      takeUntil(this.destroy$),
      map(() => ({ pid: this.patient.pid, date: new Date(this.selectedDate) })),
      filter(condition => !!condition.pid),
      distinctUntilChanged((a, b) => a.pid === b.pid && this.isSameLocalDate(a.date, b.date)),
      switchMap(condition => {
        // 每次请求前递增版本号，防止同患者快速切换日期时旧结果覆盖
        const requestVersion = ++this.loadVersion;
        const dateKey = this.toDateString(condition.date);

        const stayRange = resolveActiveStayRange(this.patient, startOfNursingDay(condition.date), endOfNursingDay(condition.date));
        if (stayRange.beforeAdmission) {
          this.pageState = 'before-admission';
          this.loading = false;
          this.vm = undefined;
          this.source = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], tubeExecutions: [], tubeViews: [], signatures: [] };
          this.sourceError = '';
          this.error = '';
          this.cdr.markForCheck();
          return EMPTY;
        }
        if (stayRange.afterDischarge) {
          this.pageState = 'after-discharge';
          this.loading = false;
          this.vm = undefined;
          this.source = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], tubeExecutions: [], tubeViews: [], signatures: [] };
          this.sourceError = '';
          this.error = '';
          this.cdr.markForCheck();
          return EMPTY;
        }
        this.pageState = 'loading';
        this.cdr.markForCheck();
        return this.loadCondition(condition.pid, condition.date).pipe(
          map(result => ({ result, pid: condition.pid, requestVersion, dateKey })),
        );
      }),
    ).subscribe({
      next: async ({ result, pid, requestVersion, dateKey }) => {
        if (!result) { return; }
        if (requestVersion !== this.loadVersion || pid !== this.patient.pid) { return; }
        this.sourceError = this.buildSourceError(result.statuses);
        this.source = result.data;

        const accountMap = await this.collectSignatures(result.data);

        // 落地前再次校验版本、患者和日期
        if (requestVersion !== this.loadVersion || pid !== this.patient.pid || dateKey !== this.toDateString(this.selectedDate)) { return; }
        this.source = result.data;
        this.accountMap = accountMap;
        this.vm = this.toViewModel(result.data, accountMap);
        this.loading = false;
        this.pageState = 'ready';

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
        this.pageState = 'error';
        this.error = err?.message || '护理数据加载异常，请检查数据接口';
        this.cdr.markForCheck();
      },
    });

    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p) {
        this.resetPatientData();
        this.pageState = 'waiting-patient';
        this.cdr.markForCheck();
        return;
      }
      const nextPid = getSmartCarePatientPid(p);
      if (!nextPid) {
        this.resetPatientData();
        this.error = '未获取到患者数据库主键，无法查询护理记录';
        this.pageState = 'error';
        this.cdr.markForCheck();
        return;
      }
      const previousPid = this.patient.pid;
      this.patient = this.toPatientContext(p);
      if (nextPid !== previousPid) {
        this.clearClinicalData();
        this.initializeDateForPatient();
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

    this.clockRefresh$.pipe(
      takeUntil(this.destroy$),
      filter(() => !!this.patient.pid && !!this.source.bedside.length),
    ).subscribe(() => {
      if (this.vm) {
        this.vm = this.toViewModel(this.source, this.accountMap);
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  previousDay(): void {
    if (!this.canPreviousDay()) { return; }
    this.moveDate(-1);
  }

  nextDay(): void {
    if (!this.canNextDay()) { return; }
    this.moveDate(1);
  }

  today(): void {
    if (!this.canSelectToday()) { return; }
    this.setSelectedDate(new Date());
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
    if (Number.isNaN(date.getTime()) || !this.isSelectableDate(date)) {
      this.restoreDateInput();
      return;
    }
    this.setSelectedDate(date);
  }

  isTodaySelected(): boolean {
    const s = this.selectedDate;
    const t = new Date();
    return s.getFullYear() === t.getFullYear() && s.getMonth() === t.getMonth() && s.getDate() === t.getDate();
  }

  get minDateInput(): string | null {
    const minimum = this.getMinimumSelectableDate();
    return minimum ? this.toDateString(minimum) : null;
  }

  get maxDateInput(): string {
    return this.toDateString(this.getMaximumSelectableDate());
  }

  canPreviousDay(): boolean {
    const minimum = this.getMinimumSelectableDate();
    if (!minimum) { return true; }
    const previous = this.addCalendarDays(this.selectedDate, -1);
    return this.compareCalendarDate(previous, minimum) >= 0;
  }

  canNextDay(): boolean {
    const next = this.addCalendarDays(this.selectedDate, 1);
    const maximum = this.getMaximumSelectableDate();
    return this.compareCalendarDate(next, maximum) <= 0;
  }

  canSelectToday(): boolean {
    const today = this.startOfCalendarDate(new Date());
    const minimum = this.getMinimumSelectableDate();
    const maximum = this.getMaximumSelectableDate();
    return (!minimum || this.compareCalendarDate(today, minimum) >= 0)
      && this.compareCalendarDate(today, maximum) <= 0;
  }

  async print(): Promise<void> {
    if (!this.vm || this.printing) {
      return;
    }

    this.printing = true;
    this.cdr.markForCheck();

    try {
      await printHljld2Record({
        vm: this.vm,
        remarkLines: this.defaultRemarkLines,
      });
    } catch (error) {
      console.error('[HLJLD][print-error]', error);
      alert(
        error instanceof Error
          ? error.message
          : '打印页生成失败，请重试',
      );
    } finally {
      this.printing = false;
      this.cdr.markForCheck();
    }
  }

  async printAll(): Promise<void> {
    if (!this.patient.pid || this.printingAll) { return; }

    const minDate = this.getMinimumSelectableDate();
    const maxDate = this.getMaximumSelectableDate();
    if (!minDate) { return; }

    this.printingAll = true;
    this.cdr.markForCheck();

    try {
      // 一次性加载入科到出科的全部数据（6 个接口各一次请求）
      const stayStart = startOfNursingDay(minDate);
      const stayEnd = endOfNursingDay(maxDate);
      const result = await firstValueFrom(this.service.loadAll(this.patient.pid, stayStart, stayEnd));

      // 收集签名
      const allSignatures = new Map<string, string>();
      if (result.data) {
        const sigs = await this.collectSignatures(result.data);
        sigs.forEach((v, k) => allSignatures.set(k, v));
      }

      // 按护理日逐天构建 ViewModel，使用统一数据源
      const vms: HljldViewModel[] = [];
      const current = new Date(minDate);
      const savedDate = this.selectedDate;

      while (current <= maxDate) {
        this.selectedDate = new Date(current);
        if (result.data) {
          vms.push(this.toViewModel(result.data, allSignatures, true));
        }
        current.setDate(current.getDate() + 1);
      }
      this.selectedDate = savedDate;

      if (vms.length === 0) {
        alert('没有可打印的护理记录');
        return;
      }

      // 诊断日志
      const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
      if (isDev) {
        console.info('[HLJLD][print-all-loadAll]', {
          bedside: result.data?.bedside.length,
          drugExecutions: result.data?.drugExecutions.length,
          nurseRecords: result.data?.nurseRecords.length,
          tubeExecutions: result.data?.tubeExecutions.length,
        });
        vms.forEach((vm, i) => {
          console.info(`[HLJLD][print-all-vm] #${i}`, {
            date: vm.selectedDate?.toISOString(),
            rows: vm.rows.length,
            timelineItems: vm.timeline.length,
          });
        });
      }

      const printResult = await printAllViaIframe2({
        vms,
        remarkLines: this.defaultRemarkLines,
      });

      if (isDev) {
        console.info('[HLJLD][print-all-result]', printResult);
      }
    } catch (error) {
      console.error('[HLJLD][print-all-error]', error);
      alert(
        error instanceof Error
          ? error.message
          : '一键打印失败，请重试',
      );
    } finally {
      this.printingAll = false;
      this.cdr.markForCheck();
    }
  }
  trackRow(_: number, row: HljldDisplayRow): string { return row.key; }
  trackTimelineItem(_: number, item: HljldTimelineItem): string { return item.key; }
  trackText(index: number): number { return index; }

  private initializeDateForPatient(): void {
    let targetDate = new Date();

    if (this.patient.isDischarged) {
      const admissionTs = parsePatientDateTime(this.patient.admissionTime);
      const dischargeTs = parsePatientDateTime(this.patient.dischargeTime);

      if (Number.isFinite(admissionTs)) {
        const admission = new Date(admissionTs);
        targetDate = new Date(admission.getFullYear(), admission.getMonth(), admission.getDate());
      } else if (Number.isFinite(dischargeTs)) {
        targetDate = this.nursingDateForTimestamp(dischargeTs);
      } else {
        const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
        if (isDev) { console.warn('[HLJLD][init-date] discharged patient without valid admission/discharge time, fallback to today'); }
      }
    }

    this.selectedDate = targetDate;
    this.clampSelectedDateToRange();
  }

  private moveDate(days: number): void {
    const target = this.addCalendarDays(this.selectedDate, days);
    if (!this.isSelectableDate(target)) { return; }
    this.setSelectedDate(target);
  }

  private setSelectedDate(date: Date): void {
    this.selectedDate = this.startOfCalendarDate(date);
    this.dateInput = this.toDateString(this.selectedDate);
    this.dateChange$.next();
  }

  private toDateString(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private getMinimumSelectableDate(): Date | null {
    const admissionTs = parsePatientDateTime(this.patient.admissionTime);
    if (!Number.isFinite(admissionTs)) { return null; }
    return this.nursingDateForTimestamp(admissionTs);
  }

  private getMaximumSelectableDate(): Date {
    if (this.patient.isDischarged) {
      const dischargeTs = parsePatientDateTime(this.patient.dischargeTime);
      if (Number.isFinite(dischargeTs)) {
        return this.nursingDateForTimestamp(dischargeTs);
      }
    }
    return this.startOfCalendarDate(new Date());
  }

  private nursingDateForTimestamp(timestamp: number): Date {
    const value = new Date(timestamp);
    const nursingDate = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const dayStart = new Date(nursingDate);
    dayStart.setHours(7, 0, 0, 0);
    // 护理日为 (当日07:00, 次日07:00]，07:00 整点及之前归上一护理日
    if (minuteInstant(timestamp) <= dayStart.getTime()) {
      nursingDate.setDate(nursingDate.getDate() - 1);
    }
    return nursingDate;
  }

  private startOfCalendarDate(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addCalendarDays(date: Date, days: number): Date {
    const result = this.startOfCalendarDate(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private compareCalendarDate(left: Date, right: Date): number {
    return this.startOfCalendarDate(left).getTime() - this.startOfCalendarDate(right).getTime();
  }

  private isSelectableDate(date: Date): boolean {
    const minimum = this.getMinimumSelectableDate();
    const maximum = this.getMaximumSelectableDate();
    if (minimum && this.compareCalendarDate(date, minimum) < 0) { return false; }
    return this.compareCalendarDate(date, maximum) <= 0;
  }

  private restoreDateInput(): void {
    this.dateInput = this.toDateString(this.selectedDate);
    this.cdr.markForCheck();
  }

  private clampSelectedDateToRange(): void {
    const minimum = this.getMinimumSelectableDate();
    const maximum = this.getMaximumSelectableDate();
    if (minimum && this.compareCalendarDate(this.selectedDate, minimum) < 0) {
      this.selectedDate = new Date(minimum);
    }
    if (this.compareCalendarDate(this.selectedDate, maximum) > 0) {
      this.selectedDate = new Date(maximum);
    }
    this.dateInput = this.toDateString(this.selectedDate);
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

  private toViewModel(source: HljldSourceData, accountMap: Map<string, string>, skipDischargeClip = false): HljldViewModel {
    const rangeStart = startOfNursingDay(this.selectedDate);
    const rangeEnd = endOfNursingDay(this.selectedDate);
    const dayBoundary = new Date(rangeStart); dayBoundary.setHours(17, 0, 0, 0);
    // nextMorning = endOfNursingDay = 次日07:00（不再减1ms）
    const nextMorning = endOfNursingDay(this.selectedDate);

    // 护理日级有效区间：用于页面入科前/出科后判断、明细、引流项目收集
    // 打印时 skipDischargeClip=true，使用完整护理日范围，避免出科时间不准导致数据丢失
    const nursingDayStay = resolveActiveStayRange(this.patient, rangeStart, rangeEnd, skipDischargeClip);

    // buildRows 使用 nextMorning 作为结束时间，确保整个护理日的数据都被包含
    // effectiveEnd 只用于入科前/出科后的页面判断，不用于数据过滤
    const rows = nursingDayStay.hasValidRange
      ? buildRows(source, nursingDayStay.effectiveStart, nextMorning, accountMap, nursingDayStay.startExclusive)
      : [];
    const timeGroups = buildDisplayGroups(rows);

    const drainNames = nursingDayStay.hasValidRange
      ? collectDrainNames(source.bedside, nursingDayStay.effectiveStart, nextMorning, nursingDayStay.startExclusive)
      : [];

    // 每个小结自行根据自己的 periodStart/periodEnd 计算有效范围
    const daySummary = buildSummary('day', '日间小结', this.patient, source, rangeStart, dayBoundary, drainNames);

    // 入科当天且入科时间在17:00之后：当天不需要日间小结（07:00—17:00 期间患者尚未入科）
    const admissionTs = parsePatientDateTime(this.patient.admissionTime);
    const shouldDisableDaySummary = this.isAdmissionAfterDayBoundary(admissionTs, rangeStart);
    if (shouldDisableDaySummary) {
      daySummary.available = false;
    }

    // 7点"小结"直接复制日间小结数据，统计范围与日间小结完全一致（07:00—17:00）
    const shiftSummary: HljldSummary = {
      ...daySummary,
      kind: 'shift',
      label: '日间小结',
      inputItems: daySummary.inputItems.map(item => ({ ...item })),
      outputItems: daySummary.outputItems.map(item => ({ ...item })),
      drainItems: daySummary.drainItems.map(item => ({ ...item })),
      drugTreatmentItems: daySummary.drugTreatmentItems.map(item => ({ ...item })),
      gastrointestinalInputItems: daySummary.gastrointestinalInputItems.map(item => ({ ...item })),
      // 文本行与日间小结完全一致，直接复用
      detailLines: daySummary.detailLines,
    };

    // shiftSummary 通过展开运算符从 daySummary 复制，需要单独检查入科时间
    // 入科当天且入科时间在17:00之后：也不显示夜班小结
    if (shouldDisableDaySummary) {
      shiftSummary.available = false;
    }

    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
    if (isDev) {
      const sameAsDaySummary =
        shiftSummary.periodStart === daySummary.periodStart &&
        shiftSummary.periodEnd === daySummary.periodEnd &&
        shiftSummary.periodText === daySummary.periodText &&
        shiftSummary.totalInput === daySummary.totalInput &&
        shiftSummary.totalOutput === daySummary.totalOutput &&
        shiftSummary.balance === daySummary.balance;
      if (!sameAsDaySummary) {
        console.error('[HLJLD][shift-summary-mismatch]', { daySummary, shiftSummary });
      }
    }

    const fullDaySummary = buildSummary('24h', '24小时总结', this.patient, source, rangeStart, nextMorning, drainNames);

    // 出科总结：出科时间落在 (当日07:00, 次日07:00] 之内
    let dischargeSummary: HljldSummary | undefined;
    const dischargeTs = parsePatientDateTime(this.patient.dischargeTime);
    if (
      Number.isFinite(dischargeTs)
      && minuteInstant(dischargeTs) > minuteInstant(rangeStart)
      && minuteInstant(dischargeTs) <= minuteInstant(nextMorning)
    ) {
      dischargeSummary = buildSummary('discharge', '出科总结', this.patient, source, rangeStart, new Date(dischargeTs), drainNames);
    }

    const nowMs = Date.now();
    const timeline = buildTimeline(
      timeGroups,
      daySummary,
      shiftSummary,
      fullDaySummary,
      dayBoundary.getTime(),
      nextMorning.getTime(),
      nowMs,
      dischargeSummary,
      // effectiveEndMs 始终使用次日07:00，确保数据行不会被 dischargeTime 截断
      nextMorning.getTime(),
    );

    return {
      patient: this.patient,
      selectedDate: this.selectedDate,
      rangeStart,
      rangeEnd,
      rows,
      displayRows: timeGroups.flatMap(g => g.rows),
      timeGroups,
      timeline,
      daySummary,
      shiftSummary,
      fullDaySummary,
      dischargeSummary,
      remark: '',
    };
  }

  private async collectSignatures(source: HljldSourceData): Promise<Map<string, string>> {
    const yishiIds = source.bedside
      .filter(item => item.valid !== false && item.code === 'param_Yishi' && !!item.time && !!item.editUser)
      .map(item => String(item.editUser).trim());

    // 护理记录签名：仅在记录未自带 username/trueName 时需要用 ID 反查
    const nurseIds = source.nurseRecords
      .filter(item => item.valid !== false)
      .filter(item => !String(item.username ?? '').trim() && !String(item.trueName ?? '').trim())
      .map(item => String(item.userId ?? item.editUser ?? '').trim());

    const userIds = [...yishiIds, ...nurseIds].filter(Boolean);
    if (!userIds.length) { return new Map(); }
    return firstValueFrom(this.service.queryAccounts(userIds));
  }

  private toPatientContext(p: any): PatientContext {
    // 优先使用 icuAdmissionTime/icuDischargeTime（ICU入科/出科时间）
    // 回退到 admissionTime/inTime 和 dischargeTime/outTime
    const admissionTime = p?.icuAdmissionTime || p?.admissionTime || p?.inTime || '';
    const dischargeTime = p?.icuDischargeTime || p?.dischargeTime || p?.outTime || '';

    // 状态标准化：兼容多种出科状态文本
    const status = String(p?.status ?? p?.patientStatus ?? '').trim().toLowerCase();
    const hasDischargedStatus = (
      status === 'discharged' ||
      status === '已出科' ||
      status === '出科' ||
      status === '转出' ||
      status === '已转出' ||
      !!p?.outTime ||
      !!p?.dischargeTime
    );

    // 出科判断必须依赖有效出科时间，不能只依赖状态文字
    const dischargeTs = parsePatientDateTime(dischargeTime);
    const isDischarged = hasDischargedStatus && Number.isFinite(dischargeTs);

    // 开发环境下记录患者状态字段，便于调试
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
    if (isDev && hasDischargedStatus && !isDischarged) {
      console.warn('[HLJLD][patient-context] patient status indicates discharged but no valid dischargeTime:', {
        status: p?.status,
        patientStatus: p?.patientStatus,
        outTime: p?.outTime,
        dischargeTime: p?.dischargeTime,
      });
    }

    return {
      pid: getSmartCarePatientPid(p),
      mrn: String(p?.mrn ?? p?.hospitalNo ?? '').trim(),
      name: String(p?.name ?? p?.patientName ?? '').trim(),
      sex: this.genderText(p?.sex ?? p?.gender ?? ''),
      age: String(p?.age ?? '').trim(),
      bedNo: String(p?.hisBed ?? p?.bedNo ?? p?.bedCode ?? '').trim(),
      diagnosis: this.formatDiagnosis(p?.clinicalDiagnosis ?? p?.diagnosis ?? ''),
      admissionTime,
      dischargeTime,
      isDischarged,
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

  /**
   * 判断入科日期是否与 selectedDate 相同，且入科时间在17:00之后。
   * 用于决定当天是否需要显示日间小结/夜班小结。
   * 使用上海时区比较，避免时区偏差。
   */
  private isAdmissionAfterDayBoundary(admissionTs: number, rangeStart: Date): boolean {
    if (!Number.isFinite(admissionTs)) { return false; }

    const fmtDate = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const admissionDateStr = fmtDate.format(new Date(admissionTs));
    const selectedDateStr = fmtDate.format(rangeStart);
    if (admissionDateStr !== selectedDateStr) { return false; }

    // 入科日期与 selectedDate 相同：比较时间
    const fmtTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = fmtTime.formatToParts(new Date(admissionTs));
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + m >= 17 * 60;
  }

  private resetPatientData(): void {
    this.patient = { pid: '' };
    this.vm = undefined;
    this.source = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], tubeExecutions: [], tubeViews: [], signatures: [] };
    this.accountMap = new Map();
  }

  private clearClinicalData(): void {
    this.vm = undefined;
    this.error = '';
    this.sourceError = '';
    this.source = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], tubeExecutions: [], tubeViews: [], signatures: [] };
    this.accountMap = new Map();
    this.loadVersion++;
  }

  private buildSourceError(statuses: import('./hljld2-form.service').SourceStatus[]): string {
    const errors = statuses.filter(s => s.status === 'error');
    if (!errors.length) { return ''; }
    const names = errors.map(e => `${e.source}(${e.httpStatus || '?'})`).join('、');
    return `部分数据接口异常：${names}`;
  }
}
