/**
 * 成人失禁相关性皮炎(IAD)分类及会阴部皮肤评估护理记录单 —— Angular 组件
 * 访问路径：/form/IADForm
 *
 * A4 横向；行=每条 Score 记录（scoreType=incontinenceScore）
 * 取数/签名/缩放/打印与自杀风险表、肠内营养表保持一致
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

/* ============================= 配置区 ============================= */

const SCORE_TYPE = 'incontinenceScore';
const MEASURE_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

/** IAD 三级描述；数组下标 i 对应 iad 值 = i + 1（0级=1、1级=2、2级=3） */
const IAD_LEVELS = [
  { label: '0级', desc: '无IAD：皮肤完好、无发红' },
  { label: '1级', desc: '轻度IAD：皮肤发红' },
  { label: '2级', desc: '中重度IAD：皮肤发红、破损、水疱、大疱、皮肤摩擦、脱皮、感染' },
];

/** PAT 评分标准（分值 3/2/1 各列描述） */
const PAT_ROWS = [
  { score: 3, irritant: '水样便有或伴随尿液', time: '护理垫更换频率：至少每2小时更换', perineum: '脱皮/腐蚀（有或无皮肤）', influence: '影响因素≥3个' },
  { score: 2, irritant: '软便有或伴随尿液',   time: '至少每4小时更换',              perineum: '红斑/皮肤（有或无念珠菌感染）', influence: '影响因素：2个' },
  { score: 1, irritant: '成形便有或伴随尿液', time: '至少每8小时更换',              perineum: '干净无损伤',            influence: '影响因素≤1个' },
];

/** 护理措施 A~I 全文（备注区展示） */
const MEASURE_LEGEND = [
  'A. 及时清洁大便和/或尿液污染的会阴部及周围皱褶处皮肤。',
  'B. 选用温和、无刺激的弱酸性或中性皮肤清洗液。',
  'C. 使用柔软、无刺激性的湿巾或毛巾按压式清洁皮肤。',
  'D. 使用一次性高吸收性护理用品，污染或潮湿后及时更换。',
  'E. 使用收集袋和/或引流装置管理粪便和/或尿液。',
  'F. 使用皮肤保护用品或水胶体敷料隔离潮湿和刺激物，范围大于粪便和/或尿液接触的皮肤，避免使用刺激性的皮肤保护用品。',
  'G. 使用保湿剂护理干燥皮肤。',
  'H. 根据皮肤破损面积和渗液量选用皮肤保护粉、水胶体敷料、泡沫敷料、藻酸盐敷料、亲水纤维敷料。',
  'I. 对于皮肤感染的患者，按医嘱外用抗感染药物或抗感染敷料，避免使用水胶体、泡沫类密闭、半密闭敷料。',
];

/* ============================= 数据模型 ============================= */

interface NurseMeasure { code?: string; value?: boolean; }
interface IncontinenceScore {
  iad?: number;
  irritantType?: number;
  stimulationTime?: number;
  perineum?: number;
  influenceFactor?: number;
}
interface ScoreRecord {
  _id?: string;
  pid?: string;
  time?: string;
  scoreType?: string;
  total?: number;
  conclusion?: string;
  valid?: boolean;
  inputUserId?: string;
  inputUser?: string;
  nurseMeasureList?: NurseMeasure[];
  incontinenceScore?: IncontinenceScore;
}

interface IadRow {
  time: string;
  iad: number | null;
  irritantType: number | null;
  stimulationTime: number | null;
  perineum: number | null;
  influenceFactor: number | null;
  total: number | null;
  conclusion: string;
  measures: string[];
  signUserId?: string;
  signName?: string;
}

interface RenderPage { index: number; rows: IadRow[]; }

