import {
  ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewContainerRef,
} from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, filter, map, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { formatShanghaiDateMinute } from './form-date.util';
import { PrintCenterService } from './print-center.service';
import { PRINT_FORMS, PRINT_GROUP_NAMES, VIEW_ONLY_FORMS } from './print-center.registry';
import { PrintGroupKey, PrintGroupView, PrintRow } from './print-center.models';

@Component({
  standalone: false,
  selector: 'app-print-center',
  templateUrl: './print-center.component.html',
  styleUrls: ['./print-center.component.css'],
})
export class PrintCenterComponent implements OnInit, OnDestroy {
  /** 离屏渲染舞台 */
  @ViewChild('stageHost', { read: ViewContainerRef, static: true })
  stageHost!: ViewContainerRef;
  @ViewChild('stageWrap', { static: true })
  stageWrap!: ElementRef<HTMLElement>;

  readonly viewOnlyForms = VIEW_ONLY_FORMS;

  patient: any = null;
  pid = '';
  age: number | null = null;
  diagnosisDisplay = '';

  rows: PrintRow[] = [];
  showEmpty = false;
  scanning = false;
  scanError = '';

  preparing = false;
  printing = false;
  progressText = '';
  finishedSummary = '';

  private cancelled = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly hostPatient: HostPatientService,
    private readonly service: PrintCenterService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.rows = PRINT_FORMS.map(def => ({
      def, selected: false, hasData: false, count: 0,
      estimatedPages: 0, renderedPages: 0, selectedPages: [],
      sheets: [], state: 'idle', errorText: '',
    }));
  }

  ngOnInit(): void {
    this.hostPatient.patient$.pipe(
      filter(Boolean),
      map(p => ({ p, pid: String((p as any).id ?? '').trim() })),
      filter(x => !!x.pid),
      distinctUntilChanged((a, b) => a.pid === b.pid),
      takeUntil(this.destroy$),
    ).subscribe(({ p, pid }) => {
      this.patient = p;
      this.pid = pid;
      this.age = this.calcAge((p as any).birthday);
      this.diagnosisDisplay = this.formatDiagnosis((p as any).clinicalDiagnosis);
      this.resetRows();
      this.refresh();
    });
  }

  ngOnDestroy(): void {
    this.cancelled = true;
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ------------------------------ 视图数据 ------------------------------ */

  get groups(): PrintGroupView[] {
    const keys: PrintGroupKey[] = ['tube', 'risk', 'therapy', 'nursing'];
    return keys
      .map(key => ({
        key,
        name: PRINT_GROUP_NAMES[key],
        rows: this.rows.filter(r => r.def.group === key && (this.showEmpty || r.hasData)),
      }))
      .filter(group => group.rows.length > 0);
  }

  get busy(): boolean { return this.scanning || this.preparing || this.printing; }
  get selectedRows(): PrintRow[] { return this.rows.filter(r => r.selected && r.hasData); }
  get selectedCount(): number { return this.selectedRows.length; }
  get dataCount(): number { return this.rows.filter(r => r.hasData).length; }
  get canPrint(): boolean { return !!this.pid && !this.busy && this.selectedCount > 0; }

  get estimatedPages(): number {
    return this.selectedRows.reduce(
      (sum, row) => sum + (row.renderedPages || row.estimatedPages || 1), 0);
  }

  get orientationHint(): string {
    const landscape = this.selectedRows.filter(r => r.def.orientation === 'landscape').length;
    const portrait = this.selectedRows.length - landscape;
    const jobs = (landscape > 0 ? 1 : 0) + (portrait > 0 ? 1 : 0);
    if (jobs <= 1) { return ''; }
    return `横向 ${landscape} 份 / 纵向 ${portrait} 份，将分 ${jobs} 次调起打印对话框。`;
  }

  groupSelectedCount(group: PrintGroupView): number {
    return group.rows.filter(r => r.selected).length;
  }
  groupDataCount(group: PrintGroupView): number {
    return group.rows.filter(r => r.hasData).length;
  }
  isGroupAllSelected(group: PrintGroupView): boolean {
    const selectable = group.rows.filter(r => r.hasData);
    return selectable.length > 0 && selectable.every(r => r.selected);
  }
  isGroupIndeterminate(group: PrintGroupView): boolean {
    const selectable = group.rows.filter(r => r.hasData);
    const picked = selectable.filter(r => r.selected).length;
    return picked > 0 && picked < selectable.length;
  }

  statusText(row: PrintRow): string {
    if (this.scanning) { return '检测中…'; }
    if (!row.hasData) { return '无数据'; }
    return `有数据 ${row.count} 条`;
  }
  latestText(row: PrintRow): string {
    return row.latestTime ? `最近 ${formatShanghaiDateMinute(row.latestTime)}` : '';
  }
  pageText(row: PrintRow): string {
    if (row.renderedPages > 0) { return `${row.renderedPages} 页`; }
    return row.estimatedPages > 0 ? `约 ${row.estimatedPages} 页` : '—';
  }

  /* ------------------------------ 交互 ------------------------------ */

  refresh(): void {
    if (!this.pid) { return; }
    this.scanning = true;
    this.scanError = '';
    this.finishedSummary = '';
    this.service.loadAvailability(this.pid, PRINT_FORMS)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: table => {
          this.rows.forEach(row => {
            const item = table.get(row.def.key);
            row.hasData = !!item?.hasData;
            row.count = item?.count ?? 0;
            row.latestTime = item?.latestTime;
            row.estimatedPages = item?.estimatedPages ?? (row.hasData ? 1 : 0);
            row.selected = row.hasData;              // 默认勾选有数据的表单
            row.renderedPages = 0;
            row.selectedPages = [];
            row.sheets = [];
            row.state = 'idle';
            row.errorText = '';
          });
          this.scanning = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.scanning = false;
          this.scanError = '表单数据检测失败，请点击「重新检测」重试';
          this.cdr.detectChanges();
        },
      });
  }

  selectAllWithData(): void { this.rows.forEach(r => { if (r.hasData) { r.selected = true; } }); }
  clearSelection(): void { this.rows.forEach(r => { r.selected = false; }); }

  toggleGroup(group: PrintGroupView, checked: boolean): void {
    group.rows.forEach(row => { if (row.hasData) { row.selected = checked; } });
  }

  /** 预检：离屏渲染并统计真实页数，之后行内页码选择才可用 */
  async prepare(): Promise<boolean> {
    const targets = this.selectedRows;
    if (!targets.length) { return false; }
    this.preparing = true;
    this.cancelled = false;
    this.finishedSummary = '';
    this.cdr.detectChanges();
    try {
      await this.service.collect(
        targets,
        this.stageHost,
        row => {
          this.progressText = `正在渲染：${row.def.title}`;
          this.cdr.detectChanges();
        },
        () => this.cancelled,
      );
      return true;
    } finally {
      this.preparing = false;
      this.progressText = '';
      this.cdr.detectChanges();
    }
  }

  async startPrint(): Promise<void> {
    if (!this.canPrint) { return; }

    // 1. 同步预创建打印窗口（用户点击同步调用栈内，不会被拦截）
    const preWin = window.open('', '_blank', 'width=1400,height=900');
    if (!preWin) {
      this.finishedSummary = '打印窗口被拦截，请允许弹出窗口后重试。';
      this.cdr.detectChanges();
      return;
    }
    // 窗口先显示加载提示
    preWin.document.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:18px;color:#888">正在准备打印，请稍候……</body></html>');
    preWin.document.close();

    // 2. 设置离屏舞台引用，用于提取 scoped 样式
    if (this.stageWrap) {
      this.service.setStageElement(this.stageWrap.nativeElement);
    }

    // 3. 异步渲染并采集
    const ok = await this.prepare();
    if (!ok || this.cancelled) {
      try { preWin.close(); } catch { /* ignore */ }
      return;
    }

    const ready = this.selectedRows.filter(r => r.state === 'ready');
    const failed = this.selectedRows.filter(r => r.state === 'failed');
    if (!ready.length) {
      try { preWin.close(); } catch { /* ignore */ }
      this.finishedSummary = '没有可打印的内容，请检查所选表单。';
      this.cdr.detectChanges();
      return;
    }

    // 4. 传入预创建窗口，分组打印
    this.printing = true;
    this.cdr.detectChanges();
    try {
      await this.service.printRows(ready, preWin);
      this.finishedSummary = failed.length
        ? `已发送 ${ready.length} 份；${failed.length} 份渲染失败，可单独打开该表单打印。`
        : `已发送 ${ready.length} 份到打印机。`;
    } catch (error) {
      this.finishedSummary = error instanceof Error ? error.message : '打印失败';
    } finally {
      this.printing = false;
      // 清空不再使用的 sheets HTML，释放内存
      this.service.clearSheetCache(this.rows);
      this.cdr.detectChanges();
    }
  }

  cancel(): void { this.cancelled = true; }

  formUrl(route: string): string { return `/form/${route}`; }
  trackRow(_: number, row: PrintRow): string { return row.def.key; }

  /* ------------------------------ 工具 ------------------------------ */

  private resetRows(): void {
    this.rows.forEach(row => {
      row.selected = false; row.hasData = false; row.count = 0;
      row.latestTime = undefined; row.estimatedPages = 0; row.renderedPages = 0;
      row.selectedPages = []; row.sheets = []; row.state = 'idle'; row.errorText = '';
    });
  }

  get bedText(): string {
    const bed = String(this.patient?.hisBed ?? '').trim();
    if (!bed) { return ''; }
    return bed.endsWith('床') ? bed : `${bed}床`;
  }

  genderText(g?: string | number): string {
    const v = String(g ?? '').trim();
    if (['Male', 'M', '男', '1'].includes(v)) { return '男'; }
    if (['Female', 'F', '女', '2'].includes(v)) { return '女'; }
    return v;
  }

  private calcAge(birthday?: string): number | null {
    if (!birthday) { return null; }
    const b = new Date(birthday);
    if (Number.isNaN(b.getTime())) { return null; }
    const n = new Date();
    let age = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) { age--; }
    return age >= 0 ? age : null;
  }

  private formatDiagnosis(diagnosis?: string): string {
    if (!diagnosis) { return ''; }
    return diagnosis.split(/[;；,，]/)[0].trim();
  }
}
