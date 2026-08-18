import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { DomSafePipe } from './dom-safe.pipe';
import { Subject, EMPTY } from 'rxjs';
import { takeUntil, switchMap, filter, distinctUntilChanged, catchError } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { HljldFormService } from './hljld-form.service';
import { HljldPdfService, PageIndexInfo } from './hljld-pdf.service';
import { PatientContext } from './hljld-form.models';
import { getSmartCarePatientPid } from './models/smartcare-host-message.model';

@Component({
  standalone: false,
  selector: 'app-hljld-form',
  templateUrl: './hljld-form.component.html',
  styleUrls: ['./hljld-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HljldFormComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  patient: PatientContext = { pid: '' };
  selectedDate = new Date();
  dateInput = this.toDateString(this.selectedDate);

  // PDF 相关
  pdfUrl = '';
  pageIndex: PageIndexInfo = { startPageNo: 1, pageCount: 0, status: 'completed' };
  pageOptions: number[] = [];
  selectedPageNo = 1;

  // 状态
  loading = false;
  pageState: 'waiting-patient' | 'loading' | 'ready' | 'error' | 'calculating' = 'waiting-patient';
  error = '';
  recalculating = false;
  calculatingProgress = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // 日期范围
  minDateInput = '';
  maxDateInput = '';

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly hljldService: HljldFormService,
    private readonly pdfService: HljldPdfService,
    private readonly cdr: ChangeDetectorRef,
    private readonly elementRef: ElementRef,
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

  ngAfterViewInit(): void {
    // 初始化
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 加载 PDF
   */
  private loadPdf(): void {
    if (!this.patient.pid) {
      return;
    }

    this.loading = true;
    this.stopPolling();
    this.cdr.markForCheck();

    const dateStr = this.toDateString(this.selectedDate);

    // 获取页码信息
    this.pdfService.getPageIndex(this.patient.pid, dateStr).pipe(
      catchError(err => {
        console.error('[HLJLD] 获取页码信息失败', err);
        return [{ startPageNo: 1, pageCount: 1, status: 'completed' as const }];
      }),
    ).subscribe(info => {
      this.pageIndex = info;

      if (info.status === 'calculating') {
        // 后端正在计算页码，进入轮询
        this.pageState = 'calculating';
        this.loading = false;
        this.calculatingProgress = 0;
        this.cdr.markForCheck();
        this.startPolling();
        return;
      }

      if (info.status === 'failed') {
        this.pageState = 'error';
        this.error = '页码计算失败，请点击「纠正页码」重试';
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      // 正常加载
      this.updatePageOptions();
      this.pdfUrl = this.pdfService.getPdfUrl(this.patient.pid, dateStr);
      this.loading = false;
      this.pageState = 'ready';
      this.cdr.markForCheck();
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
            this.loadPdf(); // 重新加载
          } else if (status.status === 'failed') {
            this.stopPolling();
            this.recalculating = false;
            this.pageState = 'error';
            this.error = '页码计算失败，请点击「纠正页码」重试';
            this.cdr.markForCheck();
          }
        },
        error: () => {
          // 轮询出错不停止，继续尝试
        }
      });
    }, 2000); // 每2秒轮询一次
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
   * 日期变化
   */
  onDateInput(dateStr: string): void {
    if (!dateStr) {
      return;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return;
    }

    this.selectedDate = date;
    this.loadPdf();
  }

  /**
   * 选择页码
   */
  onPageSelect(pageNo: number): void {
    this.selectedPageNo = pageNo;
    this.scrollToPage(pageNo - this.pageIndex.startPageNo + 1);
  }

  /**
   * 滚动到指定页
   */
  private scrollToPage(pageNumber: number): void {
    const iframe = this.elementRef.nativeElement.querySelector('.pdf-viewer') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.location.hash = `#page=${pageNumber}`;
    }
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
        // 后端异步处理，开始轮询
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
   * 打印当前页
   */
  printCurrentPage(): void {
    const iframe = this.elementRef.nativeElement.querySelector('.pdf-viewer') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  }

  /**
   * 打印全部
   */
  printAll(): void {
    if (!this.patient.pid) {
      return;
    }
    window.open(this.pdfService.getAllPdfsUrl(this.patient.pid), '_blank');
  }

  /**
   * 前一天
   */
  previousDay(): void {
    const date = new Date(this.selectedDate);
    date.setDate(date.getDate() - 1);
    if (this.minDateInput && date < new Date(this.minDateInput)) {
      return;
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
    if (this.maxDateInput && date > new Date(this.maxDateInput)) {
      return;
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
    const date = new Date(this.selectedDate);
    date.setDate(date.getDate() - 1);
    return date >= new Date(this.minDateInput);
  }

  /**
   * 是否可以后一天
   */
  canNextDay(): boolean {
    if (!this.maxDateInput) {
      return true;
    }
    const date = new Date(this.selectedDate);
    date.setDate(date.getDate() + 1);
    return date <= new Date(this.maxDateInput);
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
    return new Date() <= new Date(this.maxDateInput);
  }

  /**
   * 更新日期范围
   */
  private updateDateRange(): void {
    if (this.patient.admissionTime) {
      const admissionDate = new Date(this.patient.admissionTime);
      this.minDateInput = this.toDateString(admissionDate);
    } else {
      this.minDateInput = '';
    }

    if (this.patient.dischargeTime) {
      const dischargeDate = new Date(this.patient.dischargeTime);
      this.maxDateInput = this.toDateString(dischargeDate);
    } else {
      this.maxDateInput = this.toDateString(new Date());
    }
  }

  /**
   * 获取默认日期
   */
  private getDefaultDate(): Date {
    if (this.patient.dischargeTime) {
      return new Date(this.patient.dischargeTime);
    }
    return new Date();
  }

  /**
   * 重置患者数据
   */
  private resetPatientData(): void {
    this.stopPolling();
    this.patient = { pid: '' };
    this.pdfUrl = '';
    this.pageIndex = { startPageNo: 1, pageCount: 0, status: 'completed' };
    this.pageOptions = [];
    this.selectedPageNo = 1;
    this.minDateInput = '';
    this.maxDateInput = '';
  }

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
      admissionTime: p.admissionTime || '',
      dischargeTime: p.dischargeTime || '',
      isDischarged: p.isDischarged || false,
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
   * 打开日期选择器
   */
  openDatePicker(event: MouseEvent): void {
    const input = event.target as HTMLInputElement;
    input.showPicker();
  }
}