@Component({
  standalone: false,
  selector: 'app-iad-score',
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

    <ng-container *ngFor="let page of pages">
      <div class="sheet" *ngIf="selectedPage === null || selectedPage === page.index">
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}成人失禁相关性皮炎分类及会阴部皮肤评估护理记录单</div>
        </div>

        <div class="patient-info-row">
          <span class="info-item"><b>科室：</b>{{deptName}}</span>
          <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
          <span class="info-item"><b>床号：</b>{{patient?.hisBed || ''}}</span>
          <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
          <span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
          <span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
          <span class="info-item diagnosis-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
        </div>

        <table class="record-table">
          <thead>
            <tr>
              <th class="date-col" rowspan="2">日期时间</th>
              <th colspan="3">IAD分类</th>
              <th colspan="5">会阴部皮肤状况评估量表（PAT）</th>
              <th class="total-col" rowspan="2">总分</th>
              <th class="measure-col" rowspan="2">护理措施</th>
              <th class="sign-col" rowspan="2">签名</th>
            </tr>
            <tr>
              <th class="iad-col">0级</th>
              <th class="iad-col">1级</th>
              <th class="iad-col">2级</th>
              <th class="pt-score-col">分值</th>
              <th>刺激物强度</th>
              <th>刺激物持续时间</th>
              <th>会阴部皮肤情况</th>
              <th>相关影响因素</th>
            </tr>
          </thead>
          <tbody>
            <!-- 评分标准图例（固定 3 行） -->
            <tr class="legend-row">
              <td class="legend-label" rowspan="3">评分<br>标准</td>
              <td class="legend-desc" rowspan="3">{{IAD_LEVELS[0].desc}}</td>
              <td class="legend-desc" rowspan="3">{{IAD_LEVELS[1].desc}}</td>
              <td class="legend-desc" rowspan="3">{{IAD_LEVELS[2].desc}}</td>
              <td>{{PAT_ROWS[0].score}}</td>
              <td class="legend-desc">{{PAT_ROWS[0].irritant}}</td>
              <td class="legend-desc">{{PAT_ROWS[0].time}}</td>
              <td class="legend-desc">{{PAT_ROWS[0].perineum}}</td>
              <td class="legend-desc">{{PAT_ROWS[0].influence}}</td>
              <td class="legend-blank" rowspan="3"></td>
              <td class="legend-blank" rowspan="3"></td>
              <td class="legend-blank" rowspan="3"></td>
            </tr>
            <tr class="legend-row">
              <td>{{PAT_ROWS[1].score}}</td>
              <td class="legend-desc">{{PAT_ROWS[1].irritant}}</td>
              <td class="legend-desc">{{PAT_ROWS[1].time}}</td>
              <td class="legend-desc">{{PAT_ROWS[1].perineum}}</td>
              <td class="legend-desc">{{PAT_ROWS[1].influence}}</td>
            </tr>
            <tr class="legend-row">
              <td>{{PAT_ROWS[2].score}}</td>
              <td class="legend-desc">{{PAT_ROWS[2].irritant}}</td>
              <td class="legend-desc">{{PAT_ROWS[2].time}}</td>
              <td class="legend-desc">{{PAT_ROWS[2].perineum}}</td>
              <td class="legend-desc">{{PAT_ROWS[2].influence}}</td>
            </tr>

            <!-- 数据行：一条记录一行 -->
            <tr *ngFor="let r of pagePaddedRows(page)">
              <td class="date-cell">
                <div class="dt-date">{{ r ? fmtDate(r.time) : '' }}</div>
                <div class="dt-time">{{ r ? fmtTime(r.time) : '' }}</div>
              </td>
              <td>{{ iadCheck(r, 1) }}</td>
              <td>{{ iadCheck(r, 2) }}</td>
              <td>{{ iadCheck(r, 3) }}</td>
              <td></td>
              <td>{{ r && r.irritantType !== null ? r.irritantType : '' }}</td>
              <td>{{ r && r.stimulationTime !== null ? r.stimulationTime : '' }}</td>
              <td>{{ r && r.perineum !== null ? r.perineum : '' }}</td>
              <td>{{ r && r.influenceFactor !== null ? r.influenceFactor : '' }}</td>
              <td>{{ r && r.total !== null ? r.total : '' }}</td>
              <td>{{ r ? r.measures.join('、') : '' }}</td>
              <td>{{ r ? (r.signName || '') : '' }}</td>
            </tr>

            <!-- 备注：表格内跨整行，左对齐 -->
            <tr>
              <td class="footnote-cell" [attr.colspan]="12">
                <div class="fn">备注：</div>
                <div class="fn">1、IAD分类：对应栏内打"√"；IAD 0级患者每日评估1次，1级、2级患者每日评估2次。</div>
                <div class="fn">2、PAT量表采用 Likert 3 点计分法，各部分评分最佳至最差为 1~3 分；总分 4~12 分，4~6 分为低风险，7~12 分为高风险。</div>
                <div class="fn">3、相关影响因素包括：低蛋白、使用抗生素、管饲饮食、失禁保护材料、其他。</div>
                <div class="fn">4、护理措施：</div>
                <div class="fn" *ngFor="let m of MEASURE_LEGEND">{{ m }}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto; --fz-h2:26px; --fz-xs4:15px; --font-hei:'SimHei','黑体',sans-serif; --font-song:'SimSun','宋体',serif; }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:var(--font-song); }

    .sheet { box-sizing:border-box; width:297mm; min-height:210mm; margin:16px auto; padding:10mm 12mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:var(--font-hei); font-weight:700; font-size:var(--fz-h2); line-height:1.4; }

    .patient-info-row { display:flex; align-items:center; width:100%; gap:16px; font-family:var(--font-song); font-size:var(--fz-xs4); white-space:nowrap; margin:6px 0; }
    .info-item { flex:0 0 auto; white-space:nowrap; }
    .info-item b { font-weight:700; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }

    .record-table { width:100%; border-collapse:collapse; font-family:var(--font-song); font-size:12px; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:3px 2px; word-break:break-all; height:30px; vertical-align:middle; }
    .record-table th { background:transparent; font-weight:700; }
    .date-col { width:70px; }
    .iad-col { width:120px; }
    .pt-score-col { width:34px; }
    .total-col { width:44px; }
    .measure-col { width:96px; }
    .sign-col { width:60px; }

    /* 图例 */
    .legend-row td { font-size:12px; }
    .legend-label { font-weight:700; }
    .legend-desc { text-align:left; padding-left:5px; line-height:1.35; }
    .legend-blank { background:#f7f7f7; }

    /* 日期两行 */
    .dt-date,.dt-time { display:block; white-space:nowrap; line-height:1.25; }

    /* 备注：表格内跨整行，左对齐（用 td.footnote-cell 提高优先级压过全局居中） */
    .record-table td.footnote-cell { text-align:left; vertical-align:top; padding:6px 8px; font-family:var(--font-song); font-size:12px; line-height:1.5; font-weight:normal; word-break:break-all; }
    .footnote-cell .fn { padding-left:2em; text-indent:-2em; margin:1px 0; }

    .sheet-pageno { margin-top:4px; text-align:center; font-size:var(--fz-xs4); font-family:var(--font-song); }
    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print {
      :host { height:auto; overflow:visible; }
      .no-print { display:none !important; }
      .sheet { width:297mm; height:210mm; overflow:hidden; margin:0; box-shadow:none; zoom:1; page-break-after:always; }
      .sheet:last-of-type { page-break-after:auto; }
    }
  `],
})
export class IadScoreComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  // 供模板引用
  readonly IAD_LEVELS = IAD_LEVELS;
  readonly PAT_ROWS = PAT_ROWS;
  readonly MEASURE_LEGEND = MEASURE_LEGEND;

  loading = true;
  patient: any = null;
  deptName = '重症医学科';
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';
  age: number | null = null;

  records: ScoreRecord[] = [];
  rows: IadRow[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  readonly rowsPerPage = 12;
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
        this.age = this.calcAge(p.birthday);
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

  private resetForm(): void {
    this.records = [];
    this.rows = [];
    this.pages = [];
    this.selectedPage = null;
    this.diagnosisDisplay = '';
    this.age = null;
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
          this.buildRows();
        }),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      );
  }

  private buildRows(): void {
    const rows: IadRow[] = this.records
      .filter(r => !!r.time)
      .map(r => {
        const s = r.incontinenceScore || {};
        return {
          time: r.time!,
          iad: this.num(s.iad),
          irritantType: this.num(s.irritantType),
          stimulationTime: this.num(s.stimulationTime),
          perineum: this.num(s.perineum),
          influenceFactor: this.num(s.influenceFactor),
          total: this.num(r.total),
          conclusion: r.conclusion || '',
          measures: this.parseMeasures(r.nurseMeasureList),
          signUserId: r.inputUserId,
          signName: r.inputUser || '',
        } as IadRow;
      })
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));
    this.rows = rows;

    const userIds = [...new Set(rows.map(r => r.signUserId).filter(Boolean) as string[])];
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
          for (const row of this.rows) {
            if (row.signUserId && nameMap.has(row.signUserId)) {
              row.signName = nameMap.get(row.signUserId) || row.signName;
            }
          }
          this.paginate();
          this.cdr.detectChanges();
        },
        error: () => { this.paginate(); this.cdr.detectChanges(); },
      });
    } else {
      this.paginate();
    }
  }

  /** iad 值命中该列（level=1→0级、2→1级、3→2级）则打√ */
  iadCheck(row: IadRow | null, level: number): string {
    if (!row) return '';
    return row.iad === level ? '√' : '';
  }

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

  /** 返回恰好 rowsPerPage 行，不足用 null 补齐 */
  pagePaddedRows(page: RenderPage): (IadRow | null)[] {
    const result: (IadRow | null)[] = page.rows.slice(0, this.rowsPerPage);
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
      next: (res) => { if (res?.hospitalName) { this.hospitalName = res.hospitalName; this.cdr.detectChanges(); } },
      error: () => {},
    });
  }

  genderText(g?: string): string {
    if (g === 'Male' || g === 'M' || g === '男') return '男';
    if (g === 'Female' || g === 'F' || g === '女') return '女';
    return g || '';
  }

  private calcAge(birthday?: string): number | null {
    if (!birthday) return null;
    const b = new Date(birthday);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
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
    const sheets = this.host.nativeElement.querySelectorAll('.sheet');
    if (!sheets.length) return;
    let body = '';
    sheets.forEach((s: HTMLElement) => {
      const c = s.cloneNode(true) as HTMLElement;
      c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
      c.style.zoom = '1';
      body += c.outerHTML;
    });
    const css = `
      @page { size: A4 landscape; margin:0; }
      html,body{margin:0;padding:0;}
      body{color:#000;font-family:'SimSun','宋体',serif;}
      .sheet{box-sizing:border-box;width:297mm;height:210mm;margin:0;padding:10mm 12mm;overflow:hidden;page-break-after:always;box-shadow:none;}
      .sheet:last-of-type{page-break-after:auto;}
      .sheet-head{text-align:center;padding-bottom:6px;}
      .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:26px;line-height:1.4;}
      .patient-info-row{display:flex;align-items:center;width:100%;gap:16px;font-size:15px;white-space:nowrap;margin:6px 0;}
      .info-item{flex:0 0 auto;white-space:nowrap;}
      .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
      .record-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:3px 2px;height:30px;word-break:break-all;vertical-align:middle;}
      .record-table th{background:transparent;font-weight:700;}
      .date-col{width:70px;} .iad-col{width:120px;} .pt-score-col{width:34px;}
      .total-col{width:44px;} .measure-col{width:96px;} .sign-col{width:60px;}
      .legend-label{font-weight:700;} .legend-desc{text-align:left;padding-left:5px;line-height:1.35;} .legend-blank{background:#f7f7f7;}
      .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.25;}
      .record-table td.footnote-cell{text-align:left;vertical-align:top;padding:6px 8px;font-size:12px;line-height:1.5;font-weight:normal;word-break:break-all;}
      .footnote-cell .fn{padding-left:2em;text-indent:-2em;margin:1px 0;}
      .sheet-pageno{margin-top:4px;text-align:center;font-size:15px;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  fmtDate(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  fmtTime(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getHours())}：${p(d.getMinutes())}`;
  }

  private num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  private ts(v?: string): number {
    const t = v ? new Date(v).getTime() : 0;
    return isNaN(t) ? 0 : t;
  }
}
