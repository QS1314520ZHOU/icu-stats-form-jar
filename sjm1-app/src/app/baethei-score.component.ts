/**
 * 住院患者日常生活能力评估单（Barthel 指数） —— Angular 组件
 * 访问路径：/form/baetheiForm
 * 行=每条 Score 记录（scoreType=selfCareAbility）；取数/签名/缩放/打印与其他评分表一致
 */

import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

/* ============================= 配置区 ============================= */

const SCORE_TYPE = 'selfCareAbility';

/** 10 个评估项（顺序与表头一致） */
const ITEMS = [
  { key: 'eat', label: '进食' },
  { key: 'shower', label: '洗浴' },
  { key: 'modification', label: '修饰' },
  { key: 'dressing', label: '穿[脱]衣' },
  { key: 'defecationControl', label: '控制大便' },
  { key: 'controllingUrination', label: '控制小便' },
  { key: 'toilet', label: '如厕' },
  { key: 'bedChairTransfer', label: '床椅移动' },
  { key: 'walk', label: '平地行走' },
  { key: 'upAndDownStairs', label: '上下楼梯' },
];

/** 评分标准图例（4 等级 × 10 项，''=该项无此等级） */
const LEGEND = [
  { level: '完全独立',   scores: ['10', '5', '5', '10', '10',    '10',    '10', '15', '15', '10'] },
  { level: '需部分帮助', scores: ['5',  '0', '0', '5',  '5偶尔', '5偶尔', '5',  '10', '10', '5'] },
  { level: '需极大帮助', scores: ['0',  '',  '',  '0',  '0失控', '0失控', '0',  '5',  '5',  '0'] },
  { level: '完全依赖',   scores: ['',   '',  '',  '',   '',      '',      '',   '0',  '0',  ''] },
];

/* ============================= 数据模型 ============================= */

interface SelfCareAbility {
  eat?: number; shower?: number; modification?: number; dressing?: number;
  defecationControl?: number; controllingUrination?: number; toilet?: number;
  bedChairTransfer?: number; walk?: number; upAndDownStairs?: number;
}
interface ScoreRecord {
  _id?: string; pid?: string; time?: string; scoreType?: string;
  total?: number; conclusion?: string; valid?: boolean;
  inputUserId?: string; inputUser?: string; remarks?: string;
  selfCareAbility?: SelfCareAbility;
}
interface BarthelRow {
  time: string;
  scores: Record<string, number | null>;
  total: number | null;
  grade: string;
  remarks: string;
  signUserId?: string;
  signName?: string;
}
interface RenderPage { index: number; rows: BarthelRow[]; }

