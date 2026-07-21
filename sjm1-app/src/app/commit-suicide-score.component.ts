/**
 * 重钢总医院自杀风险评估表（NGASR）—— Angular 组件
 * 访问路径：/form/commitSuicideForm
 * 字体/间距/打印/缩放/签字逻辑完全复用 ToleranceScoreComponent
 * 布局按 NGASR 纸质表：行=每次评估记录，列=16个风险项 + 总分/风险等级/防范措施/签名
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
import {
  distinctUntilChanged,
  filter,
  finalize,
  map,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

/* ============================= 配置区 ============================= */

const SCORE_TYPE = 'commitSuicideScore';

interface ItemDef {
  key: string;
  label: string;
  score: number;
}

/** 16 个风险项：字段名 → 显示名 + 分值（前 5 项 3 分，后 11 项 1 分） */
const ITEMS: ItemDef[] = [
  { key: 'senseOfDespair',         label: '绝望感',                       score: 3 },
  { key: 'depression',             label: '情绪低落/兴趣丧失/愉快感缺乏',   score: 3 },
  { key: 'suicideAction',          label: '计划采取自杀行动',              score: 3 },
  { key: 'attemptedSuicide',       label: '自杀未遂史',                    score: 3 },
  { key: 'recentRelativeDeath',    label: '近亲人死亡或重要关系丧失',       score: 3 },
  { key: 'victimDelusion',         label: '言语流露自杀企图',              score: 1 },
  { key: 'notInterpersonal',       label: '严重精神问题和/或自杀家族史',    score: 1 },
  { key: 'verbalSuicide',          label: '精神病史',                      score: 1 },
  { key: 'negativeLife',           label: '丧偶',                          score: 1 },
  { key: 'familyHistoryOfSuicide', label: '人际关系',                      score: 1 },
  { key: 'mentalHistory',          label: '近期负性生活事件',              score: 1 },
  { key: 'widow',                  label: '社会-经济地位低下',             score: 1 },
  { key: 'lowStatus',              label: '饮酒史',                        score: 1 },
  { key: 'drinkHistory',           label: '晚期疾病',                      score: 1 },
  { key: 'lateStage',              label: '被害妄想或存在幻听',            score: 1 },
  { key: 'otherSelect',            label: '其他',                          score: 1 },
];

/** 防范措施图注（编码 A~F 取首字母） */
const MEASURE_LEGEND =
  'A：警示标识　B：q1h巡视　C：危险物品检查　D：心理疏导　E：24h留察　F：家属宣教';
const MEASURE_CODES = ['A', 'B', 'C', 'D', 'E', 'F'];

/* ============================= 数据模型 ============================= */

interface NurseMeasure {
  code?: string;
  value?: boolean;
}
interface ScoreRecord {
  _id?: string;
  id?: string;
  pid?: string;
  time?: string;
  scoreType?: string;
  total?: number;
  conclusion?: string;
  valid?: boolean;
  inputUserId?: string;
  inputUser?: string;
  nurseMeasureList?: NurseMeasure[];
  commitSuicideScore?: Record<string, boolean>;
}

interface EvalRow {
  time: string;
  checks: Record<string, boolean>;
  total: number | null;
  risk: string;
  measures: string[];
  signUserId?: string;
  signName?: string;
}

interface RenderPage {
  index: number;
  rows: (EvalRow | null)[];
}

/* ============================= 组件 ============================= */

