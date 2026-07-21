/**
 * 肠内营养耐受性评分表 —— Angular 组件
 * 访问路径：/form/toleranceForm
 *
 * A4 横向；行=评分项（分值×症状 + 汇总行），列=每次评估（Score 记录）
 * 字体/间距/打印/缩放与 YdwzlTemperatureComponent 保持一致
 *
 * 【可扩展】后续新增评估表：复制本文件 → 修改「配置区」(SCORE_TYPE / SCORE_GROUPS / SYMPTOMS)
 * → 在 app.routes.ts、app.module.ts 各加一行即可。
 */

import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

/* ============================= 配置区（新增评估表时改这里） ============================= */

const SCORE_TYPE = 'toleranceScoreV2';
const SCORE_GROUPS = [5, 2, 1, 0]; // 分值分组，从高到低

interface SymptomDef {
  key: 'bellySerious' | 'nausea' | 'diarrhea';
  label: string;
  descs: Record<number, string>; // 各分值对应的症状描述
}

const SYMPTOMS: SymptomDef[] = [
  {
    key: 'bellySerious',
    label: '腹胀/腹痛',
    descs: {
      5: '严重腹胀/腹痛，无法自行缓解或腹内压＞20mmHg',
      2: '感觉明显腹胀、腹痛，会自行缓解或腹内压15~20mmHg',
      1: '轻度',
      0: '无',
    },
  },
  {
    key: 'nausea',
    label: '恶心/呕吐',
    descs: {
      5: '呕吐，需要胃肠减压或胃残余量（GRV）＞500ml',
      2: '恶心呕吐，但不需要胃肠减压或胃残余量＞250ml',
      1: '有轻微恶心，无呕吐',
      0: '无',
    },
  },
  {
    key: 'diarrhea',
    label: '腹泻',
    descs: {
      5: '稀便5次/d，且量≥1500ml',
      2: '稀便＞5次/d，且量500~1500ml',
      1: '3-5次稀便/d，量＜500ml',
      0: '无',
    },
  },
];

/* ============================= 数据模型 ============================= */

interface NurseMeasure { code?: string; value?: boolean; }
interface ToleranceScore {
  nausea?: number;
  diarrhea?: number;
  bellySerious?: number;
  yySpeed?: number | string;
}
interface ScoreRecord {
  _id?: string;
  pid?: string;
  time?: string;
  scoreType?: string;
  total?: number;
  valid?: boolean;
  inputUserId?: string;
  inputUser?: string;
  nurseMeasureList?: NurseMeasure[];
  toleranceScore?: ToleranceScore;
}

interface EvalColumn {
  time: string;
  bellySerious: number | null;
  nausea: number | null;
  diarrhea: number | null;
  total: number | null;
  yySpeed: string;
  measures: string[];
  signUserId?: string;
  signName?: string;
}

interface MatrixRow {
  group: number;
  groupLabel: string;
  rowspan: number; // 该组首行=组内症状数，其余=0（被合并）
  symptomKey: string;
  symptomLabel: string;
  desc: string;
}

interface RenderPage { index: number; cols: EvalColumn[]; }

