import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { HljldFormService } from './hljld-form.service';
import { HljldPdfService, PageIndexInfo } from './hljld-pdf.service';
import { PdfPrintService } from './services/pdf-viewer.service';
import { PatientContext } from './hljld-form.models';
import { getSmartCarePatientPid } from './models/smartcare-host-message.model';

@Component({
  standalone: false,
  selector: 'app-hljld-form-pdf',
  templateUrl: './hljld-form-pdf.component.html',
  styleUrls: ['./hljld-form-pdf.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HljldFormPdfComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  patient: PatientContext = { pid: '' };
  selectedDate = new Date();
  dateInput = this.toDateString(this.selectedDate);

  // 默认显示缩放 135%
  readonly defaultZoom = 135;

  // PDF 预览URL（使用浏览器原生PDF查看器）
  pdfViewerUrl = '';

  // 页码信息
  pageIndex: PageIndexInfo = { startPageNo: 1, pageCount: 0, status: 'completed' };
  pageOptions: number[] = [];
  selectedPageNo = 1;

  // 状态
  isLoadingPdf = false;
  isPrinting = false;
  isLoadingAllPdf = false;
  isPrintingRange = false;
  printError = '';
  error = '';
  pageWarning = '';
  recalculating = false;
  calculatingProgress = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  pageState: 'waiting-patient' | 'loading' | 'ready' | 'error' | 'calculating' = 'waiting-patient';

  // 日期范围（预览用）
  minDateInput = '';
  maxDateInput = '';

  // 范围打印
  rangeStartInput = '';
  rangeEndInput = '';

  // 业务参考时间（从路由或宿主数据读取，不伪造）
  businessReferenceTime = '';

  // 当前PDF基础URL（不含fragment）
  basePdfUrl = '';

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly hljldService: HljldFormService,
    private readonly pdfService: HljldPdfService,
    private readonly pdfPrintService: PdfPrintService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // 监听患者变化
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
        this.updateDateRange();
        this.selectedDate = this.getDefaultDate();
        this.dateInput = this.toDateString(this.selectedDate);
        this.initRangeDefaults();
      }

      this.pageState = 'loading';
      this.cdr.markForCheck();
      this.loadPdf();
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 加载PDF — 使用 PREVIEW 模式
   */
  private loadPdf(): void {
    if (!this.patient.pid) {
      return;
    }

    this.isLoadingPdf = true;
    this.error = '';
    this.pageWarning = '';
    this.stopPolling();
    this.cdr.markForCheck();

    const dateStr = this.toDateString(this.selectedDate);
    const referenceTime = this.resolveReferenceTime();

    // 获取页码信息
    this.pdfService.getPageIndex(this.patient.pid, dateStr, referenceTime).pipe(
      catchError(err => {
        console.error('[HLJLD] 获取页码信息失败', err);
        return [{ startPageNo: 1, pageCount: 1, status: 'completed' as const }];
      }),
    ).subscribe(info => {
      if (!info) {
        this.error = '获取页码信息失败';
        this.pageState = 'error';
        this.isLoadingPdf = false;
        this.cdr.markForCheck();
        return;
      }

      this.pageIndex = info;

      if (info.status === 'calculating') {
        this.pageIndex = { startPageNo: 1, pageCount: 1, status: 'calculating' };
        this.pageWarning = '全住院期页码正在计算中，当前预览使用临时页码';
        this.updatePageOptions();
      } else if (info.status === 'failed') {
        this.pageIndex = { startPageNo: 1, pageCount: 1, status: 'failed' };
        this.pageWarning = '全住院期页码计算失败，当前预览使用临时页码，可点击纠正页码重试';
        this.updatePageOptions();
      } else {
        this.updatePageOptions();
      }

      // 生成PREVIEW PDF URL
      this.basePdfUrl = this.pdfService.getPreviewPdfUrl(this.patient.pid, dateStr, referenceTime);

      // 默认显示第1页，缩放135%
      this.updateViewerUrl();

      this.isLoadingPdf = false;
      this.pageState = 'ready';
      this.cdr.markForCheck();
    });
  }

  /**
   * 更新iframe预览URL
   */
  private updateViewerUrl(): void {
    if (!this.basePdfUrl) {
      this.pdfViewerUrl = '';
      return;
    }
    const localPage = this.getSelectedLocalPage();
    this.pdfViewerUrl = `${this.basePdfUrl}#page=${localPage}&zoom=${this.defaultZoom}`;
  }

  /**
   * 计算当前选中页码对应的单日PDF内部页码
   */
  private getSelectedLocalPage(): number {
    const localPage = this.selectedPageNo - this.pageIndex.startPageNo + 1;
    return Math.max(1, Math.min(localPage, this.pageIndex.pageCount || 1));
  }

  /**
   * 更新页码选项
   */
  private updatePageOptions(): void {
    this.pageOptions = [];
    for (let i = 0; i < this.pageIndex.pageCount; i++) {
      this.pageOptions.push(this.pageIndex.startPageNo + i);
    }
    this.selectedPageNo = this.pageOptions[0] || 1;
  }

  /**
   * 选择页码 — 只修改fragment，不重新请求后端PDF
   */
  onPageSelect(pageNo: number): void {
    this.selectedPageNo = pageNo;
    this.updateViewerUrl();
    this.cdr.markForCheck();
  }

  /**
   * 日期变化
   */
  onDateInput(dateStr: string): void {
    if (!dateStr) {
      return;
    }

    // 使用本地日期解析，避免UTC偏移
    const date = this.parseLocalDate(dateStr);
    if (!date) {
      return;
    }

    this.selectedDate = date;
    this.loadPdf();
  }

  /**
   * 纠正页码
   */
  recalculatePageIndexes(): void {
    if (!this.patient.pid || this.recalculating) {
      return;
    }

    const confirmed = confirm('确定要重新计算页码吗？\n\n这将根据入科时间到当前时间的所有数据重新计算，可能需要一些时间。');
    if (!confirmed) {
      return;
    }

    this.recalculating = true;
    this.pageState = 'calculating';
    this.calculatingProgress = 0;
    this.cdr.markForCheck();

    this.pdfService.recalculatePageIndexes(this.patient.pid).subscribe({
      next: () => {
        this.startPolling();
      },
      error: (err) => {
        alert('页码计算启动失败：' + (err.message || '请重试'));
        this.recalculating = false;
        this.pageState = 'ready';
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * 开始轮询计算状态
   */
  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      if (!this.patient.pid) {
        this.stopPolling();
        return;
      }

      this.pdfService.getRecalculateStatus(this.patient.pid).subscribe({
        next: (status) => {
          this.calculatingProgress = status.progress || 0;
          this.cdr.markForCheck();

          if (status.status === 'completed') {
            this.stopPolling();
            this.recalculating = false;
            this.loadPdf();
          } else if (status.status === 'failed') {
            this.stopPolling();
            this.recalculating = false;
            this.pageWarning = '页码计算失败，请点击「纠正页码」重试';
            this.pageState = 'ready';
            this.cdr.markForCheck();
          }
        },
        error: () => {
          // 轮询出错不停止，继续尝试
        }
      });
    }, 2000);
  }

  /**
   * 停止轮询
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * 打印当日PDF — 使用 PRINT_DAY 模式
   */
  async printCurrentDay(): Promise<void> {
    if (!this.patient.pid || this.isPrinting || this.isPrintingRange || this.isLoadingAllPdf) {
      return;
    }

    this.isPrinting = true;
    this.printError = '';
    this.cdr.markForCheck();

    try {
      const dateStr = this.toDateString(this.selectedDate);
      const referenceTime = this.resolveReferenceTime();
      const printUrl = this.pdfService.getDailyPrintPdfUrl(this.patient.pid, dateStr, referenceTime);
      const blob = await this.pdfPrintService.fetchPdfBlob(printUrl);
      await this.pdfPrintService.printPdfBlob(blob);
    } catch (err: any) {
      console.error('[HLJLD] 打印失败', err);
      this.printError = err.message || '打印失败';
      setTimeout(() => {
        this.printError = '';
        this.cdr.markForCheck();
      }, 5000);
    } finally {
      this.isPrinting = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * 一键打印全部护理记录 — 使用 PRINT_ALL 模式
   */
  async printAll(): Promise<void> {
    if (!this.patient.pid || this.isLoadingAllPdf || this.isPrinting || this.isPrintingRange) {
      return;
    }

    this.isLoadingAllPdf = true;
    this.isPrinting = true;
    this.printError = '';
    this.cdr.markForCheck();

    try {
      const referenceTime = this.resolveReferenceTime();
      const pdfUrl = this.pdfService.getAllPdfsUrl(this.patient.pid, referenceTime);
      const blob = await this.pdfPrintService.fetchPdfBlob(pdfUrl);
      await this.pdfPrintService.printPdfBlob(blob);
    } catch (err: any) {
      console.error('[HLJLD] 一键打印失败', err);
      this.printError = err.message || '一键打印失败';
      setTimeout(() => {
        this.printError = '';
        this.cdr.markForCheck();
      }, 5000);
    } finally {
      this.isLoadingAllPdf = false;
      this.isPrinting = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * 打印时间范围 — 使用 PRINT_RANGE 模式
   */
  async printRange(): Promise<void> {
    if (!this.patient.pid || this.isPrintingRange || this.isPrinting || this.isLoadingAllPdf) {
      return;
    }

    // 校验
    if (!this.rangeStartInput || !this.rangeEndInput) {
      this.printError = '请选择开始和结束护理日';
      this.cdr.markForCheck();
      setTimeout(() => { this.printError = ''; this.cdr.markForCheck(); }, 5000);
      return;
    }

    if (this.rangeStartInput > this.rangeEndInput) {
      this.printError = '开始日期不能晚于结束日期';
      this.cdr.markForCheck();
      setTimeout(() => { this.printError = ''; this.cdr.markForCheck(); }, 5000);
      return;
    }

    // 边界校验
    if (this.minDateInput && this.rangeStartInput < this.minDateInput) {
      this.printError = '开始日期不能早于入科护理日';
      this.cdr.markForCheck();
      setTimeout(() => { this.printError = ''; this.cdr.markForCheck(); }, 5000);
      return;
    }

    if (this.maxDateInput && this.rangeEndInput > this.maxDateInput) {
      this.printError = '结束日期不能晚于' + (this.patient.isDischarged ? '出科护理日' : '当前护理日');
      this.cdr.markForCheck();
      setTimeout(() => { this.printError = ''; this.cdr.markForCheck(); }, 5000);
      return;
    }

    this.isPrintingRange = true;
    this.isPrinting = true;
    this.printError = '';
    this.cdr.markForCheck();

    try {
      const referenceTime = this.resolveReferenceTime();
      const printUrl = this.pdfService.getRangePrintPdfUrl(
        this.patient.pid, this.rangeStartInput, this.rangeEndInput, referenceTime);
      const blob = await this.pdfPrintService.fetchPdfBlob(printUrl);
      await this.pdfPrintService.printPdfBlob(blob);
    } catch (err: any) {
      console.error('[HLJLD] 范围打印失败', err);
      this.printError = err.message || '范围打印失败';
      setTimeout(() => {
        this.printError = '';
        this.cdr.markForCheck();
      }, 5000);
    } finally {
      this.isPrintingRange = false;
      this.isPrinting = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * 刷新PDF
   */
  refreshPdf(): void {
    this.loadPdf();
  }

  /**
   * 前一天
   */
  previousDay(): void {
    const date = new Date(this.selectedDate);
    date.setDate(date.getDate() - 1);
    if (this.minDateInput) {
      const minDate = this.parseLocalDate(this.minDateInput);
      if (minDate && date < minDate) {
        return;
      }
    }
    this.selectedDate = date;
    this.dateInput = this.toDateString(date);
    this.loadPdf();
  }

  /**
   * 后一天
   */
  nextDay(): void {
    const date = new Date(this.selectedDate);
    date.setDate(date.getDate() + 1);
    if (this.maxDateInput) {
      const maxDate = this.parseLocalDate(this.maxDateInput);
      if (maxDate && date > maxDate) {
        return;
      }
    }
    this.selectedDate = date;
    this.dateInput = this.toDateString(date);
    this.loadPdf();
  }

  /**
   * 今天 — 使用当前护理日（07:00 边界），而非自然日
   */
  today(): void {
    this.selectedDate = this.nursingDate(new Date());
    this.dateInput = this.toDateString(this.selectedDate);
    this.loadPdf();
  }

  /**
   * 是否可以前一天
   */
  canPreviousDay(): boolean {
    if (!this.minDateInput) {
      return true;
    }
    const prevDay = new Date(this.selectedDate);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayStr = this.toDateString(prevDay);
    return prevDayStr >= this.minDateInput;
  }

  /**
   * 是否可以后一天
   */
  canNextDay(): boolean {
    if (!this.maxDateInput) {
      return true;
    }
    const selectedStr = this.toDateString(this.selectedDate);
    const nextDay = new Date(this.selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = this.toDateString(nextDay);
    return nextDayStr <= this.maxDateInput;
  }

  /**
   * 是否是今天（使用护理日）
   */
  isTodaySelected(): boolean {
    const today = this.nursingDate(new Date());
    return this.selectedDate.toDateString() === today.toDateString();
  }

  /**
   * 是否可以选择今天（使用护理日）
   */
  canSelectToday(): boolean {
    const todayStr = this.toDateString(this.nursingDate(new Date()));
    if (!this.maxDateInput) {
      return true;
    }
    return todayStr <= this.maxDateInput;
  }

  /**
   * 任何打印是否正在进行
   */
  isAnyPrinting(): boolean {
    return this.isPrinting || this.isLoadingAllPdf || this.isPrintingRange;
  }

  /**
   * 更新日期范围 — 在院患者上限为当前护理日，出科患者上限为出科护理日
   */
  private updateDateRange(): void {
    // 入科时间 → minDateInput（所有患者）
    if (this.patient.admissionTime) {
      const admissionDate = this.parseTimeField(this.patient.admissionTime);
      if (admissionDate) {
        this.minDateInput = this.toDateString(this.nursingDate(admissionDate));
      }
    } else {
      this.minDateInput = '';
    }

    // maxDateInput：出科患者用出科护理日，在院患者用当前护理日
    if (this.patient.isDischarged && this.patient.dischargeTime) {
      const dischargeDate = this.parseTimeField(this.patient.dischargeTime);
      if (dischargeDate) {
        this.maxDateInput = this.toDateString(this.nursingDate(dischargeDate));
      }
    } else {
      // 在院患者：上限为当前护理日（07:00 边界）
      this.maxDateInput = this.toDateString(this.nursingDate(new Date()));
    }
  }

  /**
   * 获取默认日期 — 出科患者默认入科护理日，在院患者默认当前护理日
   */
  private getDefaultDate(): Date {
    if (this.patient.isDischarged && this.patient.admissionTime) {
      const admissionTs = this.parseTimeField(this.patient.admissionTime);
      if (admissionTs) {
        return this.nursingDate(admissionTs);
      }
    }
    return this.nursingDate(new Date());
  }

  /**
   * 初始化范围打印默认值
   */
  private initRangeDefaults(): void {
    const dateStr = this.toDateString(this.selectedDate);
    this.rangeStartInput = dateStr;
    this.rangeEndInput = dateStr;
  }

  /**
   * 根据时间戳计算所属护理日日期
   */
  private nursingDate(date: Date): Date {
    const cal = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (date.getHours() < 7) {
      cal.setDate(cal.getDate() - 1);
    }
    return cal;
  }

  /**
   * 重置患者数据
   */
  private resetPatientData(): void {
    this.stopPolling();
    this.patient = { pid: '' };
    this.basePdfUrl = '';
    this.pdfViewerUrl = '';
    this.totalPages = 0;
    this.currentPage = 1;
    this.pageIndex = { startPageNo: 1, pageCount: 0, status: 'completed' };
    this.pageOptions = [];
    this.selectedPageNo = 1;
    this.minDateInput = '';
    this.maxDateInput = '';
    this.rangeStartInput = '';
    this.rangeEndInput = '';
  }

  // 保留totalPages和currentPage用于模板状态显示
  totalPages = 0;
  currentPage = 1;

  /**
   * 转换患者上下文
   */
  private toPatientContext(p: any): PatientContext {
    return {
      pid: getSmartCarePatientPid(p) || '',
      mrn: p.mrn || '',
      name: p.name || '',
      sex: p.sex || '',
      age: p.age || '',
      bedNo: p.bedNo || '',
      diagnosis: p.diagnosis || '',
      admissionTime: p.icuAdmissionTime || p.admissionTime || '',
      dischargeTime: p.icuDischargeTime || p.dischargeTime || '',
      isDischarged: p.isDischarged === true || String(p.status || '').toLowerCase() === 'discharged',
    };
  }

  /**
   * 日期转字符串
   */
  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 解析时间字段 — 支持完整 ISO-8601、yyyy-MM-dd HH:mm:ss、yyyy-MM-dd、epoch millis
   */
  private parseTimeField(value: string | number | undefined): Date | null {
    if (!value) {
      return null;
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    const str = String(value).trim();
    if (!str) return null;

    // 完整 ISO-8601（含 T 和时区偏移）
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }

    // yyyy-MM-dd HH:mm:ss（无时区，视为 Asia/Shanghai 本地时间）
    const hhmmssMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str);
    if (hhmmssMatch) {
      const [, y, m, d, hh, mm, ss] = hhmmssMatch;
      const date = new Date(
        Number(y), Number(m) - 1, Number(d),
        Number(hh), Number(mm), Number(ss || '0'),
      );
      return isNaN(date.getTime()) ? null : date;
    }

    // yyyy-MM-dd（仅日期）
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (dateOnlyMatch) {
      return this.parseLocalDate(str);
    }

    return null;
  }

  /**
   * 本地日期解析（避免UTC偏移）
   */
  private parseLocalDate(dateStr: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  /**
   * 获取业务时间（参考时间）
   */
  private resolveReferenceTime(): string {
    if (this.businessReferenceTime) {
      return this.businessReferenceTime;
    }
    return this.formatShanghaiTime(new Date());
  }

  /**
   * 格式化为上海时区ISO格式
   */
  private formatShanghaiTime(value: Date): string {
    const parts =
      new Intl.DateTimeFormat(
        'en-CA',
        {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        },
      )
        .formatToParts(value)
        .reduce<Record<string, string>>(
          (result, part) => {
            if (part.type !== 'literal') {
              result[part.type] = part.value;
            }
            return result;
          },
          {},
        );

    return (
      `${parts['year']}-` +
      `${parts['month']}-` +
      `${parts['day']}T` +
      `${parts['hour']}:` +
      `${parts['minute']}:` +
      `${parts['second']}+08:00`
    );
  }

  /**
   * 打开日期选择器
   */
  openDatePicker(event: MouseEvent): void {
    const input = event.target as HTMLInputElement;
    input.showPicker();
  }
}
