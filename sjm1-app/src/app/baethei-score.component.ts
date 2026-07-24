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
import { databaseTimeValue, formatShanghaiDate, formatShanghaiTime } from './form-date.util';
import { measureRowCapacity } from './form-measure.util';

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
  inputUserId?: string; inputUser?: string; ohter?: string; remarks?: string;
  selfCareAbility?: SelfCareAbility;
}
interface BarthelRow {
  time: string;
  scores: Record<string, number | null>;
  total: number | null;
  grade: string;
  other: string;
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

      <div class="sheet"
           *ngFor="let page of pages" [class.sheet-hidden]="selectedPage !== null && selectedPage !== page.index">
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}住院患者日常生活能力评估单</div>
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
            <tr class="data-row" *ngFor="let r of pagePaddedRows(page)">
              <td class="date-cell">
                <span class="dt-date">{{ r ? fmtDate(r.time) : '' }}</span>
                <span class="dt-time">{{ r ? fmtTime(r.time) : '' }}</span>
              </td>
              <td class="item-label-col"></td>
              <td *ngFor="let it of ITEMS">{{ r ? itemVal(r, it.key) : '' }}</td>
              <td class="total-col">{{ r && r.total !== null ? r.total : '' }}</td>
              <td class="grade-col">{{ r ? r.grade : '' }}</td>
              <td class="other-cell"><div class="other-value">{{ r ? r.other : '' }}</div></td>
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
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto;     }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .auditor-field { display:flex; align-items:center; }
    .auditor-label { font-family:'SimSun', '宋体', serif; font-size:12pt; white-space:nowrap; }
    .auditor-combo { position:relative; display:inline-block; }
    .auditor-input { padding:4px 8px; border:1px solid #ccc; border-radius:4px; font-size:12pt; width:160px; }
    .auditor-menu { position:absolute; top:100%; left:0; right:0; margin:2px 0 0; padding:4px 0; list-style:none; max-height:240px; overflow-y:auto; background:#fff; border:1px solid #d9d9d9; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:100; }
    .auditor-opt { padding:5px 10px; font-size:12pt; cursor:pointer; white-space:nowrap; }
    .auditor-opt:hover { background:#f0f7ff; }
    .empty-opt { color:#999; }
    .no-opt { color:#999; cursor:default; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:'SimSun', '宋体', serif; }
    .sheet-hidden { display:none; }

    .sheet { box-sizing:border-box; width:297mm; min-height:210mm; margin:16px auto; padding:10mm 12mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:'SimHei', '黑体', sans-serif; font-weight:700; font-size:24pt; line-height:1.35; }

    .patient-info-row { display:flex; align-items:center; width:100%; gap:16px; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; white-space:nowrap; margin:2px 0; color:#000; }
    .info-item { flex:0 0 auto; white-space:nowrap; }
    .info-item b { font-weight:700; }
    .info-item b, .info-item strong { font-family:inherit; font-size:inherit; font-style:inherit; line-height:inherit; color:inherit; font-weight:700; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }

    .record-table { width:100%; border-collapse:collapse; font-family:'SimSun', '宋体', serif; font-size:9pt; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:2px 1px; word-break:break-all; height:28px; vertical-align:middle; }
    .record-table th { background:transparent; font-weight:700; }
    .record-table th,.record-table td { color:#000; }
    .record-table th { font-weight:700; }
    .record-table tr.data-row td { font-weight:400; min-height:28px; height:auto; vertical-align:middle; }
    .record-table tr.data-row { break-inside:avoid; page-break-inside:avoid; }
    .record-table th.date-col,.record-table td.date-col { overflow:hidden; white-space:normal; word-break:normal; }
    .date-col { width:72px; min-width:72px; }
    .item-label-col { width:58px; }
    .item-col { width:auto; }
    .total-col { width:38px; }
    .grade-col { width:56px; }
    .other-col { width:88px; }
    .sign-col { width:50px; }

    /* 固定评分标准加粗纯黑；记录行(tbody)保持原样 */
    .legend-row th,
    .legend-row td { font-weight:700; color:#000; }
    .legend-level { font-weight:700; }
    .legend-blank { background:#f7f7f7; }
    .legend-total { background:#f7f7f7; }

    .dt-date,.dt-time { display:block; width:100%; white-space:nowrap; word-break:normal; overflow-wrap:normal; text-align:center; line-height:1.25; }
    .other-cell { text-align:left; padding:3px 5px; white-space:normal; word-break:break-word; overflow-wrap:anywhere; line-height:1.3; overflow:visible; }
    .other-value { min-height:22px; display:flex; align-items:center; white-space:normal; word-break:break-word; overflow-wrap:anywhere; }

    .footnote { margin-top:6px; margin-bottom:10mm; font-family:'SimSun', '宋体', serif; font-size:9.5pt; line-height:1.3; text-align:left; }
    .footnote .fn { padding-left:2em; text-indent:-2em; margin:1px 0; }

    .review-sign { margin-top:6px; text-align:right; font-family:'SimSun', '宋体', serif; font-size:13pt; padding-right:6px; }
    .sheet-pageno { position:absolute; left:12mm; right:12mm; bottom:6mm; margin:0; text-align:center; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; line-height:1; color:#000; white-space:nowrap; }
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

  readonly maxRowsPerPage = 10;
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
          other: String(r.ohter ?? '').trim(),
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
          this.autoPaginate();
          this.cdr.detectChanges();
        },
        error: () => { this.autoPaginate(); this.cdr.detectChanges(); },
      });
    } else {
      this.autoPaginate();
    }
  }

  itemVal(row: BarthelRow | null, key: string): string {
    if (!row) return '';
    const v = row.scores[key];
    return v === null || v === undefined ? '' : String(v);
  }

  /** 分级：按 conclusion 文本判定，展示中文等级 */
  private gradeOf(c: string): string {
    if (!c) return '';
    if (c.includes('重度')) return '重度依赖';
    if (c.includes('中度')) return '中度依赖';
    if (c.includes('轻度')) return '轻度依赖';
    if (c.includes('无')) return '无依赖';
    return '';
  }

  private async autoPaginate(): Promise<void> {
    // 测量固定区域高度
    const fixedHeight = await this.measureFixedHeight();
    const rowHeights = await this.measureAllRowHeights();
    this.paginateWithHeights(fixedHeight, rowHeights);
    this.cdr.detectChanges();
  }

  private paginateWithHeights(fixedHeight: number, rowHeights: Map<string, number>): void {
    const A4_H = 210 * (96 / 25.4); // A4横向高度 px
    const PAGE_PAD = 22; // 上下padding
    const FOOTER = 80; // 备注+审核签名+页码
    const available = A4_H - PAGE_PAD - fixedHeight - FOOTER;
    const MIN_ROW_H = 28;
    const MAX_ROWS = this.maxRowsPerPage;
    const pages: RenderPage[] = [];
    let curRows: BarthelRow[] = [];
    let usedH = 0;
    for (const row of this.rows) {
      const rh = rowHeights.get(row.time) || MIN_ROW_H;
      const reachCount = curRows.length >= MAX_ROWS;
      const exceedHeight = curRows.length > 0 && usedH + rh > available;
      if (reachCount || exceedHeight) {
        pages.push({ index: pages.length + 1, rows: curRows });
        curRows = [];
        usedH = 0;
      }
      curRows.push(row);
      usedH += rh;
    }
    if (curRows.length) pages.push({ index: pages.length + 1, rows: curRows });
    if (!pages.length) pages.push({ index: 1, rows: [] });
    this.pages = pages.map((p, i) => ({ ...p, index: i + 1 }));
    if (this.selectedPage !== null && this.selectedPage > this.pages.length) this.selectedPage = null;
  }

  private async measureFixedHeight(): Promise<number> {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;width:297mm;pointer-events:none;font-family:SimSun,宋体,serif;font-size:9pt';
    el.innerHTML = `<div style="text-align:center;font:700 24pt SimHei,黑体,sans-serif;line-height:1.35">${this.hospitalName}住院患者日常生活能力评估单</div>
      <div style="display:flex;gap:16px;font-size:13pt;line-height:1.3"><span>病区：</span><span>姓名：</span><span>床号：</span><span>住院号：</span><span>年龄：</span><span>性别：</span><span>诊断：</span></div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt"><thead>
      <tr><th style="border:1px solid #000;padding:2px 1px;height:28px;width:72px" rowspan="6">日期时间</th><th style="border:1px solid #000;padding:2px 1px;height:28px" colspan="12">日常生活能力评估（Barthel 指数）</th><th style="border:1px solid #000;padding:2px 1px;height:28px" rowspan="6">分级</th><th style="border:1px solid #000;padding:2px 1px;height:28px" rowspan="6">其他</th><th style="border:1px solid #000;padding:2px 1px;height:28px" rowspan="6">签名</th></tr>
      <tr><th style="border:1px solid #000;padding:2px 1px;height:28px">项目</th><th style="border:1px solid #000;height:28px">进食</th><th style="border:1px solid #000;height:28px">洗浴</th><th style="border:1px solid #000;height:28px">修饰</th><th style="border:1px solid #000;height:28px">穿[脱]衣</th><th style="border:1px solid #000;height:28px">控制大便</th><th style="border:1px solid #000;height:28px">控制小便</th><th style="border:1px solid #000;height:28px">如厕</th><th style="border:1px solid #000;height:28px">床椅移动</th><th style="border:1px solid #000;height:28px">平地行走</th><th style="border:1px solid #000;height:28px">上下楼梯</th><th style="border:1px solid #000;height:28px">总分</th></tr>
      <tr><th style="border:1px solid #000;height:28px">完全独立</th><td style="border:1px solid #000;height:28px">10</td><td>5</td><td>5</td><td>10</td><td>10</td><td>10</td><td>10</td><td>15</td><td>15</td><td>10</td><td style="border:1px solid #000;height:28px"></td></tr>
      <tr><th style="border:1px solid #000;height:28px">需部分帮助</th><td style="border:1px solid #000;height:28px">5</td><td>0</td><td>0</td><td>5</td><td>5偶尔</td><td>5偶尔</td><td>5</td><td>10</td><td>10</td><td>5</td><td style="border:1px solid #000;height:28px"></td></tr>
      <tr><th style="border:1px solid #000;height:28px">需极大帮助</th><td style="border:1px solid #000;height:28px">0</td><td></td><td></td><td>0</td><td>0失控</td><td>0失控</td><td>0</td><td>5</td><td>5</td><td>0</td><td style="border:1px solid #000;height:28px"></td></tr>
      <tr><th style="border:1px solid #000;height:28px">完全依赖</th><td style="border:1px solid #000;height:28px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td>0</td><td>0</td><td></td><td style="border:1px solid #000;height:28px"></td></tr>
      </thead></table>
      <div style="margin-top:6px;font-size:9.5pt;line-height:1.3">备注：</div>`;
    document.body.appendChild(el);
    const h = el.getBoundingClientRect().height;
    document.body.removeChild(el);
    return this.pxToMm(h);
  }

  private async measureAllRowHeights(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;width:297mm;pointer-events:none;font-family:SimSun,宋体,serif;font-size:9pt';
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt';
    table.innerHTML = '<tbody id="measure-body"></tbody>';
    container.appendChild(table);
    document.body.appendChild(container);
    const tbody = container.querySelector('#measure-body')!;
    for (const row of this.rows) {
      const tr = document.createElement('tr');
      tr.className = 'data-row';
      tr.innerHTML = `<td class="date-cell" style="border:1px solid #000;padding:2px 1px;width:72px;text-align:center;vertical-align:middle"><span class="dt-date" style="display:block;text-align:center;line-height:1.25">${this.fmtDate(row.time)}</span><span class="dt-time" style="display:block;text-align:center;line-height:1.25">${this.fmtTime(row.time)}</span></td>
        <td style="border:1px solid #000;height:28px"></td>
        ${ITEMS.map(it => `<td style="border:1px solid #000;height:28px;text-align:center">${this.itemVal(row, it.key)}</td>`).join('')}
        <td style="border:1px solid #000;height:28px;text-align:center">${row.total ?? ''}</td>
        <td style="border:1px solid #000;height:28px;text-align:center">${row.grade}</td>
        <td class="other-cell" style="border:1px solid #000;text-align:left;padding:3px 5px;white-space:normal;word-break:break-word;overflow-wrap:anywhere"><div style="min-height:22px;display:flex;align-items:center;white-space:normal;word-break:break-word">${row.other || ''}</div></td>
        <td style="border:1px solid #000;height:28px;text-align:center">${row.signName || ''}</td>`;
      tbody.appendChild(tr);
      const h = tr.getBoundingClientRect().height;
      map.set(row.time, this.pxToMm(h));
    }
    document.body.removeChild(container);
    return map;
  }

  private pxToMm(px: number): number {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-99999px;width:100mm;height:1px;visibility:hidden';
    document.body.appendChild(probe);
    const ppm = probe.getBoundingClientRect().width / 100;
    document.body.removeChild(probe);
    return ppm > 0 ? px / ppm : px / (96 / 25.4);
  }

  pagePaddedRows(page: RenderPage): (BarthelRow | null)[] {
    const rows = page.rows.slice();
    const MAX_ROWS = this.maxRowsPerPage;
    if (rows.length < MAX_ROWS) {
      for (let i = rows.length; i < MAX_ROWS; i++) rows.push(null as any);
    }
    return rows;
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
      .patient-info-row{display:flex;align-items:center;width:100%;gap:16px;font-size:12pt;font-weight:400;white-space:nowrap;margin:2px 0;color:#000;}
      .info-item{flex:0 0 auto;white-space:nowrap;}
      .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
      .record-table{width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:2px 1px;height:28px;word-break:break-all;vertical-align:middle;}
      .record-table th{background:transparent;font-weight:700;} .record-table th,.record-table td{color:#000;} .legend-row th,.legend-row td{font-weight:700;color:#000;} .record-table tr.data-row td{font-weight:400;}
      .date-col{width:56px;} .item-label-col{width:58px;} .total-col{width:38px;} .grade-col{width:56px;} .other-col{width:88px;} .sign-col{width:50px;}
      .legend-row th,.legend-row td{font-weight:700;color:#000;} .legend-level{font-weight:700;} .legend-blank{background:#f7f7f7;} .legend-total{background:#f7f7f7;}
      .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.25;}
      .other-cell{text-align:left;padding-left:5px;}
      .footnote{margin-top:6px;margin-bottom:10mm;font-size:8pt;line-height:1.3;text-align:left;}
      .footnote .fn{padding-left:2em;text-indent:-2em;margin:1px 0;}
      .review-sign{margin-top:6px;text-align:right;font-size:13pt;padding-right:6px;}
      .sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:4mm;margin:0;text-align:center;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    const doPrint = () => { win.focus(); win.print(); };
    const ready = () => { const doc = win.document as any; if (doc.fonts?.ready) { doc.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); }); } else { requestAnimationFrame(() => requestAnimationFrame(doPrint)); } };
    win.addEventListener('afterprint', () => { try { win.close(); } catch(e) {} });
    if ((win.document as any).readyState === 'complete') { ready(); } else { win.addEventListener('load', ready); }
  }

  fmtDate(v?: string): string { return formatShanghaiDate(v) || ''; }
  fmtTime(v?: string): string { return formatShanghaiTime(v) || ''; }

  private num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  private ts(v?: string): number { return databaseTimeValue(v) || 0; }
}
