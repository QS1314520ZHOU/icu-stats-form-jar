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
import { databaseTimeValue, formatShanghaiDate, formatShanghaiTime } from './form-date.util';

/* ============================= 配置区 ============================= */

const SCORE_TYPE = 'incontinenceScore';
const MEASURE_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

/** IAD 三级描述；数组下标 i 对应 iad 值 = i + 1（0级=1、1级=2、2级=3） */
const IAD_LEVELS = [
  { label: '0级', desc: '无IAD：皮肤完好、无发红' },
  { label: '1级', desc: '轻度IAD：皮肤完整、发红；红斑、水肿' },
  { label: '2级', desc: '中重度IAD：皮肤发红、破损；水泡、大疱、皮肤糜烂、剥脱、感染' },
];

/** PAT 评分标准（分值 3/2/1 各列描述） */
const PAT_ROWS = [
  { score: 3, irritant: '水样便有或伴随尿液', time: '护理垫更换频率：至少每2小时更换', perineum: '脱皮/腐蚀（有或无皮炎）', influence: '影响因素≥3个' },
  { score: 2, irritant: '软便有或伴随尿液',   time: '护理垫更换频率：至少每4小时更换', perineum: '红斑/皮肤（有或无念珠菌感染）', influence: '影响因素：2个' },
  { score: 1, irritant: '成形便有或伴随尿液', time: '护理垫更换频率：至少每8小时更换', perineum: '干净无损伤', influence: '影响因素≤1个' },
];