@Component({
  standalone: false,
  selector: 'app-tolerance-score',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <span class="page-select">页码选择：
          <select [(ngModel)]="selectedPage">
            <option [ngValue]="null">全部</option>
            <option *ngFor="let p of pages" [ngValue]="p.index">第 {{p.index}} 页</option>
          </select>
        </span>
        <button class="btn" (click)="onPrint()">打印</button>
      </div>
    </div>

    <div class="loading" *ngIf="loading">加载中…</div>

    <div class="sheet" *ngFor="let page of pages" [class.sheet-hidden]="selectedPage !== null && selectedPage !== page.index">
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}肠内营养耐受性评分表</div>
        </div>

        <div class="patient-info-row">
          <span class="info-item"><b>病区：</b>{{deptName}}</span>
          <span class="info-item"><b>床号：</b>{{patient?.hisBed || ''}}</span>
          <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
          <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
          <span class="info-item diagnosis-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
        </div>

        <table class="record-table" [style.width.px]="toleranceTableWidth">
          <colgroup>
            <col class="score-col">
            <col class="item-col">
            <col class="desc-col">
            <col class="data-col" *ngFor="let c of pagePaddedCols(page)">
          </colgroup>
          <thead>
            <tr>
              <th class="score-col">分值</th>
              <th class="item-col">项目</th>
              <th class="desc-col">症状/评估时间</th>
              <th class="data-col" *ngFor="let c of pagePaddedCols(page)">
                <div class="dt-date">{{ c ? fmtDate(c.time) : '' }}</div>
                <div class="dt-time">{{ c ? fmtTime(c.time) : '' }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of matrix">
              <td class="score-col" *ngIf="r.rowspan > 0" [attr.rowspan]="r.rowspan">{{r.groupLabel}}</td>
              <td class="item-col">{{r.symptomLabel}}</td>
              <td class="desc-cell">{{r.desc}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ check(c, r.symptomKey, r.group) }}</td>
            </tr>

            <tr>
              <td class="sum-label" colspan="3">总分</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ c && c.total !== null ? c.total : '' }}</td>
            </tr>
            <tr>
              <td class="sum-label" colspan="3">营养泵输入速度（ml/h）</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ c ? c.yySpeed : '' }}</td>
            </tr>
            <tr>
              <td class="measure-label" colspan="3">措施：A：暂停肠内营养  B：减慢速度  C：维持原速度  D：增加速度</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ measureText(c) }}</td>
            </tr>
            <tr>
              <td class="sum-label" colspan="3">评估者签字</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.signName || '') : '' }}</td>
            </tr>
            <!-- 备注行：在 table 内，跨所有列 -->
            <tr>
              <td class="footnote-cell" [attr.colspan]="colsPerPage + 3">
                <div class="fn">总分：0-2分：继续肠内营养，维持原速度或增加速度，对症治疗，每班评估一次<br>3-4分：继续肠内营养，减慢速度，2h后新评估<br>≥5分：暂停肠内营养，重新评估或更换输入途径</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto;     }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:'SimSun', '宋体', serif; }
    .sheet-hidden { display:none; }

    /* A4 横向，与亚低温一致 */
    .sheet { box-sizing:border-box; width:297mm; min-height:210mm; margin:16px auto; padding:10mm 12mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:'SimHei', '黑体', sans-serif; font-weight:700; font-size:24pt; line-height:1.35; }

    .patient-info-row { display:flex; align-items:center; width:100%; gap:18px; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; white-space:nowrap; margin:2px 0; color:#000; }
    .info-item { flex:0 0 auto; white-space:nowrap; }
    .info-item b { font-weight:700; }
    .info-item b, .info-item strong { font-family:inherit; font-size:inherit; font-style:inherit; line-height:inherit; color:inherit; font-weight:700; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }

    .record-table { width:100%; border-collapse:collapse; font-family:'SimSun', '宋体', serif; font-size:9pt; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:4px 3px; word-break:break-all; height:30px; }
    .record-table th { background:transparent; font-weight:700; }
    .record-table th,
    .record-table td { color:#000; }
    .record-table th { font-weight:700; }
    .record-table td { font-weight:400; }
    /* 纵向左侧固定列 + 汇总行左标签:加粗纯黑,与表头统一 */
    .record-table td.score-col,
    .record-table td.item-col,
    .record-table td.desc-cell,
    .record-table td.sum-label,
    .record-table td.measure-label { font-weight:700; color:#000; }
    .score-col { width:58px; }
    .item-col { width:78px; }
    .desc-col, .desc-cell { width:300px; text-align:left; padding-left:6px; }
    .sum-label, .measure-label { text-align:left; padding-left:6px; font-weight:700; }
    .data-col { width:88px; min-width:88px; max-width:88px; }
    .record-table th.data-col,
    .record-table td.data-col { width:88px; min-width:88px; max-width:88px; padding-left:2px; padding-right:2px; white-space:nowrap; word-break:normal; }

    /* 表格内的备注行 */
    .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.25;}

    /* 表格内的备注行 */
    .record-table td.footnote-cell{text-align:left;vertical-align:top;padding:6px 8px;font-family:'SimSun', '宋体', serif;font-size:9.5pt;line-height:1.3;font-weight:400;color:#000;word-break:break-all;margin-bottom:10mm;}
    .footnote-cell .fn{padding-left:3em;text-indent:-3em;}

    .sheet-pageno { position:absolute; left:12mm; right:12mm; bottom:6mm; margin:0; text-align:center; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; line-height:1; color:#000; white-space:nowrap; }
    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print { .no-print { display:none !important; } .sheet-hidden { display:none !important; } }
  `],
})
export class ToleranceScoreComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  loading = true;
  patient: any = null;
  deptName = '重症医学科';
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';

  records: ScoreRecord[] = [];
  columns: EvalColumn[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  readonly matrix: MatrixRow[] = SCORE_GROUPS.flatMap(g =>
    SYMPTOMS.map((s, i) => ({
      group: g,
      groupLabel: `${g}分/项`,
      rowspan: i === 0 ? SYMPTOMS.length : 0,
      symptomKey: s.key,
      symptomLabel: s.label,
      desc: s.descs[g] ?? '',
    })),
  );

  readonly colsPerPage = 6;
  readonly toleranceFixedWidth = 58 + 78 + 300;
  readonly toleranceDataColWidth = 88;
  get toleranceTableWidth(): number { return this.toleranceFixedWidth + this.colsPerPage * this.toleranceDataColWidth; }
  private pid = '';
  private destroy$ = new Subject<void>();
  private ro?: ResizeObserver;
  private __lastPid: string | null = null;

  constructor(
    private http: HttpClient,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef,
  ) {}

  ngOnInit(): void {
    this.loadHospitalName();
    this.hostPatient.patient$.pipe(
      filter(p => !!p),
      map(p => ({ p, pid: String(p.id || '').trim() })),
      filter(({ pid }) => !!pid),
      tap(({ pid }) => { if (pid !== this.__lastPid) this.__lastPid = pid; }),
      distinctUntilChanged((a, b) => a.pid === b.pid),
      tap(({ p, pid }) => {
        this.resetForm();
        this.patient = p;
        this.pid = pid;
        this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis);
      }),
      switchMap(({ pid }) => this.loadFromServer(pid)),
      takeUntil(this.destroy$),
    ).subscribe();
  }

  ngAfterViewInit(): void {
    this.fitScale();
    this.ro = new ResizeObserver(() => this.fitScale());
    this.ro.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.ro?.disconnect();
  }

  /** 切换患者时清空所有界面状态并立即刷新（数据链路可能不在 Angular zone 内） */
  private resetForm(): void {
    this.records = [];
    this.columns = [];
    this.pages = [];
    this.selectedPage = null;
    this.diagnosisDisplay = '';
    this.cdr.detectChanges();
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http
      .get<ScoreRecord[]>(this.API_SCORE, { params: { pid, scoreType: SCORE_TYPE } })
      .pipe(
        tap((res) => {
          const list = Array.isArray(res) ? res : res ? [res as any] : [];
          this.records = list.filter(r => r && r.valid === true && r.scoreType === SCORE_TYPE);
          this.buildColumns();
        }),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      );
  }

  private buildColumns(): void {
    const cols: EvalColumn[] = this.records
      .filter(r => !!r.time)
      .map(r => ({
        time: r.time!,
        bellySerious: this.num(r.toleranceScore?.bellySerious),
        nausea: this.num(r.toleranceScore?.nausea),
        diarrhea: this.num(r.toleranceScore?.diarrhea),
        total: this.num(r.total),
        yySpeed: this.str(r.toleranceScore?.yySpeed),
        measures: this.parseMeasures(r.nurseMeasureList),
        signUserId: r.inputUserId,
        signName: r.inputUser || '',
      }))
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));
    this.columns = cols;

    const userIds = [...new Set(cols.map(c => c.signUserId).filter(Boolean) as string[])];
    if (userIds.length) {
      this.http.get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } }).subscribe({
        next: (accounts) => {
          const nameMap = new Map<string, string>();
          if (Array.isArray(accounts)) {
            for (const a of accounts) {
              const aid = a?._id || a?.id;
              if (aid) nameMap.set(String(aid), a?.trueName || '');
            }
          }
          for (const col of this.columns) {
            if (col.signUserId && nameMap.has(col.signUserId)) {
              col.signName = nameMap.get(col.signUserId) || col.signName;
            }
          }
          this.paginate();
    this.cdr.detectChanges();
          this.cdr.detectChanges();
        },
        error: () => { this.paginate();
    this.cdr.detectChanges(); this.cdr.detectChanges(); },
      });
    } else {
      this.paginate();
    this.cdr.detectChanges();
    }
  }

  /** 某列某症状是否在该分值行打√ */
  check(col: EvalColumn | null, key: string, group: number): string {
    if (!col) return '';
    return (col as any)[key] === group ? '√' : '';
  }

  measureText(col: EvalColumn | null): string {
    return col ? col.measures.join('、') : '';
  }

  private parseMeasures(list?: NurseMeasure[]): string[] {
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const m of list) {
      if (!m || m.value !== true) continue;
      const ch = (m.code || '').trim().charAt(0).toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(ch)) out.push(ch);
    }
    return [...new Set(out)];
  }

private paginate(): void {
    const per = this.colsPerPage;
    const pages: RenderPage[] = [];
    if (!this.columns.length) {
      pages.push({ index: 1, cols: [] });
    } else {
      for (let i = 0; i < this.columns.length; i += per) {
        pages.push({ index: pages.length + 1, cols: this.columns.slice(i, i + per) });
      }
    }
    this.pages = pages;
    if (this.selectedPage !== null && this.selectedPage > pages.length) {
      this.selectedPage = null;
    }
  }

  pagePaddedCols(page: RenderPage): (EvalColumn | null)[] {
    const result: (EvalColumn | null)[] = page.cols.slice(0, this.colsPerPage);
    while (result.length < this.colsPerPage) result.push(null);
    return result;
  }

  private fitScale(): void {
    const SHEET_W = 297 * (96 / 25.4);
    const avail = this.host.nativeElement.clientWidth - 32;
    const scale = Math.min(1, avail / SHEET_W);
    this.host.nativeElement.style.setProperty('--sheet-scale', String(scale));
  }

  private loadHospitalName(): void {
    this.http.get<{ hospitalName: string }>(this.API_HOSPITAL).subscribe({
      next: (res) => { if (res?.hospitalName) { this.hospitalName = res.hospitalName; this.cdr.detectChanges(); } },
      error: () => {},
    });
  }

  private formatDiagnosis(diagnosis?: string): string {
    if (!diagnosis) return '';
    let index = -1;
    const seps = [';', '；', ',', '，'];
    for (const s of seps) {
      const i = diagnosis.indexOf(s);
      if (i >= 0 && (index < 0 || i < index)) index = i;
    }
    return index >= 0 ? diagnosis.substring(0, index).trim() : diagnosis.trim();
  }

  onPrint(): void {
    const allSheets = Array.from(this.host.nativeElement.querySelectorAll('.sheet')) as HTMLElement[];
    if (!allSheets.length) return;
    const selectedPageNumber = this.selectedPage === null || this.selectedPage === undefined ? null : Number(this.selectedPage);
    if (selectedPageNumber !== null && (!Number.isInteger(selectedPageNumber) || selectedPageNumber < 1 || selectedPageNumber > this.pages.length)) {
      alert('选择的打印页码无效'); return;
    }
    let body = '';
    allSheets.forEach((s: HTMLElement, idx: number) => {
      const pageIndex = idx + 1;
      if (selectedPageNumber !== null && pageIndex !== selectedPageNumber) return;
      const c = s.cloneNode(true) as HTMLElement;
      c.classList.remove('sheet-hidden');
      c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
      c.style.zoom = '1'; c.style.transform = 'none';
      body += '<div class="print-page" data-page-index="' + pageIndex + '">' + c.outerHTML + '</div>';
    });
    const css = `
      @page { size: A4 landscape; margin:0; }
      html,body{margin:0;padding:0;}
      body{color:#000;font-family:'SimSun','宋体',serif;}
      .print-page{box-sizing:border-box;width:297mm;height:210mm;margin:0;overflow:hidden;page-break-after:always;background:#fff;}
      .print-page:last-of-type{page-break-after:auto;}
      .sheet{box-sizing:border-box;position:relative;width:297mm;max-width:297mm;height:210mm;max-height:210mm;margin:0;padding:4mm 10mm 12mm;overflow:hidden;box-shadow:none;background:#fff;color:#000;transform:none!important;zoom:1!important;filter:none!important;text-shadow:none!important;}
      .sheet-head{text-align:center;padding-bottom:6px;}
      .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:22pt;line-height:1.35;}
      .patient-info-row{display:flex;align-items:center;width:100%;gap:18px;font-size:12pt;font-weight:400;white-space:nowrap;margin:2px 0;color:#000;}
      .info-item{flex:0 0 auto;white-space:nowrap;}
      .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
      .record-table{width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:4px 3px;height:30px;word-break:break-all;}
      .record-table th{background:transparent;font-weight:700;} .record-table th,.record-table td{color:#000;} .record-table th{font-weight:700;} .record-table td{font-weight:400;}
      .record-table td.score-col,.record-table td.item-col,.record-table td.desc-cell,.record-table td.sum-label,.record-table td.measure-label{font-weight:700;color:#000;}
      .score-col{width:58px;} .item-col{width:78px;} .desc-col,.desc-cell{width:300px;text-align:left;padding-left:6px;}
      .sum-label,.measure-label{text-align:left;padding-left:6px;font-weight:700;}
      .data-col{width:88px;min-width:88px;max-width:88px;}
      .record-table th.data-col,.record-table td.data-col{width:88px;min-width:88px;max-width:88px;padding-left:2px;padding-right:2px;white-space:nowrap;word-break:normal;}
      .dt-date,.dt-time{display:block;white-space:nowrap;text-align:center;line-height:1.2;}
      .record-table td.footnote-cell{text-align:left;vertical-align:top;padding:6px 8px;font-size:8pt;line-height:1.3;margin-bottom:10mm;font-weight:400;color:#000;word-break:break-all;}
      .footnote-cell .fn{padding-left:3em;text-indent:-3em;}
      .sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:4mm;margin:0;text-align:center;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();
    const doPrint = () => {
      const sheets = win.document.querySelectorAll<HTMLElement>('.sheet');
      for (const sheet of Array.from(sheets)) {
        const pn = sheet.querySelector<HTMLElement>('.sheet-pageno');
        if (!pn) { console.error('页码缺失'); }
        if (sheet.scrollWidth > sheet.clientWidth + 1) { console.warn('横向溢出: ' + (sheet.scrollWidth - sheet.clientWidth) + 'px'); }
        if (sheet.scrollHeight > sheet.clientHeight + 1) { console.warn('纵向溢出: ' + (sheet.scrollHeight - sheet.clientHeight) + 'px'); }
      }
      win.focus(); win.print();
    };
    const ready = () => { const doc = win.document as any; if (doc.fonts?.ready) { doc.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); }); } else { requestAnimationFrame(() => requestAnimationFrame(doPrint)); } };
    win.addEventListener('afterprint', () => { try { win.close(); } catch(e) {} });
    if ((win.document as any).readyState === 'complete') { ready(); } else { win.addEventListener('load', ready); }
  }

  fmtDate(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  fmtTime(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  fmtDateTime(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  private str(v: any): string { return v === null || v === undefined ? '' : String(v); }
  private ts(v?: string): number {
    const t = v ? new Date(v).getTime() : 0;
    return isNaN(t) ? 0 : t;
  }
}