@Component({
  standalone: false,
  selector: 'app-commit-suicide-score',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <span class="page-select">
          页码选择：
          <select [(ngModel)]="selectedPage">
            <option [ngValue]="null">全部</option>
            <option *ngFor="let p of pages" [ngValue]="p.index">第 {{ p.index }} 页</option>
          </select>
        </span>
        <button class="btn" (click)="onPrint()">打印</button>
      </div>
    </div>

    <div class="loading" *ngIf="loading">加载中…</div>

      <div class="sheet"
           *ngFor="let page of pages" [class.sheet-hidden]="selectedPage !== null && selectedPage !== page.index">
        <div class="sheet-head">
          <div class="title-line">{{ hospitalName }}自杀风险评估表（NGASR）</div>
        </div>

        <div class="patient-info-row">
          <span class="info-item"><b>病区：</b>{{ deptName }}</span>
          <span class="info-item"><b>姓名：</b>{{ patient?.name || '' }}</span>
          <span class="info-item"><b>床号：</b>{{ patient?.hisBed || '' }}</span>
          <span class="info-item"><b>住院号：</b>{{ patient?.mrn || '' }}</span>
          <span class="info-item diagnosis-item"><b>诊断：</b>{{ diagnosisDisplay }}</span>
        </div>

        <table class="record-table">
          <thead>
            <tr>
              <th class="date-col" rowspan="2">日期 时间</th>
              <th class="item-col" *ngFor="let it of items">
                <span class="v-text">{{ it.label }}</span>
              </th>
              <th class="total-col" rowspan="2">总分</th>
              <th class="risk-col" rowspan="2">风险等级</th>
              <th class="measure-col" rowspan="2">防范措施</th>
              <th class="sign-col" rowspan="2">签名</th>
            </tr>
            <tr>
              <th class="score-cell" *ngFor="let it of items">{{ it.score }}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="data-row" *ngFor="let r of pagePaddedRows(page)">
              <td class="date-col">{{ r ? fmtDateTime(r.time) : '' }}</td>
              <td class="check-cell" *ngFor="let it of items">
                {{ r && r.checks[it.key] ? '√' : '' }}
              </td>
              <td class="total-col">{{ r && r.total !== null ? r.total : '' }}</td>
              <td class="risk-col">{{ r ? r.risk : '' }}</td>
              <td class="measure-col">{{ r ? r.measures.join('、') : '' }}</td>
              <td class="sign-col">{{ r ? (r.signName || '') : '' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="footnote">
          <div>防范措施：{{ measureLegend }}</div>
          <div>
            填表说明：0～5 分为低风险，6～8 分为中风险，9～11 分为高风险，≥12 分为极高风险。
            新入院患者应连续评估 3 天，中风险及以上每天评估 1 次；低风险每周评估 1 次，
            病情波动时及时评估，出院前再次评估。
          </div>
        </div>

        <div class="sheet-pageno">第 {{ page.index }} 页 共 {{ pages.length }} 页</div>
      </div>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto; }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:'SimSun','宋体',serif; }
    .sheet-hidden { display:none; }

    .sheet { box-sizing:border-box; width:297mm; min-height:210mm; margin:16px auto; padding:10mm 12mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:'SimHei','黑体',sans-serif; font-weight:700; font-size:24pt; line-height:1.35; }

    .patient-info-row { display:flex; align-items:center; width:100%; gap:18px; font-family:'SimSun','宋体',serif; font-size:13pt; font-weight:400; white-space:nowrap; margin:2px 0; color:#000; }
    .info-item { flex:0 0 auto; white-space:nowrap; }
    .info-item b { font-weight:700; }
    .info-item b, .info-item strong { font-family:inherit; font-size:inherit; font-style:inherit; line-height:inherit; color:inherit; font-weight:700; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }

    .record-table { width:100%; border-collapse:collapse; font-family:'SimSun','宋体',serif; font-size:9pt; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:2px 1px; word-break:break-all; }
    .record-table th { background:transparent; font-weight:700; }
    .record-table td { height:30px; }

    .date-col { width:82px; }
    .item-col { width:auto; height:118px; vertical-align:middle; padding:2px 0; }
    /* 风险项表头竖排，节省横向宽度 */
    .v-text { writing-mode:vertical-rl; text-orientation:upright; letter-spacing:1px; line-height:1.15; display:inline-block; max-height:112px; overflow:hidden; }
    .score-cell { height:18px; font-weight:700; color:#000; }
    .check-cell { font-weight:700; }
    .record-table tr.data-row td { font-weight:400; }
    .total-col { width:34px; }
    .risk-col { width:56px; }
    .measure-col { width:96px; text-align:left; padding-left:4px; }
    .sign-col { width:60px; }

    .footnote { margin-top:6px; margin-bottom:10mm; font-family:'SimSun','宋体',serif; font-size:9.5pt; line-height:1.3; }
    .sheet-pageno { position:absolute; left:12mm; right:12mm; bottom:6mm; margin:0; text-align:center; font-family:'SimSun','宋体',serif; font-size:13pt; font-weight:400; line-height:1; color:#000; white-space:nowrap; }

    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print {
      :host { height:auto; overflow:visible; }
      .no-print { display:none !important; }
      .sheet-hidden { display:none !important; }
      .sheet { width:297mm; height:210mm; overflow:hidden; margin:0; box-shadow:none; zoom:1; page-break-after:always; }
      .sheet:last-of-type { page-break-after:auto; }
    }
  `],
})
export class CommitSuicideScoreComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  loading = true;
  patient: any = null;
  deptName = '重症医学科';
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';

  readonly items = ITEMS;
  readonly measureLegend = MEASURE_LEGEND;

  records: ScoreRecord[] = [];
  rows: EvalRow[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  readonly rowsPerPage = 10;
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
    this.hostPatient.patient$
      .pipe(
        filter((p) => !!p),
        map((p) => ({ p, pid: String(p.id || '').trim() })),
        filter(({ pid }) => !!pid),
        tap(({ pid }) => {
          if (pid !== this.__lastPid) this.__lastPid = pid;
        }),
        distinctUntilChanged((a, b) => a.pid === b.pid),
        tap(({ p, pid }) => {
          this.resetForm();
          this.patient = p;
          this.pid = pid;
          this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis);
        }),
        switchMap(({ pid }) => this.loadFromServer(pid)),
        takeUntil(this.destroy$),
      )
      .subscribe();
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

  private resetForm(): void {
    this.records = [];
    this.rows = [];
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
          this.records = list.filter(
            (r) => r && r.valid === true && r.scoreType === SCORE_TYPE,
          );
          this.buildRows();
        }),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      );
  }

  private buildRows(): void {
    const rows: EvalRow[] = this.records
      .filter((r) => !!r.time)
      .map((r) => {
        const checks = r.commitSuicideScore || {};
        const total = this.resolveTotal(r, checks);
        return {
          time: r.time!,
          checks,
          total,
          risk: (r.conclusion && r.conclusion.trim()) || this.getRisk(total),
          measures: this.parseMeasures(r.nurseMeasureList),
          signUserId: r.inputUserId,
          signName: r.inputUser || '',
        } as EvalRow;
      })
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));
    this.rows = rows;

    const userIds = [
      ...new Set(rows.map((c) => c.signUserId).filter(Boolean) as string[]),
    ];
    if (userIds.length) {
      this.http
        .get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } })
        .subscribe({
          next: (accounts) => {
            const nameMap = new Map<string, string>();
            if (Array.isArray(accounts)) {
              for (const a of accounts) {
                const aid = a?._id || a?.id;
                if (aid) nameMap.set(String(aid), a?.trueName || '');
              }
            }
            for (const row of this.rows) {
              if (row.signUserId && nameMap.has(row.signUserId)) {
                row.signName = nameMap.get(row.signUserId) || row.signName;
              }
            }
            this.paginate();
            this.cdr.detectChanges();
          },
          error: () => {
            this.paginate();
            this.cdr.detectChanges();
          },
        });
    } else {
      this.paginate();
      this.cdr.detectChanges();
    }
  }

  /** 总分：优先取后端 total，缺失时按勾选项累加分值 */
  private resolveTotal(r: ScoreRecord, checks: Record<string, boolean>): number | null {
    if (r.total !== null && r.total !== undefined) {
      const n = Number(r.total);
      if (!isNaN(n)) return n;
    }
    return ITEMS.reduce((sum, it) => sum + (checks[it.key] === true ? it.score : 0), 0);
  }

  /** 0-5 低 / 6-8 中 / 9-11 高 / >=12 极高 */
  private getRisk(total: number | null): string {
    const s = Number(total || 0);
    if (s >= 12) return '极高风险';
    if (s >= 9) return '高风险';
    if (s >= 6) return '中风险';
    return '低风险';
  }

  /** 只取 value===true 的措施，编码取首字母（A~F） */
  private parseMeasures(list?: NurseMeasure[]): string[] {
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const m of list) {
      if (!m || m.value !== true) continue;
      const ch = (m.code || '').trim().charAt(0).toUpperCase();
      if (MEASURE_CODES.includes(ch)) out.push(ch);
    }
    return [...new Set(out)].sort();
  }

private paginate(): void {
    const per = this.rowsPerPage;
    const pages: RenderPage[] = [];
    if (!this.rows.length) {
      pages.push({ index: 1, rows: [] });
    } else {
      for (let i = 0; i < this.rows.length; i += per) {
        pages.push({ index: pages.length + 1, rows: this.rows.slice(i, i + per) });
      }
    }
    this.pages = pages;
    if (this.selectedPage !== null && this.selectedPage > pages.length) {
      this.selectedPage = null;
    }
  }

  /** 每页补空行，保证表格高度稳定 */
  pagePaddedRows(page: RenderPage): (EvalRow | null)[] {
    const result: (EvalRow | null)[] = page.rows.slice(0, this.rowsPerPage);
    while (result.length < this.rowsPerPage) result.push(null);
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
      next: (res) => {
        if (res?.hospitalName) {
          this.hospitalName = res.hospitalName;
          this.cdr.detectChanges();
        }
      },
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
      // idx 0 = page 1, idx 1 = page 2, etc.
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
      .sheet{box-sizing:border-box;position:relative;width:297mm;height:210mm;margin:0;padding:4mm 10mm 12mm;overflow:hidden;box-shadow:none;background:#fff;color:#000;transform:none!important;zoom:1!important;filter:none!important;text-shadow:none!important;}
      .sheet-head{text-align:center;padding-bottom:6px;}
      .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:22pt;line-height:1.35;}
      .patient-info-row{display:flex;align-items:center;width:100%;gap:18px;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;white-space:nowrap;margin:2px 0;color:#000;}
      .info-item{flex:0 0 auto;white-space:nowrap;}
      .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
      .record-table{width:100%;border-collapse:collapse;font-family:'SimSun','宋体',serif;font-size:9pt;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:2px 1px;word-break:break-all;}
      .record-table td{height:30px;}
      .date-col{width:82px;} .item-col{width:auto;height:118px;}
      .v-text{writing-mode:vertical-rl;text-orientation:upright;letter-spacing:1px;line-height:1.15;display:inline-block;max-height:112px;overflow:hidden;}
      .score-cell{height:18px;font-weight:700;color:#000;} .record-table tr.data-row td{font-weight:400;}
      .check-cell{font-weight:700;}
      .total-col{width:34px;} .risk-col{width:56px;}
      .measure-col{width:96px;text-align:left;padding-left:4px;} .sign-col{width:60px;}
      .footnote{margin-top:6px;margin-bottom:10mm;font-family:'SimSun','宋体',serif;font-size:8pt;line-height:1.3;}
      .sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:4mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) {
      alert('打印窗口被拦截，请允许弹出窗口');
      return;
    }
    win.document.write('<html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + body + '</body></html>');
    win.document.close();
    win.focus();
    const doPrint = () => { win.focus(); win.print(); };
    const ready = () => { const doc = win.document as any; if (doc.fonts?.ready) { doc.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); }); } else { requestAnimationFrame(() => requestAnimationFrame(doPrint)); } };
    win.addEventListener('afterprint', () => { try { win.close(); } catch(e) {} });
    if ((win.document as any).readyState === 'complete') { ready(); } else { win.addEventListener('load', ready); }
  }

  fmtDateTime(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  private ts(v?: string): number {
    const t = v ? new Date(v).getTime() : 0;
    return isNaN(t) ? 0 : t;
  }
}