/** 护理措施 A~I 全文（备注区展示） */
const MEASURE_LEGEND = [
  'A. 及时清洁有粪便和/或尿液污染的会阴部及周围皱褶处皮肤。',
  'B. 选用温和、无刺激的弱酸性或中性皮肤清洗液。',
  'C. 使用柔软、无刺激性的湿巾或布类按压式清洁皮肤。',
  'D. 使用一次性高吸收性护理用品，污染或潮湿应及时更换。',
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
          <span class="info-item"><b>病区：</b>{{deptName}}</span>
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
              <th class="date-col" rowspan="5">日期时间</th>
              <th colspan="3">IAD分类</th>
              <th colspan="5">会阴部皮肤状况评估量表（PAT）</th>
              <th class="total-col" rowspan="5">总分</th>
              <th class="measure-col" rowspan="5">护理措施</th>
              <th class="sign-col" rowspan="5">签名</th>
            </tr>
            <tr>
              <th class="iad-sub">0级</th>
              <th class="iad-sub">1级</th>
              <th class="iad-sub">2级</th>
              <th class="pt-score-col">分值</th>
              <th>刺激物强度</th>
              <th>刺激物持续时间</th>
              <th>会阴部皮肤情况</th>
              <th>相关影响因素</th>
            </tr>
            <tr class="legend-row">
              <td class="legend-desc" rowspan="3">{{ IAD_LEVELS[0].desc }}</td>
              <td class="legend-desc" rowspan="3">{{ IAD_LEVELS[1].desc }}</td>
              <td class="legend-desc" rowspan="3">{{ IAD_LEVELS[2].desc }}</td>
              <td class="pt-score-col">{{ PAT_ROWS[0].score }}</td>
              <td class="legend-desc">{{ PAT_ROWS[0].irritant }}</td>
              <td class="legend-desc">{{ PAT_ROWS[0].time }}</td>
              <td class="legend-desc">{{ PAT_ROWS[0].perineum }}</td>
              <td class="legend-desc">{{ PAT_ROWS[0].influence }}</td>
            </tr>
            <tr class="legend-row">
              <td class="pt-score-col">{{ PAT_ROWS[1].score }}</td>
              <td class="legend-desc">{{ PAT_ROWS[1].irritant }}</td>
              <td class="legend-desc">{{ PAT_ROWS[1].time }}</td>
              <td class="legend-desc">{{ PAT_ROWS[1].perineum }}</td>
              <td class="legend-desc">{{ PAT_ROWS[1].influence }}</td>
            </tr>
            <tr class="legend-row">
              <td class="pt-score-col">{{ PAT_ROWS[2].score }}</td>
              <td class="legend-desc">{{ PAT_ROWS[2].irritant }}</td>
              <td class="legend-desc">{{ PAT_ROWS[2].time }}</td>
              <td class="legend-desc">{{ PAT_ROWS[2].perineum }}</td>
              <td class="legend-desc">{{ PAT_ROWS[2].influence }}</td>
            </tr>
          </thead>
          <tbody>
            <tr class="data-row" *ngFor="let r of pagePaddedRows(page)">
              <td class="date-cell">
                <span class="dt-date">{{ r ? fmtDate(r.time) : '' }}</span>
                <span class="dt-time">{{ r ? fmtTime(r.time) : '' }}</span>
              </td>
              <td>{{ r ? iadCheck(r, 1) : '' }}</td>
              <td>{{ r ? iadCheck(r, 2) : '' }}</td>
              <td>{{ r ? iadCheck(r, 3) : '' }}</td>
              <td class="pt-score-col"></td>
              <td>{{ r && r.irritantType !== null ? r.irritantType : '' }}</td>
              <td>{{ r && r.stimulationTime !== null ? r.stimulationTime : '' }}</td>
              <td>{{ r && r.perineum !== null ? r.perineum : '' }}</td>
              <td>{{ r && r.influenceFactor !== null ? r.influenceFactor : '' }}</td>
              <td class="total-col">{{ r && r.total !== null ? r.total : '' }}</td>
              <td class="measure-col">{{ r ? r.measures.join('、') : '' }}</td>
              <td class="sign-col">{{ r ? (r.signName || '') : '' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="iad-footnote">
          <div class="footnote-title">备注：</div>
          <div class="fn">1、IAD分类：对应栏内打"√"；IAD 0级患者，每日评估1次，对于1级、2级患者，每日评估2次。</div>
          <div class="fn">2、PAT量表采用 Likert 3 点计分法，各部分评分最佳至最差为 1~3 分；总分 4~12 分，4~6 分为低风险，7~12 分为高风险。</div>
          <div class="fn">3、PAT量表中相关影响因素有：低蛋白、使用抗生素、管饲饮食、艰难梭状芽孢杆菌、其他。</div>
          <div class="fn">4、护理措施：</div>
          <div class="fn" *ngFor="let m of MEASURE_LEGEND">{{ m }}</div>
        </div>

        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
    </ng-container>

    <!-- Hidden print source: 10 rows per page, off-screen, NOT visible -->
    <div class="print-source" aria-hidden="true">
      <section class="print-page" *ngFor="let page of pages" [attr.data-page-index]="page.index">
        <div class="sheet">
          <div class="sheet-head">
            <div class="title-line">{{hospitalName}}成人失禁相关性皮炎分类及会阴部皮肤评估护理记录单</div>
          </div>
          <div class="patient-info-row">
            <span class="info-item"><b>病区：</b>{{deptName}}</span>
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
                <th class="date-col" rowspan="5">日期时间</th>
                <th colspan="3">IAD分类</th>
                <th colspan="5">会阴部皮肤状况评估量表（PAT）</th>
                <th class="total-col" rowspan="5">总分</th>
                <th class="measure-col" rowspan="5">护理措施</th>
                <th class="sign-col" rowspan="5">签名</th>
              </tr>
              <tr>
                <th class="iad-sub">0级</th>
                <th class="iad-sub">1级</th>
                <th class="iad-sub">2级</th>
                <th class="pt-score-col">分值</th>
                <th>刺激物强度</th>
                <th>刺激物持续时间</th>
                <th>会阴部皮肤情况</th>
                <th>相关影响因素</th>
              </tr>
              <tr class="legend-row">
                <td class="legend-desc" rowspan="3">{{ IAD_LEVELS[0].desc }}</td>
                <td class="legend-desc" rowspan="3">{{ IAD_LEVELS[1].desc }}</td>
                <td class="legend-desc" rowspan="3">{{ IAD_LEVELS[2].desc }}</td>
                <td class="pt-score-col">{{ PAT_ROWS[0].score }}</td>
                <td class="legend-desc">{{ PAT_ROWS[0].irritant }}</td>
                <td class="legend-desc">{{ PAT_ROWS[0].time }}</td>
                <td class="legend-desc">{{ PAT_ROWS[0].perineum }}</td>
                <td class="legend-desc">{{ PAT_ROWS[0].influence }}</td>
              </tr>
              <tr class="legend-row">
                <td class="pt-score-col">{{ PAT_ROWS[1].score }}</td>
                <td class="legend-desc">{{ PAT_ROWS[1].irritant }}</td>
                <td class="legend-desc">{{ PAT_ROWS[1].time }}</td>
                <td class="legend-desc">{{ PAT_ROWS[1].perineum }}</td>
                <td class="legend-desc">{{ PAT_ROWS[1].influence }}</td>
              </tr>
              <tr class="legend-row">
                <td class="pt-score-col">{{ PAT_ROWS[2].score }}</td>
                <td class="legend-desc">{{ PAT_ROWS[2].irritant }}</td>
                <td class="legend-desc">{{ PAT_ROWS[2].time }}</td>
                <td class="legend-desc">{{ PAT_ROWS[2].perineum }}</td>
                <td class="legend-desc">{{ PAT_ROWS[2].influence }}</td>
              </tr>
            </thead>
            <tbody>
              <tr class="data-row" *ngFor="let r of pagePaddedRows(page)">
                <td class="date-cell">
                  <span class="dt-date">{{ r ? fmtDate(r.time) : '' }}</span>
                  <span class="dt-time">{{ r ? fmtTime(r.time) : '' }}</span>
                </td>
                <td>{{ r ? iadCheck(r, 1) : '' }}</td>
                <td>{{ r ? iadCheck(r, 2) : '' }}</td>
                <td>{{ r ? iadCheck(r, 3) : '' }}</td>
                <td class="pt-score-col"></td>
                <td>{{ r && r.irritantType !== null ? r.irritantType : '' }}</td>
                <td>{{ r && r.stimulationTime !== null ? r.stimulationTime : '' }}</td>
                <td>{{ r && r.perineum !== null ? r.perineum : '' }}</td>
                <td>{{ r && r.influenceFactor !== null ? r.influenceFactor : '' }}</td>
                <td class="total-col">{{ r && r.total !== null ? r.total : '' }}</td>
                <td class="measure-col">{{ r ? r.measures.join('、') : '' }}</td>
                <td class="sign-col">{{ r ? (r.signName || '') : '' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="iad-footnote">
            <div class="footnote-title">备注：</div>
            <div class="fn">1、IAD分类：对应栏内打"√"；IAD 0级患者，每日评估1次，对于1级、2级患者，每日评估2次。</div>
            <div class="fn">2、PAT量表采用 Likert 3 点计分法，各部分评分最佳至最差为 1~3 分；总分 4~12 分，4~6 分为低风险，7~12 分为高风险。</div>
            <div class="fn">3、PAT量表中相关影响因素有：低蛋白、使用抗生素、管饲饮食、艰难梭状芽孢杆菌、其他。</div>
            <div class="fn">4、护理措施：</div>
            <div class="fn" *ngFor="let m of MEASURE_LEGEND">{{ m }}</div>
          </div>
          <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto; }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:'SimSun','宋体',serif; }

    .sheet { box-sizing:border-box; width:397mm; min-height:210mm; margin:16px auto; padding:10mm 12mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:2px; }
    .title-line { font-family:'SimHei','黑体',sans-serif; font-weight:700; font-size:24pt; line-height:1.35; }

    .patient-info-row { display:flex; align-items:center; width:100%; gap:16px; font-family:'SimSun','宋体',serif; font-size:13pt; font-weight:400; white-space:nowrap; margin:2px 0; color:#000; }
    .patient-info-row b,
    .patient-info-row strong { font-family:inherit; font-size:inherit; font-style:inherit; line-height:inherit; color:inherit; font-weight:700; }
    .info-item { flex:0 0 auto; white-space:nowrap; font-family:inherit; font-size:inherit; font-weight:inherit; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; font-family:inherit; font-size:inherit; font-weight:inherit; }

    .record-table { width:100%; border-collapse:collapse; font-family:'SimSun','宋体',serif; font-size:10.5pt; table-layout:fixed; color:#000; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:3px 2px; min-height:32px; height:32px; vertical-align:middle; color:#000; }
    .record-table th { background:transparent; font-weight:700; line-height:1.3; }
    .record-table td,
    .record-table tr.data-row td { font-weight:400; }
    .date-col { width:88px; }
    .iad-sub { width:auto; }
    .pt-score-col { width:34px; }
    .total-col { width:44px; }
    .measure-col { width:96px; }
    .sign-col { width:60px; }

    /* 图例 */
    .legend-row td { font-size:10.5pt; font-weight:700; color:#000; }
    .legend-label { font-weight:700; }
    .legend-desc { text-align:left; padding-left:5px; line-height:1.35; }
    .legend-blank { background:#f7f7f7; }

    /* 日期两行 */
    .dt-date,.dt-time { display:block; white-space:nowrap; line-height:1.25; }

    /* 备注：独立于表格之外，底部留空给页码 */
    .iad-footnote { box-sizing:border-box; width:100%; margin-top:2px; margin-bottom:6mm; padding:0 2px; font-family:'SimSun','宋体',serif; font-size:9.5pt; font-weight:400; line-height:1.3; color:#000; text-align:left; }
    .iad-footnote .footnote-title { font-weight:700; }
    .iad-footnote .fn { margin:0; padding-left:2em; text-indent:-2em; }

    .sheet-pageno { position:absolute; left:12mm; right:12mm; bottom:6mm; margin:0; text-align:center; font-family:'SimSun','宋体',serif; font-size:13pt; font-weight:400; line-height:1; color:#000; white-space:nowrap; }

    /* Hidden print source: off-screen, invisible, no interaction */
    .print-source { position:fixed; left:-100000px; top:0; width:297mm; visibility:hidden; pointer-events:none; }

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

  readonly maxRowsPerPage = 9;
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

  /** 通用分页 */
  private buildPages(rows: IadRow[], perPage: number): RenderPage[] {
    if (!rows.length) return [{ index: 1, rows: [] }];
    const result: RenderPage[] = [];
    for (let i = 0; i < rows.length; i += perPage) {
      result.push({ index: result.length + 1, rows: rows.slice(i, i + perPage) });
    }
    return result;
  }

  private paginate(): void {
    this.pages = this.buildPages(this.rows, this.maxRowsPerPage);
    if (this.selectedPage !== null && this.selectedPage > this.pages.length) {
      this.selectedPage = null;
    }
  }

  pagePaddedRows(page: RenderPage): (IadRow | null)[] {
    const result: (IadRow | null)[] = page.rows.slice(0, this.maxRowsPerPage);
    while (result.length < this.maxRowsPerPage) result.push(null);
    return result;
  }

  private fitScale(): void {
    const SHEET_W = 397 * (96 / 25.4);
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
    const allPrintPages = Array.from(
      this.host.nativeElement.querySelectorAll('.print-source .print-page')
    ) as HTMLElement[];
    if (!allPrintPages.length) return;

    // Validate and normalize selectedPage
    const selectedPageNumber =
      this.selectedPage === null || this.selectedPage === undefined
        ? null
        : Number(this.selectedPage);
    if (
      selectedPageNumber !== null &&
      (!Number.isInteger(selectedPageNumber) ||
        selectedPageNumber < 1 ||
        selectedPageNumber > this.pages.length)
    ) {
      alert('选择的打印页码无效');
      return;
    }

    // Filter pages by selectedPage
    const pagesToPrint: HTMLElement[] =
      selectedPageNumber === null
        ? allPrintPages
        : allPrintPages.filter((page: HTMLElement) => {
            return Number(page.dataset['pageIndex']) === selectedPageNumber;
          });
    if (!pagesToPrint.length) {
      alert(
        selectedPageNumber === null
          ? '没有可打印的页面'
          : '没有找到第' + selectedPageNumber + '页'
      );
      return;
    }

    let body = '';
    pagesToPrint.forEach((pg: HTMLElement) => {
      const c = pg.cloneNode(true) as HTMLElement;
      c.style.visibility = 'visible';
      c.removeAttribute('aria-hidden');
      c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
      body += c.outerHTML;
    });

    const css = `
      @page { size: A4 landscape; margin:0; }
      html,body{margin:0;padding:0;background:#fff;}
      body{color:#000;font-family:'SimSun','宋体',serif;}
      .print-page{box-sizing:border-box;width:297mm;height:210mm;margin:0;padding:0;overflow:hidden;break-after:page;page-break-after:always;background:#fff;}
      .print-page:last-child{break-after:auto;page-break-after:auto;}
      .sheet{box-sizing:border-box;position:relative;width:297mm;height:210mm;margin:0;padding:4mm 10mm 12mm;overflow:hidden;box-shadow:none;background:#fff;color:#000;transform:none !important;zoom:1 !important;filter:none !important;text-shadow:none !important;}
      .sheet-head{text-align:center;padding-bottom:2px;}
      .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:22pt;line-height:1.35;}
      .patient-info-row{display:flex;align-items:center;width:100%;gap:12px;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;white-space:nowrap;margin:2px 0;color:#000;}
      .patient-info-row b,.patient-info-row strong{font-family:inherit;font-size:inherit;font-style:inherit;line-height:inherit;color:inherit;font-weight:700;}
      .info-item{flex:0 0 auto;white-space:nowrap;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;}
      .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;}
      .record-table{width:100%;border-collapse:collapse;font-family:'SimSun','宋体',serif;font-size:8.5pt;table-layout:fixed;color:#000;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:2px 1px;height:28px;word-break:break-all;vertical-align:middle;color:#000;}
      .record-table th{background:transparent;font-weight:700;line-height:1.25;}
      .record-table td,.record-table tr.data-row td{font-weight:400;}
      .legend-row td{font-weight:700;color:#000;font-size:8.5pt;}
      .date-col{width:80px;} .iad-sub{width:auto;} .pt-score-col{width:28px;}
      .total-col{width:36px;} .measure-col{width:76px;} .sign-col{width:48px;}
      .legend-label{font-weight:700;} .legend-desc{text-align:left;padding-left:3px;line-height:1.25;} .legend-blank{background:#f7f7f7;}
      .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.2;}
      .iad-footnote{box-sizing:border-box;width:100%;margin-top:2px;margin-bottom:6mm;padding:0 2px;font-family:'SimSun','宋体',serif;font-size:8pt;font-weight:400;line-height:1.3;color:#000;text-align:left;}
      .iad-footnote .footnote-title{font-weight:700;}
      .iad-footnote .fn{margin:0;padding-left:2em;text-indent:-2em;}
      .sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:6mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + body + '</body></html>');
    win.document.close();

    const doPrint = () => {
      const printPages = win.document.querySelectorAll<HTMLElement>('.print-page');
      for (const printPage of Array.from(printPages)) {
        const sheet = printPage.querySelector<HTMLElement>('.sheet');
        const footnote = printPage.querySelector<HTMLElement>('.iad-footnote');
        const pageNumber = printPage.querySelector<HTMLElement>('.sheet-pageno');
        if (!sheet || !pageNumber) {
          console.error('IAD print page missing sheet or page number');
          continue;
        }
        const sheetRect = sheet.getBoundingClientRect();
        const pnRect = pageNumber.getBoundingClientRect();
        if (pnRect.top < sheetRect.top || pnRect.bottom > sheetRect.bottom) {
          console.error('IAD page number outside A4 page', { pnRect, sheetRect });
        }
        if (footnote) {
          const fnRect = footnote.getBoundingClientRect();
          if (fnRect.bottom > pnRect.top) {
            console.error('IAD footnote overlaps page number', { fnBottom: fnRect.bottom, pnTop: pnRect.top });
          }
        }
        const overflow = sheet.scrollHeight - sheet.clientHeight;
        console.log('IAD print page:', { scrollHeight: sheet.scrollHeight, clientHeight: sheet.clientHeight, overflow });
        if (overflow > 1) {
          console.error('IAD print overflow: ' + overflow + 'px');
        }
      }
      win.focus();
      win.print();
    };

    const ready = () => {
      const doc = win.document as any;
      if (doc.fonts?.ready) {
        doc.fonts.ready.then(() => {
          requestAnimationFrame(() => requestAnimationFrame(doPrint));
        });
      } else if (doc.readyState === 'complete') {
        requestAnimationFrame(() => requestAnimationFrame(doPrint));
      }
    };

    win.addEventListener('afterprint', () => { try { win.close(); } catch(e) { /* ignore */ } });
    if ((win.document as any).readyState === 'complete') {
      ready();
    } else {
      win.addEventListener('load', ready);
    }
  }

  fmtDate(v?: string): string { return formatShanghaiDate(v) || ''; }
  fmtTime(v?: string): string { return formatShanghaiTime(v) || ''; }

  private num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  private ts(v?: string): number { return databaseTimeValue(v); }
}