@Component({
  standalone: false,
  selector: 'app-baethei-score',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <span class="auditor-field">
          <span class="auditor-label">审核者签名：</span>
          <span class="auditor-combo">
            <input class="auditor-input" type="text"
                   [(ngModel)]="auditorQuery"
                   [placeholder]="auditorName || '搜索并选择'"
                   (focus)="onAuditorFocus()" (blur)="onAuditorBlur()" />
            <ul class="auditor-menu" *ngIf="auditorOpen">
              <li class="auditor-opt empty-opt" (mousedown)="clearAuditor()">（空）</li>
              <li class="auditor-opt" *ngFor="let a of filteredAccounts"
                  (mousedown)="selectAuditor(a)">{{ a.accountName }}</li>
              <li class="auditor-opt no-opt" *ngIf="filteredAccounts.length === 0">无匹配账号</li>
            </ul>
          </span>
        </span>
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
          <div class="title-line">{{hospitalName}}住院患者日常生活能力评估单</div>
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
              <th class="date-col" rowspan="6">日期时间</th>
              <th [attr.colspan]="ITEMS.length + 2">日常生活能力评估（Barthel 指数）</th>
              <th class="grade-col" rowspan="6">分级</th>
              <th class="other-col" rowspan="6">其他</th>
              <th class="sign-col" rowspan="6">签名</th>
            </tr>
            <tr>
              <th class="item-label-col">项目</th>
              <th *ngFor="let it of ITEMS">{{ it.label }}</th>
              <th class="total-col">总分</th>
            </tr>
            <tr class="legend-row" *ngFor="let lg of LEGEND">
              <th class="legend-level">{{ lg.level }}</th>
              <td *ngFor="let sc of lg.scores" [class.legend-blank]="!sc">{{ sc }}</td>
              <td class="legend-total"></td>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of pagePaddedRows(page)">
              <td class="date-cell">
                <span class="dt-date">{{ r ? fmtDate(r.time) : '' }}</span>
                <span class="dt-time">{{ r ? fmtTime(r.time) : '' }}</span>
              </td>
              <td class="item-label-col"></td>
              <td *ngFor="let it of ITEMS">{{ r ? itemVal(r, it.key) : '' }}</td>
              <td class="total-col">{{ r && r.total !== null ? r.total : '' }}</td>
              <td class="grade-col">{{ r ? r.grade : '' }}</td>
              <td class="other-cell">{{ r ? r.remarks : '' }}</td>
              <td class="sign-col">{{ r ? (r.signName || '') : '' }}</td>
            </tr>

          </tbody>
        </table>

        <div class="footnote">
          备注：总分 0-100 分。①100 分：无依赖；1 次/月评估。②61-99 分：轻度依赖，日常生活少部分需要帮助；1 次/半月评估。③41-60 分：中度依赖，日常生活大部分需要帮助；1 次/周评估。④≤40 分：重度依赖，日常生活全部需要照顾；2 次/周评估，病情/因子改变随时评估。
        </div>

        <div class="review-sign">审核护士签名：{{auditorName || '__________'}}</div>
        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto; --fz-h2:26px; --fz-xs4:15px; --font-hei:'SimHei','黑体',sans-serif; --font-song:'SimSun','宋体',serif; }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .auditor-field { display:flex; align-items:center; }
    .auditor-label { font-family:var(--font-song); font-size:14px; white-space:nowrap; }
    .auditor-combo { position:relative; display:inline-block; }
    .auditor-input { padding:4px 8px; border:1px solid #ccc; border-radius:4px; font-size:14px; width:160px; }
    .auditor-menu { position:absolute; top:100%; left:0; right:0; margin:2px 0 0; padding:4px 0; list-style:none; max-height:240px; overflow-y:auto; background:#fff; border:1px solid #d9d9d9; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:100; }
    .auditor-opt { padding:5px 10px; font-size:14px; cursor:pointer; white-space:nowrap; }
    .auditor-opt:hover { background:#f0f7ff; }
    .empty-opt { color:#999; }
    .no-opt { color:#999; cursor:default; }
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
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:3px 2px; word-break:break-all; height:28px; vertical-align:middle; }
    .record-table th { background:transparent; font-weight:700; }
    .record-table th,
    .record-table td { color:#000; }
    .record-table td { font-weight:700; }
    .date-col { width:64px; }
    .item-label-col { width:72px; }
    .item-col { width:auto; }
    .total-col { width:42px; }
    .grade-col { width:40px; }
    .other-col { width:120px; }
    .sign-col { width:60px; }

    /* 固定评分标准加粗纯黑；记录行(tbody)保持原样 */
    .legend-row th,
    .legend-row td { font-weight:700; color:#000; }
    .legend-level { font-weight:700; white-space:nowrap; }
    .legend-blank { background:#f7f7f7; }
    .legend-total { background:#f7f7f7; }

    .dt-date,.dt-time { display:block; white-space:nowrap; line-height:1.25; }
    .other-cell { text-align:left; padding-left:5px; }

    .footnote { margin-top:6px; font-family:var(--font-song); font-size:12px; line-height:1.5; text-align:left; }
    .footnote .fn { padding-left:2em; text-indent:-2em; margin:1px 0; }

    .review-sign { margin-top:6px; text-align:right; font-family:var(--font-song); font-size:var(--fz-xs4); padding-right:6px; }
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
export class BaetheiScoreComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';
  private readonly API_ACCOUNT_ALL = '/api/v1/icu/accounts';
  private readonly API_EXTRA_LATEST = '/api/v1/icu/selfcare-extra/latest';
  private readonly API_EXTRA_SAVE = '/api/v1/icu/selfcare-extra/save';

  readonly ITEMS = ITEMS;
  readonly LEGEND = LEGEND;

  loading = true;
  patient: any = null;
  deptName = '重症医学科';
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';
  age: number | null = null;

  records: ScoreRecord[] = [];
  rows: BarthelRow[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  auditorName = '';
  auditorId = '';
  auditorQuery = '';
  auditorOpen = false;
  accountList: { accountId: string; accountName: string }[] = [];
  private blurTimer: any = null;

  /** 屏蔽的系统账号（按 trueName 精确匹配） */
  private readonly AUDITOR_BLOCK = ['工程师', '美康', '他科带入', '外院带入', '其他账号'];

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
    this.loadAccountList();
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
    this.auditorName = '';
    this.auditorId = '';
    this.auditorQuery = '';
    this.auditorOpen = false;
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
    const rows: BarthelRow[] = this.records
      .filter(r => !!r.time)
      .map(r => {
        const s: any = r.selfCareAbility || {};
        const scores: Record<string, number | null> = {};
        for (const it of ITEMS) scores[it.key] = this.num(s[it.key]);
        return {
          time: r.time!,
          scores,
          total: this.num(r.total),
          grade: this.gradeOf(r.conclusion || ''),
          remarks: r.remarks || '',
          signUserId: r.inputUserId,
          signName: r.inputUser || '',
        } as BarthelRow;
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

  itemVal(row: BarthelRow | null, key: string): string {
    if (!row) return '';
    const v = row.scores[key];
    return v === null || v === undefined ? '' : String(v);
  }

  /** 分级：按 conclusion 文本判定 */
  private gradeOf(c: string): string {
    if (!c) return '';
    if (c.includes('重度')) return 'Ⅲ';
    if (c.includes('中度')) return 'Ⅱ';
    if (c.includes('轻度')) return 'Ⅰ';
    if (c.includes('无')) return '0';
    return '';
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

  pagePaddedRows(page: RenderPage): (BarthelRow | null)[] {
    const result: (BarthelRow | null)[] = page.rows.slice(0, this.rowsPerPage);
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

  private loadAccountList(): void {
    this.http.get<any[]>(this.API_ACCOUNT_ALL).subscribe({
      next: (list) => {
        this.accountList = (Array.isArray(list) ? list : [])
          .map(a => ({
            accountId: a?.accountId || a?.username || a?.id || '',
            accountName: a?.accountName || a?.trueName || '',
          }))
          .filter(a => a.accountName);
        this.cdr.detectChanges();
      },
      error: (err) => { console.error('[baethei] loadAccountList failed', err); },
    });
  }

  /** 有效且未被屏蔽的账号 */
  private get baseAccounts(): { accountId: string; accountName: string }[] {
    return this.accountList.filter(a =>
      a.accountName && !this.AUDITOR_BLOCK.includes(a.accountName.trim()));
  }

  /** 登录者置顶 */
  get orderedAccounts(): { accountId: string; accountName: string }[] {
    const login = this.hostPatient.getAccount();
    const loginName = (login?.trueName || '').trim();
    const list = [...this.baseAccounts];
    if (loginName && !this.AUDITOR_BLOCK.includes(loginName)) {
      const idx = list.findIndex(a => a.accountName === loginName);
      const loginOpt = idx >= 0
        ? list.splice(idx, 1)[0]
        : { accountId: login.username || login.accountId || login.id || '', accountName: loginName };
      return [loginOpt, ...list];
    }
    return list;
  }

  /** 按输入检索 */
  get filteredAccounts(): { accountId: string; accountName: string }[] {
    const q = (this.auditorQuery || '').trim().toLowerCase();
    const base = this.orderedAccounts;
    return q ? base.filter(a => a.accountName.toLowerCase().includes(q)) : base;
  }

  private loadExtra(): void {
    this.http.get<any>(this.API_EXTRA_LATEST, { params: { pid: this.pid, formCode: 'baetheiForm' } }).subscribe({
      next: (d) => {
        if (d && d.auditorName) {
          this.auditorName = d.auditorName;
          this.auditorId = d.auditorId || '';
        } else {
          this.auditorName = '';
          this.auditorId = '';
        }
        this.auditorQuery = this.auditorName;
        this.cdr.detectChanges();
      },
      error: () => {
        this.auditorQuery = this.auditorName;
        this.cdr.detectChanges();
      },
    });
  }

  onAuditorFocus(): void {
    if (this.blurTimer) { clearTimeout(this.blurTimer); this.blurTimer = null; }
    this.auditorOpen = true;
    this.auditorQuery = '';
  }

  onAuditorBlur(): void {
    this.blurTimer = setTimeout(() => {
      this.auditorOpen = false;
      this.auditorQuery = this.auditorName;
      this.cdr.detectChanges();
    }, 150);
  }

  selectAuditor(a: { accountId: string; accountName: string }): void {
    this.auditorName = a.accountName;
    this.auditorId = a.accountId;
    this.auditorQuery = a.accountName;
    this.auditorOpen = false;
    this.saveAuditor();
  }

  clearAuditor(): void {
    this.auditorName = '';
    this.auditorId = '';
    this.auditorQuery = '';
    this.auditorOpen = false;
    this.saveAuditor();
  }

  private saveAuditor(): void {
    if (!this.pid) return;
    this.http.post(this.API_EXTRA_SAVE, {
      pid: this.pid, formCode: 'baetheiForm',
      auditorId: this.auditorId, auditorName: this.auditorName,
    }).subscribe({ next: () => {}, error: (e) => console.error('[baethei] saveExtra failed', e) });
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
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:3px 2px;height:28px;word-break:break-all;vertical-align:middle;}
      .record-table th{background:transparent;font-weight:700;} .record-table th,.record-table td{color:#000;} .record-table td{font-weight:700;}
      .date-col{width:64px;} .item-label-col{width:72px;} .total-col{width:42px;} .grade-col{width:40px;} .other-col{width:120px;} .sign-col{width:60px;}
      .legend-row th,.legend-row td{font-weight:700;color:#000;} .legend-level{font-weight:700;white-space:nowrap;} .legend-blank{background:#f7f7f7;} .legend-total{background:#f7f7f7;}
      .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.25;}
      .other-cell{text-align:left;padding-left:5px;}
      .footnote{margin-top:6px;font-size:12px;line-height:1.5;text-align:left;}
      .footnote .fn{padding-left:2em;text-indent:-2em;margin:1px 0;}
      .review-sign{margin-top:6px;text-align:right;font-size:15px;padding-right:6px;}
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
