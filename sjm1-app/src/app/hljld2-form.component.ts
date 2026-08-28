import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, AfterViewInit } from '@angular/core';
import { Subject, ReplaySubject, EMPTY, firstValueFrom, interval } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { Hljld2FormService } from './hljld2-form.service';
import { HljldDisplayRow, HljldPageState, HljldSourceData, HljldSummary, HljldTimelineItem, HljldViewModel, PatientContext, SummaryTextToken } from './hljld2-form.models';
import { buildDisplayGroups, buildTimeline, buildRows, buildSummary, collectDrainNames, DEFAULT_REMARK_LINES, endOfNursingDay, minuteInstant, parsePatientDateTime, resolveActiveStayRange, startOfNursingDay, calculateColMaxChars, ColMaxCharsConfig, DEFAULT_COL_MAX_CHARS } from './hljld2-form.utils';
import { getSmartCarePatientPid } from './models/smartcare-host-message.model';
import { printHljld2Record, printAllViaIframe2 } from "./hljld2-print.util";

/** 每页最大数据行数（不含表头和备注） */
const MAX_ROWS_PER_PAGE = 23;

/** 扁平行：长文本拆分后的一行，固定18px行高 */
interface FlatRow {
  kind: 'data' | 'day-summary' | 'shift-summary' | 'full-day-summary' | 'discharge-summary';
  /** 数据行 */
  timeText?: string;
  medication?: { name: string; amount: string; route: string };
  enteral?: { name: string; amount: string; route: string };
  urine?: string;
  ultrafiltration?: string;
  output?: { name: string; amount: string };
  drain?: { name: string; amount: string };
  examination?: string;
  treatment?: string;
  basicCare?: string;
  healthEducation?: string;
  nursingRecord?: string;
  signature?: string;
  groupKey?: string;
  continuation?: boolean;
  /** 小结/总结行 */
  summary?: HljldSummary;
  printGroupKey?: string;
}

/** 拆分文本为固定长度的行（按字符数硬断） */
/** 截断文本，超出 maxLen 时加 … */
function truncateText(text: string, maxLen: number): string {
  const trimmed = (text || '').trimEnd();
  if (!trimmed || trimmed.length <= maxLen) { return trimmed; }
  return trimmed.substring(0, maxLen - 1) + '…';
}

