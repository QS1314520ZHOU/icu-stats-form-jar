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
  printError = '';
  error = '';
  pageWarning = '';
  recalculating = false;
  calculatingProgress = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  pageState: 'waiting-patient' | 'loading' | 'ready' | 'error' | 'calculating' = 'waiting-patient';

  // 日期范围
  minDateInput = '';
  maxDateInput = '';

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
   * 加载PDF - 只设置iframe URL，由浏览器原生查看器加载
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

      // 生成PDF URL（传递当前业务时间）
      this.basePdfUrl = this.pdfService.getPdfUrl(this.patient.pid, dateStr, referenceTime);

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
   * 选择页码 - 只修改fragment，不重新请求后端PDF
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
   * 打印当前日PDF
   */
  async printCurrentDay(): Promise<void> {
    if (!this.basePdfUrl || this.isPrinting) {
      return;
    }

    this.isPrinting = true;
    this.printError = '';
    this.cdr.markForCheck();

    try {
      const blob = await this.pdfPrintService.fetchPdfBlob(this.basePdfUrl);
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
   * 一键打印全部护理记录
   */
  async printAll(): Promise<void> {
    if (!this.patient.pid || this.isLoadingAllPdf || this.isPrinting) {
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
   * 今天
   */
  today(): void {
    this.selectedDate = new Date();
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
   * 是否是今天
   */
  isTodaySelected(): boolean {
    const today = new Date();
    return this.selectedDate.toDateString() === today.toDateString();
  }

  /**
   * 是否可以选择今天
   */
  canSelectToday(): boolean {
    if (!this.maxDateInput) {
      return true;
    }
    const todayStr = this.toDateString(new Date());
    return todayStr <= this.maxDateInput;
  }

  /**
   * 更新日期范围
   * 出科患者：限制入科~出科日期范围
   * 在科患者：不限制范围
   */
  private updateDateRange(): void {
    if (!this.patient.isDischarged) {
      // 在科患者：不限制日期范围
      this.minDateInput = '';
      this.maxDateInput = '';
      return;
    }

    // 出科患者：限制入科~出科范围
    if (this.patient.admissionTime) {
      const admissionDate = this.parseTimeField(this.patient.admissionTime);
      if (admissionDate) {
        this.minDateInput = this.toDateString(admissionDate);
      }
    } else {
      this.minDateInput = '';
    }

    if (this.patient.dischargeTime) {
      const dischargeDate = this.parseTimeField(this.patient.dischargeTime);
      if (dischargeDate) {
        this.maxDateInput = this.toDateString(dischargeDate);
      }
    } else {
      this.maxDateInput = '';
    }
  }

  /**
   * 获取默认日期
   * 出科患者：默认入科日期；在科患者：默认今天
   */
  private getDefaultDate(): Date {
    if (this.patient.isDischarged && this.patient.admissionTime) {
      const admissionDate = this.parseTimeField(this.patient.admissionTime);
      if (admissionDate) {
        return admissionDate;
      }
    }
    return new Date();
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
   * 解析时间字段 — 兼容字符串(yyyy-MM-dd)和数字(毫秒时间戳)
   */
  private parseTimeField(value: string | number | undefined): Date | null {
    if (!value) {
      return null;
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    // 字符串：取前10位 yyyy-MM-dd
    const str = String(value).substring(0, 10);
    return this.parseLocalDate(str);
  }

  /**
   * 本地日期解析（避免UTC偏移）
   * yyyy-MM-dd 格式日期在JavaScript中可能按UTC解析导致日期偏移
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
   * 优先使用上游传入的businessReferenceTime，不伪造时间
   * 使用Asia/Shanghai时区，返回ISO格式字符串
   */
  private resolveReferenceTime(): string {
    // 优先使用已传入的业务参考时间（原样透传）
    if (this.businessReferenceTime) {
      return this.businessReferenceTime;
    }

    // 兼容回退：使用当前时间作为业务时间
    // 仅在业务调用链确实没有传referenceTime时使用
    return this.formatShanghaiTime(new Date());
  }

  /**
   * 格式化为上海时区ISO格式
   * 使用Intl.DateTimeFormat确保时区正确
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
