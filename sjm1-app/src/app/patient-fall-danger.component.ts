/**
 * 跌倒/坠床风险评估及预防措施护理记录单（Morse） —— Angular 组件
 * 访问路径：/form/patientFallDangerForm
 */
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

const SCORE_TYPE = 'patientFallDangerLJRMYY';
const FORM_CODE = 'patientFallDangerForm';

/** 临床判定法（布尔 → true 打√） */
const CLINICAL = [
  { key: 'hunmiOntanhaun', label: '昏迷或完全瘫痪' },
  { key: 'preHospitalization', label: '过去24小时曾有手术麻醉史' },
  { key: 'sylzys', label: '使用两种及以上镇静安眠药物' },
  { key: 'age', label: '年龄≥80岁' },
  { key: 'thisHospitalization', label: '住院前6个月/住院期间有跌倒经历' },
  { key: 'exist', label: '存在步态不稳、关节/肌肉疼痛、视觉障碍等' },
  { key: 'sixHours', label: '6h内使用过以上镇静、安眠药物' },
];

/** Morse 评分量表（数字 → 按分值列打√） */
const MORSE = [
  { field: 'fallHistory', item: '跌倒史', opts: [{ label: '有', score: 25 }, { label: '无', score: 0 }] },
  { field: 'otherDiagnosis', item: '超过一个疾病诊断', opts: [{ label: '有', score: 15 }, { label: '无', score: 0 }] },
  { field: 'useWalkTool', item: '使用助行器', opts: [{ label: '没有/卧床/轮椅/护士帮助', score: 0 }, { label: '拐杖/手杖/助行器', score: 15 }, { label: '依扶家具', score: 30 }] },
  { field: 'intravenousInjection', item: '静脉输液', opts: [{ label: '是', score: 20 }, { label: '否', score: 0 }] },
  { field: 'walk', item: '步态', opts: [{ label: '正常/卧床/轮椅', score: 0 }, { label: '虚弱', score: 10 }, { label: '受损', score: 20 }] },
  { field: 'mentality', item: '精神状态', opts: [{ label: '正确评估自我能力', score: 0 }, { label: '高估/忘记限制', score: 15 }] },
];

const MEASURE_LEGEND = [
  '1、常规措施：A 帮助患者熟悉病区环境。B 保持病房整洁无障碍物，光线明亮。C 病床/轮椅刹车固定好。D 床边桌、呼叫器置于患者健侧伸手可及。E 夜间开启地灯。F 协助患者日常生活所需。G 地面湿滑时放置安全警示牌。H 卧床时正确使用床挡。I 保持走道通畅。J 密切观察病情。',
  '2、选择性措施：K 教会患者正确使用助行设备。L 教会正确使起卧方法。M 指导患者排便/排尿。N 指导患者穿着轮椅袜。O 告知患者及家属发生跌倒/坠床的危险因素和预防措施，24h留陪。P 床旁悬挂跌倒警示牌。Q 评估结果告知护士长及主管医生。',
  '备注：评估频次：高风险≥2次/周，中风险≥1次/周；病人入院、转科时、病情发生变化、使用高跌倒风险药物、跌倒后、跌倒高风险患者出院前，应再次评估。',
];

interface FallRow {
  time: string;
  factor: Record<string, any>;
  total: number | null;
  risk: string;
  measures: string;
  signUserId?: string;
  signName?: string;
}
interface ScoreRecord {
  time?: string; scoreType?: string; total?: number; conclusion?: string; valid?: boolean;
  inputUserId?: string; inputUser?: string; nurseMeasureList?: any[]; patientFallDangerFactorV2?: Record<string, any>;
}
interface RenderPage { index: number; rows: FallRow[]; }