function splitText(text: string, maxLen: number): string[] {
  const trimmed = (text || '').trimEnd();
  if (!trimmed) { return ['']; }
  const lines: string[] = [];
  let remaining = trimmed;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { lines.push(remaining); break; }
    lines.push(remaining.substring(0, maxLen));
    remaining = remaining.substring(maxLen);
  }
  return lines.filter(l => l.length > 0);
}

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
  refreshingPage = false;
  private source: HljldSourceData = { bedside: [], drugExecutions: [], drugMethods: [], nurseRecords: [], tubeExecutions: [], tubeViews: [], signatures: [] };
  private accountMap = new Map<string, string>();
  private readonly clockRefresh$ = interval(60_000);

  /** 请求版本令牌，每次日期请求递增，防止异步竞态 */
  private loadVersion = 0;

  // 卡片式分页
  currentPage = 1;
  totalPages = 1;
  pages: FlatRow[][] = [];
  pageRowCounts: number[] = [];

  /** 动态计算的列字符数配置 */
  colMaxChars: ColMaxCharsConfig = DEFAULT_COL_MAX_CHARS;

  constructor(
    private service: Hljld2FormService,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    // 初始化时计算列字符数
    this.updateColMaxChars();

    // 监听窗口大小变化，重新计算列字符数
    if (typeof window !== 'undefined') {
      const resizeHandler = () => this.updateColMaxChars();
      window.addEventListener('resize', resizeHandler);
      this.destroy$.subscribe(() => window.removeEventListener('resize', resizeHandler));
    }

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

        // 初始化页码和分页
        this.currentPage = 1;

        // 诊断日志：timeline 详情
        console.info('[HLJLD][DEBUG] timeline items:', this.vm.timeline.length);
        this.vm.timeline.forEach((item, i) => {
          const rows = this.getRowCount(item);
          if (item.kind === 'time-group') {
            const dataRows = item.group.rows;
            console.info(`[HLJLD][item ${i}] time-group rows=${rows} displayRows=${dataRows.length} time=${dataRows[0]?.timeText || ''}`);
          } else {
            console.info(`[HLJLD][item ${i}] ${item.kind} rows=${rows}`);
          }
        });

        const rawPages = this.splitIntoPages(this.vm.timeline);
        this.pages = rawPages.map(items => this.flattenPageItems(items));
        this.pageRowCounts = this.pages.map(rows => rows.length);
        this.totalPages = this.pages.length;

        // 诊断日志：分页详情
        console.info('[HLJLD][DEBUG] MAX_ROWS_PER_PAGE=', MAX_ROWS_PER_PAGE, 'pages=', rawPages.length);
        rawPages.forEach((items, i) => {
          const kinds = items.map(it => it.kind + '(' + this.getRowCount(it) + ')');
          const flatCount = this.pages[i].length;
          console.info(`[HLJLD][page ${i + 1}] items=[${kinds.join(', ')}] flatRows=${flatCount}`);
        });

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

  /**
   * 根据实际表格宽度动态计算每列最大字符数
   */
  private updateColMaxChars(): void {
    if (typeof document === 'undefined') { return; }
    const table = this.elementRef.nativeElement.querySelector('.record-table') as HTMLElement | null;
    if (!table) { return; }
    const tableWidth = table.offsetWidth;
    if (tableWidth > 0) {
      this.colMaxChars = calculateColMaxChars(tableWidth);
      this.cdr.markForCheck();
    }
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
      // 获取起始页码
      let pageOffset = 0;
      try {
        const dateStr = this.toDateString(this.vm.selectedDate);
        const pageIndex = await firstValueFrom(this.service.getPageIndex(this.patient.pid, dateStr));
        if (pageIndex.status === 'completed' && pageIndex.startPageNo > 1) {
          pageOffset = pageIndex.startPageNo - 1;
        }
      } catch { /* 后端无索引时从1开始 */ }

      await printHljld2Record({
        vm: this.vm,
        remarkLines: this.defaultRemarkLines,
        pageOffset,
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

      // 从后端获取起始页码，实现跨次打印连续编号
      let pageOffset = 0;
      try {
        const firstDate = this.toDateString(minDate);
        const pageIndex = await firstValueFrom(this.service.getPageIndex(this.patient.pid, firstDate));
        if (pageIndex.status === 'completed' && pageIndex.startPageNo > 1) {
          pageOffset = pageIndex.startPageNo - 1;
        }
      } catch {
        // 后端无索引时从1开始
      }

      const printResult = await printAllViaIframe2({
        vms,
        remarkLines: this.defaultRemarkLines,
        pageOffset,
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
  /**
   * 刷新页码索引（重新计算当前患者的页码）
   */
  async refreshPageIndex(): Promise<void> {
    if (!this.patient.pid || this.refreshingPage) { return; }
    this.refreshingPage = true;
    this.cdr.markForCheck();
    try {
      await firstValueFrom(this.service.recalculatePageIndexes(this.patient.pid));
      // 轮询状态，等待计算完成
      let attempts = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        const status = await firstValueFrom(this.service.getRecalculateStatus(this.patient.pid));
        if (status.status === 'completed') {
          alert('页码刷新完成');
          this.refreshingPage = false;
          this.cdr.markForCheck();
          return;
        }
        if (status.status === 'failed') {
          alert('页码计算失败，请重试');
          this.refreshingPage = false;
          this.cdr.markForCheck();
          return;
        }
        attempts++;
      }
      alert('页码计算超时，请稍后重试');
    } catch (error) {
      console.error('[HLJLD][refresh-page-index-error]', error);
      alert('刷新页码失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      this.refreshingPage = false;
      this.cdr.markForCheck();
    }
  }

  trackFlatRow(_: number, row: FlatRow): string {
    if (row.kind === 'data') { return row.groupKey + '_' + row.timeText + '_' + row.nursingRecord; }
    return row.printGroupKey || '';
  }
  trackText(index: number): number { return index; }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) { return; }
    this.currentPage = page;
    this.cdr.markForCheck();
  }

  /**
   * 将 timeline 项拆分为多页，每页最多 MAX_ROWS_PER_PAGE 行。
   * 小结/总结行占用页面行数空间：日间小结/交接班小结减4行，全日总结/出科总结减8行。
   * 同一个时间组及其紧跟的摘要会尽量放在同一页。
   */
  private splitIntoPages(items: HljldTimelineItem[]): HljldTimelineItem[][] {
    if (!items.length) { return [[]]; }

    const pages: HljldTimelineItem[][] = [];
    let current: HljldTimelineItem[] = [];
    let dataRowCount = 0;
    let summaryRows = 0;
    let pageNum = 1;

    for (const item of items) {
      const itemRows = this.getRowCount(item);
      const isSummary = item.kind !== 'time-group';
      const availableRows = MAX_ROWS_PER_PAGE - summaryRows;

      // 需要换页的情况：
      // 1. 当前页有数据且放不下新 item
      // 2. 当前页为空但单个 item 超过页面容量（超长行独立占一页）
      const needNewPage = (dataRowCount > 0 && dataRowCount + itemRows > availableRows)
        || (dataRowCount === 0 && itemRows > MAX_ROWS_PER_PAGE);

      if (needNewPage) {
        pages.push(current);
        current = [];
        dataRowCount = 0;
        summaryRows = 0;
        pageNum++;
      }

      current.push(item);
      if (isSummary) {
        summaryRows += itemRows;
      } else {
        dataRowCount += itemRows;
      }
      const label = item.kind === 'time-group' ? `rows=${itemRows} displayRows=${item.group.rows.length}` : `rows=${itemRows}`;
      console.log(`[HLJLD][split p${pageNum}] +${item.kind} ${label} → dataRows=${dataRowCount} summaryRows=${summaryRows} total=${dataRowCount + summaryRows}/${MAX_ROWS_PER_PAGE}`);
    }

    if (current.length) {
      pages.push(current);
    }

    return pages.length ? pages : [[]];
  }

  /** 计算 timeline item 拆分后的实际行数 */
  private getRowCount(item: HljldTimelineItem): number {
    switch (item.kind) {
      case 'time-group': return this.countSplitRows(item.group.rows);
      case 'day-summary': return 4;
      case 'shift-summary': return 4;
      case 'full-day-summary': return 8;
      case 'discharge-summary': return 8;
      default: return 1;
    }
  }

  /** 计算一组 DisplayRow 拆分后的总行数 */
  private countSplitRows(rows: HljldDisplayRow[]): number {
    let count = 0;
    for (const row of rows) {
      count += this.calcRowSplitCount(row);
    }
    return count;
  }

  /** 计算单个 DisplayRow 占用的行数 — 不再拆行，每行就是1 */
  private calcRowSplitCount(row: HljldDisplayRow): number {
    return 1;
  }

  /** 将 timeline items 扁平化为 FixedRow 数组（长文本拆行） */
  private flattenPageItems(items: HljldTimelineItem[]): FlatRow[] {
    const result: FlatRow[] = [];
    for (const item of items) {
      if (item.kind === 'time-group') {
        for (const row of item.group.rows) {
          // amount 先按 | 拆分，再按列宽拆行
          const splitAmount = (text: string, maxLen: number) => {
            const parts = text.includes('|') ? text.split('|') : [text];
            return parts.flatMap(p => splitText(p, maxLen));
          };

          // 不再拆行，每个 displayRow 就是1行，CSS 自动换行
          const timeLines = [row.timeText || ''];
          const medNameLines = [row.medication?.name || ''];
          const medAmtLines = [row.medication?.amount || ''];
          const medRouteLines = [row.medication?.route || ''];
          const entNameLines = [row.enteral?.name || ''];
          const entAmtLines = [row.enteral?.amount || ''];
          const entRouteLines = [row.enteral?.route || ''];
          const urineLines = [row.urine || ''];
          const ultraLines = [row.ultrafiltration || ''];
          const outNameLines = [row.output?.name || ''];
          const outAmtLines = [row.output?.amount || ''];
          const drainNameLines = [row.drain?.name || ''];
          const drainAmtLines = [row.drain?.amount || ''];
          const checkLines = [row.examination || ''];
          const treatLines = [row.treatment || ''];
          const basicLines = [row.basicCare || ''];
          const healthLines = [row.healthEducation || ''];
          const nursLines = [row.nursingRecord || ''];
          const signLines = [row.signature || ''];

          // 每个 displayRow 直接生成1个 FlatRow，CSS 负责自动换行
          result.push({
            kind: 'data',
            timeText: timeLines[0] || '',
            medication: {
              name: medNameLines[0] || '',
              amount: medAmtLines[0] || '',
              route: medRouteLines[0] || '',
            },
            enteral: {
              name: entNameLines[0] || '',
              amount: entAmtLines[0] || '',
              route: entRouteLines[0] || '',
            },
            urine: urineLines[0] || '',
            ultrafiltration: ultraLines[0] || '',
              output: { name: outNameLines[0] || '', amount: outAmtLines[0] || '' },
              drain: { name: drainNameLines[0] || '', amount: drainAmtLines[0] || '' },
              examination: checkLines[0] || '',
              treatment: treatLines[0] || '',
              basicCare: basicLines[0] || '',
              healthEducation: healthLines[0] || '',
              nursingRecord: nursLines[0] || '',
              signature: signLines[0] || '',
              groupKey: row.groupKey,
              continuation: false,
            });
        }
      } else {
        // 小结/总结行，保持原样
        result.push({
          kind: item.kind as FlatRow['kind'],
          summary: item.summary,
          printGroupKey: item.key,
        });
      }
    }
    return result;
  }

  /** 获取小结/总结的详情行，固定 maxRows 行，不足补 null */
  getDetailLines(summary: HljldSummary, maxRows: number): (SummaryTextToken[] | null)[] {
    const lines = summary.detailLines || [];
    const result: (SummaryTextToken[] | null)[] = [];
    for (let i = 0; i < maxRows; i++) {
      result.push(i < lines.length ? lines[i] : null);
    }
    return result;
  }

  /** 获取备注行，固定 maxRows 行，不足补 null */
  getRemarkLines(maxRows: number): (string | null)[] {
    const lines = this.defaultRemarkLines || [];
    const result: (string | null)[] = [];
    for (let i = 0; i < maxRows; i++) {
      result.push(i < lines.length ? lines[i] : null);
    }
    return result;
  }

  /** 获取单条备注行，超出范围返回空字符串 */
  getRemarkLine(index: number): string {
    const lines = this.defaultRemarkLines || [];
    return index < lines.length ? lines[index] : '';
  }

  private initializeDateForPatient(): void {
    let targetDate = new Date();

    const admissionTs = parsePatientDateTime(this.patient.admissionTime);
    if (Number.isFinite(admissionTs)) {
      // 无论是否出科，都根据入科时间确定默认护理日
      targetDate = this.nursingDateForTimestamp(admissionTs);
    } else if (this.patient.isDischarged) {
      const dischargeTs = parsePatientDateTime(this.patient.dischargeTime);
      if (Number.isFinite(dischargeTs)) {
        targetDate = this.nursingDateForTimestamp(dischargeTs);
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
    // 护理日为 [当日07:00, 次日07:00)，07:00属于当天，07:00之前归上一护理日
    if (minuteInstant(timestamp) < dayStart.getTime()) {
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
    const timeGroups = buildDisplayGroups(rows, this.colMaxChars);

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