@Component({
  standalone: false,
  selector: 'app-patient-fall-danger',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <span class="auditor-field">
          <span class="auditor-label">审核者签名：</span>
          <span class="auditor-combo">
            <input class="auditor-input" type="text" [(ngModel)]="auditorQuery"
                   [placeholder]="auditorName || '搜索并选择'"
                   (focus)="onAuditorFocus()" (blur)="onAuditorBlur()" />
            <ul class="auditor-menu" *ngIf="auditorOpen">
              <li class="auditor-opt empty-opt" (mousedown)="clearAuditor()">（空）</li>
              <li class="auditor-opt" *ngFor="let a of filteredAccounts" (mousedown)="selectAuditor(a)">{{ a.accountName }}</li>
              <li class="auditor-opt no-opt" *ngIf="filteredAccounts.length === 0">无匹配账号</li>
            </ul>
          </span>
        </span>
        <span class="page-select">页码：
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
        <div class="sheet-head"><div class="title-line">{{hospitalName}}跌倒/坠床风险评估及预防措施护理记录单</div></div>

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
            <!-- HR1 顶层分组 -->
            <tr>
              <th class="date-col" rowspan="4">日期/时间</th>
              <th colspan="2">适用方法</th>
              <th colspan="7">临床判定法</th>
              <th [attr.colspan]="morseLeafCount + 2">Morse 评分量表</th>
              <th class="risk-col vtext" rowspan="4">跌倒风险</th>
              <th class="measure-col" rowspan="4">预防措施</th>
              <th class="sign-col" rowspan="4">签名</th>
            </tr>
            <!-- HR2 项目行 -->
            <tr>
              <th class="method-col vtext" rowspan="3">临床判定法</th>
              <th class="method-col vtext" rowspan="3">Morse评分量表</th>
              <th class="cond-col vtext" rowspan="3">昏迷或完全瘫痪</th>
              <th colspan="2">存在以下情况之一</th>
              <th colspan="4">存在以下情况之一</th>
              <th class="rowlabel-col">项目</th>
              <th *ngFor="let m of MORSE" [attr.colspan]="m.opts.length">{{ m.item }}</th>
              <th class="total-col" rowspan="3">总分</th>
            </tr>
            <!-- HR3 评估行 -->
            <tr>
              <th class="cond-col vtext" rowspan="2">过去24小时曾有手术麻醉史</th>
              <th class="cond-col vtext" rowspan="2">使用两种及以上镇静安眠药物</th>
              <th class="cond-col vtext" rowspan="2">年龄≥80岁</th>
              <th class="cond-col vtext" rowspan="2">住院前6个月内有跌倒经历/住院期间此次有跌倒经历</th>
              <th class="cond-col vtext" rowspan="2">存在步态不稳、关节疼痛、肌肉疼痛、视觉障碍等</th>
              <th class="cond-col vtext" rowspan="2">6h内使用过以上镇静、安眠药物</th>
              <th class="rowlabel-col">评估</th>
              <ng-container *ngFor="let m of MORSE">
                <th *ngFor="let o of m.opts" class="opt-col vtext">{{ o.label }}</th>
              </ng-container>
            </tr>
            <!-- HR4 评分行 -->
            <tr>
              <th class="rowlabel-col">评分</th>
              <ng-container *ngFor="let m of MORSE">
                <th *ngFor="let o of m.opts" class="score-col">{{ o.score }}</th>
              </ng-container>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of pagePaddedRows(page)">
              <td class="date-cell">
                <div class="dt-date">{{ r ? fmtDate(r.time) : '' }}</div>
                <div class="dt-time">{{ r ? fmtTime(r.time) : '' }}</div>
              </td>
              <td>{{ r ? (clinicalUsed(r) ? '√' : '') : '' }}</td>
              <td>{{ r ? (morseUsed(r) ? '√' : '') : '' }}</td>
              <td *ngFor="let c of CLINICAL">{{ r ? clinicalCheck(r, c.key) : '' }}</td>
              <td class="rowlabel-col"></td>
              <ng-container *ngFor="let m of MORSE">
                <td *ngFor="let o of m.opts">{{ r ? morseCheck(r, m.field, o.score) : '' }}</td>
              </ng-container>
              <td>{{ r && r.total !== null ? r.total : '' }}</td>
              <td>{{ r ? r.risk : '' }}</td>
              <td class="measure-cell">{{ r ? r.measures : '' }}</td>
              <td>{{ r ? (r.signName || '') : '' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="result-line">
          <span class="rl-item">结果：
            <input class="screen-only fill-txt" type="text" [(ngModel)]="result" (change)="saveExtra()" />
            <span class="print-only fill-val">{{ result }}</span>
          </span>
          <span class="rl-item">日期：
            <input class="screen-only" type="date"
                   style="border:none;background:transparent;outline:none;font-size:13px;color:#000;width:140px"
                   [(ngModel)]="resultDate" (change)="saveExtra()" />
            <span class="print-only fill-val">{{ resultDate }}</span>
          </span>
          <span class="rl-item">是否跌倒：
            <span class="screen-only">
              <label class="radio"><input type="radio" [name]="'fell'+page.index" value="是" [(ngModel)]="fell" (ngModelChange)="saveExtra()" /> 是</label>
              <label class="radio"><input type="radio" [name]="'fell'+page.index" value="否" [(ngModel)]="fell" (ngModelChange)="saveExtra()" /> 否</label>
            </span>
            <span class="print-only fill-val">是 {{ fell === '是' ? '☑' : '☐' }}　否 {{ fell === '否' ? '☑' : '☐' }}</span>
          </span>
        </div>

        <div class="footnote">
          <div class="fn-title">预防跌倒护理措施：</div>
          <div class="fn" *ngFor="let t of MEASURE_LEGEND">{{ t }}</div>
        </div>

        <div class="review-sign">审核护士签名：{{ auditorName || '__________' }}</div>
        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto; --fz-h2:24px; --fz-xs4:14px; --font-hei:'SimHei','黑体',sans-serif; --font-song:'SimSun','宋体',serif; }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:flex-end; }
    .page-select, .auditor-label { font-family:var(--font-song); font-size:14px; white-space:nowrap; }
    .auditor-field { display:flex; align-items:center; }
    .auditor-combo { position:relative; display:inline-block; }
    .auditor-input { padding:4px 8px; border:1px solid #ccc; border-radius:4px; font-size:14px; width:150px; }
    .auditor-menu { position:absolute; top:100%; left:0; right:0; margin:2px 0 0; padding:4px 0; list-style:none; max-height:240px; overflow-y:auto; background:#fff; border:1px solid #d9d9d9; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:100; }
    .auditor-opt { padding:5px 10px; font-size:14px; cursor:pointer; white-space:nowrap; }
    .auditor-opt:hover { background:#f0f7ff; } .empty-opt { color:#999; } .no-opt { color:#999; cursor:default; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:var(--font-song); }

    .sheet { box-sizing:border-box; width:297mm; min-height:210mm; margin:16px auto; padding:8mm 10mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:var(--font-hei); font-weight:700; font-size:var(--fz-h2); line-height:1.4; }
    .patient-info-row { display:flex; align-items:center; width:100%; gap:14px; font-family:var(--font-song); font-size:var(--fz-xs4); white-space:nowrap; margin:6px 0; }
    .info-item { flex:0 0 auto; white-space:nowrap; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }

    .record-table { width:100%; border-collapse:collapse; font-family:var(--font-song); font-size:11px; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:1px; word-break:break-all; vertical-align:middle; overflow:hidden; }
    .record-table td { height:26px; }
    /* 竖排文字：随行高自适应，允许向左换行 */
    .vtext { writing-mode:vertical-rl; white-space:normal; line-height:1.12; letter-spacing:0.5px; font-size:10px; font-weight:700; }
    .date-col { width:46px; }
    .method-col { width:22px; }
    .cond-col { width:26px; }
    .rowlabel-col { width:16px; writing-mode:vertical-rl; white-space:nowrap; font-size:10px; letter-spacing:1px; }
    .opt-col { width:24px; height:150px; font-weight:700; color:#000; }      /* 评估行：拉高，容纳长竖排选项 */
    .score-col { width:24px; font-size:11px; }
    .total-col { width:32px; } .risk-col { width:24px; } .measure-col { width:132px; } .sign-col { width:48px; }
    .dt-date,.dt-time { display:block; white-space:nowrap; line-height:1.25; }
    .measure-cell { text-align:left; padding-left:4px; letter-spacing:2px; }

    .result-line { display:flex; flex-wrap:wrap; gap:80px; margin-top:8px; align-items:center; font-family:var(--font-song); font-size:var(--fz-xs4); }
    .rl-item { display:inline-flex; align-items:center; } .rl-item .radio { margin-right:12px; }
    .fill-txt { width:160px; padding:2px 6px; border:1px solid #ccc; border-radius:3px; font-size:13px; }
    .fill-date { padding:2px 6px; border:1px solid #ccc; border-radius:3px; font-size:13px; }
    .print-only { display:none; } .fill-val { min-width:120px; border-bottom:1px solid #000; padding:0 6px; }

    .footnote { margin-top:6px; font-family:var(--font-song); font-size:11px; line-height:1.5; text-align:left; }
    .footnote .fn-title { font-weight:700; } .footnote .fn { margin:1px 0; }
    .review-sign { margin-top:6px; text-align:right; font-family:var(--font-song); font-size:var(--fz-xs4); padding-right:6px; }
    .sheet-pageno { margin-top:4px; text-align:center; font-size:var(--fz-xs4); font-family:var(--font-song); }
    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print {
      :host { height:auto; overflow:visible; }
      .no-print { display:none !important; }
      .screen-only { display:none !important; } .print-only { display:inline !important; }
      .sheet { width:297mm; height:210mm; overflow:hidden; margin:0; box-shadow:none; zoom:1; page-break-after:always; }
      .sheet:last-of-type { page-break-after:auto; }
    }
  `],
})
export class PatientFallDangerComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';
  private readonly API_ACCOUNT_ALL = '/api/v1/icu/accounts';
  private readonly API_EXTRA_LATEST = '/api/v1/icu/fall-danger-extra/latest';
  private readonly API_EXTRA_SAVE = '/api/v1/icu/fall-danger-extra/save';

  readonly CLINICAL = CLINICAL;
  readonly MORSE = MORSE;
  readonly MEASURE_LEGEND = MEASURE_LEGEND;
  get morseLeafCount(): number { return MORSE.reduce((s, m) => s + m.opts.length, 0); }

  loading = true;
  patient: any = null;
  deptName = '重症医学科';
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';
  age: number | null = null;

  rows: FallRow[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  // 工具栏可选并保存
  auditorName = ''; auditorId = ''; auditorQuery = ''; auditorOpen = false;
  result = ''; resultDate = ''; fell = '';
  accountList: { accountId: string; accountName: string }[] = [];
  private blurTimer: any = null;
  private readonly AUDITOR_BLOCK = ['工程师', '美康', '他科带入', '外院带入', '其他账号'];

  readonly rowsPerPage = 15;
  private pid = '';
  private destroy$ = new Subject<void>();
  private ro?: ResizeObserver;
  private __lastPid: string | null = null;

  constructor(private http: HttpClient, private hostPatient: HostPatientService,
              private cdr: ChangeDetectorRef, private host: ElementRef) {}

  ngOnInit(): void {
    this.loadHospitalName();
    this.loadAccountList();
    this.hostPatient.patient$.pipe(
      filter(p => !!p),
      map(p => ({ p, pid: String(p.id || '').trim() })),
      filter(({ pid }) => !!pid),
      tap(({ pid }) => { if (pid !== this.__lastPid) this.__lastPid = pid; }),
      distinctUntilChanged((a, b) => a.pid === b.pid),
      tap(({ p, pid }) => {
        this.resetForm();
        this.patient = p; this.pid = pid;
        this.age = this.calcAge(p.birthday);
        this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis);
        this.loadExtra();
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
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); this.ro?.disconnect(); }

  private resetForm(): void {
    this.rows = []; this.pages = []; this.selectedPage = null;
    this.diagnosisDisplay = ''; this.age = null;
    this.auditorName = ''; this.auditorId = ''; this.auditorQuery = ''; this.auditorOpen = false;
    this.result = ''; this.resultDate = ''; this.fell = '';
    this.cdr.detectChanges();
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http.get<ScoreRecord[]>(this.API_SCORE, { params: { pid, scoreType: SCORE_TYPE } }).pipe(
      tap((res) => {
        const list = Array.isArray(res) ? res : res ? [res as any] : [];
        this.buildRows(list.filter(r => r && r.valid === true && r.scoreType === SCORE_TYPE));
      }),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    );
  }

  private buildRows(records: ScoreRecord[]): void {
    const rows: FallRow[] = records.filter(r => !!r.time).map(r => ({
      time: r.time!,
      factor: r.patientFallDangerFactorV2 || {},
      total: this.num(r.total),
      risk: r.conclusion || '',
      measures: this.parseMeasures(r.nurseMeasureList || []),
      signUserId: r.inputUserId,
      signName: r.inputUser || '',
    })).sort((a, b) => this.ts(a.time) - this.ts(b.time));
    this.rows = rows;

    const userIds = [...new Set(rows.map(r => r.signUserId).filter(Boolean) as string[])];
    if (userIds.length) {
      this.http.get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } }).subscribe({
        next: (accounts) => {
          const nameMap = new Map<string, string>();
          if (Array.isArray(accounts)) for (const a of accounts) { const id = a?._id || a?.id; if (id) nameMap.set(String(id), a?.trueName || ''); }
          for (const row of this.rows) if (row.signUserId && nameMap.has(row.signUserId)) row.signName = nameMap.get(row.signUserId) || row.signName;
          this.paginate(); this.cdr.detectChanges();
        },
        error: () => { this.paginate(); this.cdr.detectChanges(); },
      });
    } else { this.paginate(); }
  }

  clinicalCheck(r: FallRow, key: string): string { return r.factor[key] === true ? '√' : ''; }
  morseCheck(r: FallRow, field: string, score: number): string { return this.num(r.factor[field]) === score ? '√' : ''; }
  /** 适用方法 - 临床判定法：任一临床布尔为 true 打√ */
  clinicalUsed(r: FallRow): boolean { return this.CLINICAL.some(c => r.factor[c.key] === true); }
  /** 适用方法 - Morse：有任一 Morse 分值或有总分打√ */
  morseUsed(r: FallRow): boolean { return this.MORSE.some(m => this.num(r.factor[m.field]) !== null) || r.total !== null; }

  private parseMeasures(list: any[]): string {
    const seen = new Set<string>(); const out: string[] = [];
    for (const m of list) {
      if (m && m.value === true && typeof m.code === 'string') {
        const letter = m.code.split('.')[0].trim();
        if (letter && !seen.has(letter)) { seen.add(letter); out.push(letter); }
      }
    }
    return out.join(' ');
  }

  private paginate(): void {
    const per = this.rowsPerPage; const pages: RenderPage[] = [];
    if (!this.rows.length) pages.push({ index: 1, rows: [] });
    else for (let i = 0; i < this.rows.length; i += per) pages.push({ index: pages.length + 1, rows: this.rows.slice(i, i + per) });
    this.pages = pages;
    if (this.selectedPage !== null && this.selectedPage > pages.length) this.selectedPage = null;
  }
  pagePaddedRows(page: RenderPage): (FallRow | null)[] {
    const result: (FallRow | null)[] = page.rows.slice(0, this.rowsPerPage);
    while (result.length < this.rowsPerPage) result.push(null);
    return result;
  }

  /* ===== 审核者下拉（可检索 + 屏蔽 + 登录者置顶） ===== */
  private get baseAccounts() { return this.accountList.filter(a => a.accountName && !this.AUDITOR_BLOCK.includes(a.accountName.trim())); }
  get orderedAccounts(): { accountId: string; accountName: string }[] {
    const login = this.hostPatient.getAccount(); const loginName = (login?.trueName || '').trim();
    const list = [...this.baseAccounts];
    if (loginName && !this.AUDITOR_BLOCK.includes(loginName)) {
      const idx = list.findIndex(a => a.accountName === loginName);
      const opt = idx >= 0 ? list.splice(idx, 1)[0] : { accountId: login.username || login.accountId || login.id || '', accountName: loginName };
      return [opt, ...list];
    }
    return list;
  }
  get filteredAccounts() {
    const q = (this.auditorQuery || '').trim().toLowerCase();
    const base = this.orderedAccounts;
    return q ? base.filter(a => a.accountName.toLowerCase().includes(q)) : base;
  }
  onAuditorFocus(): void { if (this.blurTimer) { clearTimeout(this.blurTimer); this.blurTimer = null; } this.auditorOpen = true; this.auditorQuery = ''; }
  onAuditorBlur(): void { this.blurTimer = setTimeout(() => { this.auditorOpen = false; this.auditorQuery = this.auditorName; this.cdr.detectChanges(); }, 150); }
  selectAuditor(a: { accountId: string; accountName: string }): void { this.auditorName = a.accountName; this.auditorId = a.accountId; this.auditorQuery = a.accountName; this.auditorOpen = false; this.saveExtra(); }
  clearAuditor(): void { this.auditorName = ''; this.auditorId = ''; this.auditorQuery = ''; this.auditorOpen = false; this.saveExtra(); }

  private loadAccountList(): void {
    this.http.get<any[]>(this.API_ACCOUNT_ALL).subscribe({
      next: (list) => {
        this.accountList = (Array.isArray(list) ? list : [])
          .map(a => ({ accountId: a?.accountId || a?.username || a?.id || '', accountName: a?.accountName || a?.trueName || '' }))
          .filter(a => a.accountName);
        this.cdr.detectChanges();
      },
      error: (e) => console.error('[fall] loadAccountList failed', e),
    });
  }
  private loadExtra(): void {
    this.http.get<any>(this.API_EXTRA_LATEST, { params: { pid: this.pid, formCode: FORM_CODE } }).subscribe({
      next: (d) => {
        if (d) {
          this.auditorName = d.auditorName || ''; this.auditorId = d.auditorId || '';
          this.result = d.result || ''; this.resultDate = d.resultDate || ''; this.fell = d.fell || '';
        }
        this.auditorQuery = this.auditorName;
        this.cdr.detectChanges();
      },
      error: () => this.cdr.detectChanges(),
    });
  }
  saveExtra(): void {
    if (!this.pid) return;
    this.http.post(this.API_EXTRA_SAVE, {
      pid: this.pid, formCode: FORM_CODE,
      auditorId: this.auditorId, auditorName: this.auditorName,
      result: this.result, resultDate: this.resultDate, fell: this.fell,
    }).subscribe({ next: () => {}, error: (e) => console.error('[fall] saveExtra failed', e) });
  }

  /* ===== 通用 ===== */
  private fitScale(): void {
    const SHEET_W = 297 * (96 / 25.4);
    const avail = this.host.nativeElement.clientWidth - 32;
    this.host.nativeElement.style.setProperty('--sheet-scale', String(Math.min(1, avail / SHEET_W)));
  }
  private loadHospitalName(): void {
    this.http.get<{ hospitalName: string }>(this.API_HOSPITAL).subscribe({
      next: (res) => { if (res?.hospitalName) { this.hospitalName = res.hospitalName; this.cdr.detectChanges(); } }, error: () => {},
    });
  }
  genderText(g?: string): string { if (g === 'Male' || g === 'M' || g === '男') return '男'; if (g === 'Female' || g === 'F' || g === '女') return '女'; return g || ''; }
  private calcAge(b?: string): number | null {
    if (!b) return null; const d = new Date(b); if (isNaN(d.getTime())) return null;
    const now = new Date(); let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--; return a;
  }
  private formatDiagnosis(x?: string): string {
    if (!x) return ''; let i = -1; for (const s of [';', '；', ',', '，']) { const j = x.indexOf(s); if (j >= 0 && (i < 0 || j < i)) i = j; }
    return i >= 0 ? x.substring(0, i).trim() : x.trim();
  }
  fmtDate(v?: string): string { if (!v) return ''; const d = new Date(v); if (isNaN(d.getTime())) return v; const p = (n: number) => `${n}`.padStart(2, '0'); return `${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  fmtTime(v?: string): string { if (!v) return ''; const d = new Date(v); if (isNaN(d.getTime())) return ''; const p = (n: number) => `${n}`.padStart(2, '0'); return `${p(d.getHours())}：${p(d.getMinutes())}`; }
  private num(v: any): number | null { if (v === null || v === undefined || v === '') return null; const n = Number(v); return isNaN(n) ? null : n; }
  private ts(v?: string): number { const t = v ? new Date(v).getTime() : 0; return isNaN(t) ? 0 : t; }

  onPrint(): void {
    const sheets = this.host.nativeElement.querySelectorAll('.sheet');
    if (!sheets.length) return;
    let body = '';
    sheets.forEach((s: HTMLElement) => { const c = s.cloneNode(true) as HTMLElement; c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove()); c.style.zoom = '1'; body += c.outerHTML; });
    const css = `
      @page { size: A4 landscape; margin:0; }
      html,body{margin:0;padding:0;} body{color:#000;font-family:'SimSun','宋体',serif;}
      .sheet{box-sizing:border-box;width:297mm;height:210mm;margin:0;padding:8mm 10mm;overflow:hidden;page-break-after:always;box-shadow:none;}
      .sheet:last-of-type{page-break-after:auto;}
      .sheet-head{text-align:center;padding-bottom:6px;} .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:24px;line-height:1.4;}
      .patient-info-row{display:flex;align-items:center;width:100%;gap:14px;font-size:14px;white-space:nowrap;margin:6px 0;}
      .info-item{flex:0 0 auto;white-space:nowrap;} .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
      .record-table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:1px;word-break:break-all;vertical-align:middle;overflow:hidden;}
      .record-table td{height:26px;}
      .vtext{writing-mode:vertical-rl;white-space:normal;line-height:1.12;letter-spacing:0.5px;font-size:10px;font-weight:700;}
      .date-col{width:46px;} .method-col{width:22px;} .cond-col{width:26px;}
      .rowlabel-col{width:16px;writing-mode:vertical-rl;white-space:nowrap;font-size:10px;letter-spacing:1px;}
      .opt-col{width:24px;height:150px;font-weight:700;color:#000;writing-mode:vertical-rl;white-space:normal;line-height:1.12;font-size:10px;}
      .score-col{width:24px;font-size:11px;} .total-col{width:32px;} .risk-col{width:24px;} .measure-col{width:132px;} .sign-col{width:48px;}
      .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.25;} .measure-cell{text-align:left;padding-left:4px;letter-spacing:2px;}
      .result-line{display:flex;flex-wrap:wrap;gap:80px;margin-top:8px;align-items:center;font-size:14px;}
      .rl-item{display:inline-flex;align-items:center;} .screen-only{display:none !important;} .print-only{display:inline !important;}
      .fill-val{min-width:120px;border-bottom:1px solid #000;padding:0 6px;}
      .footnote{margin-top:6px;font-size:11px;line-height:1.5;text-align:left;} .footnote .fn-title{font-weight:700;} .footnote .fn{margin:1px 0;}
      .review-sign{margin-top:6px;text-align:right;font-size:14px;padding-right:6px;} .sheet-pageno{margin-top:4px;text-align:center;font-size:14px;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }
}
