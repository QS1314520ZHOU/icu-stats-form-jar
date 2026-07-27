/**
 * 住院患者压力性损伤评估及措施记录单（Braden）—— Angular 组件
 * 访问路径：/bradenForm
 */
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { formatShanghaiDate, formatShanghaiTime } from './form-date.util';

const SCORE_TYPE = 'bradenScore';

interface BradenOption { score: number; label: string; }
interface BradenItem { field: 'feel'|'damp'|'activityAbility'|'moveAbility'|'nutritionAbility'|'frictionAndShear'; title: string; options: BradenOption[]; }

const BRADEN_ITEMS: BradenItem[] = [
  { field:'feel',title:'感知能力',options:[{score:1,label:'完全受限'},{score:2,label:'非常受限'},{score:3,label:'轻微受限'},{score:4,label:'无损害'}] },
  { field:'damp',title:'潮湿度',options:[{score:1,label:'持续潮湿'},{score:2,label:'非常潮湿'},{score:3,label:'偶尔潮湿'},{score:4,label:'罕见潮湿'}] },
  { field:'activityAbility',title:'活动能力',options:[{score:1,label:'卧床不起'},{score:2,label:'能坐轮椅'},{score:3,label:'扶助行走'},{score:4,label:'活动自如'}] },
  { field:'moveAbility',title:'移动能力',options:[{score:1,label:'完全受限'},{score:2,label:'重度受限'},{score:3,label:'轻度受限'},{score:4,label:'不受限'}] },
  { field:'nutritionAbility',title:'营养摄取',options:[{score:1,label:'非常差'},{score:2,label:'可能不足'},{score:3,label:'充足'},{score:4,label:'良好'}] },
  { field:'frictionAndShear',title:'摩擦力/剪切力',options:[{score:1,label:'存在问题'},{score:2,label:'潜在问题'},{score:3,label:'不存在问题'},{score:4,label:'不存在问题'}] },
];

const MEASURE_COLUMNS = [
  { key:'bedClean',title:'床单元整洁',match:['bao10chi17chuang1pu2he19yi6ku5qing4jie14'] },
  { key:'skinClean',title:'皮肤清洁',match:['bao11chi2pi19fu17qing17jie19'] },
  { key:'turnOver',title:'定时翻身',match:['ding5shi2fan10shen2'] },
  { key:'airBed',title:'气垫床',match:['gei0yu5qi12dian13chuang16'] },
  { key:'pressureRelief',title:'减压用具',match:['gei2yu9jian12ya6yong1ju12'] },
  { key:'transparentPatch',title:'局部贴透明贴',match:['ju11bu11tie5tou0ming1tie17'] },
  { key:'nutrition',title:'营养支持',match:['jia2qiang17ying9yang5'] },
  { key:'other',title:'其他',match:['qi17ta5'] },
  { key:'vsd',title:'VSD负压吸引',match:['VSD3fu6ya14xi16yin11'] },
  { key:'dressing',title:'换药',match:['huan13yao2'] },
];

const FOOT_NOTES = [
  '轻度危险：15~18分；中度危险：13~14分；高度危险：10~12分；极高度危险：≤9分。',
  '院外带入或评分≤18分，采取预防措施。',
  '轻度危险、中度危险采取预防措施，评估与记录至少1次/周。',
  '有重要改变24小时内再次评估；高度危险、极高度危险保护护士长及伤口小组，采取预防措施，建立翻身卡并记录，评估与记录至少1次/天。',
];

interface ScoreRecord { time?: string; scoreType?: string; total?: number; conclusion?: string; valid?: boolean; inputUserId?: string; inputUser?: string; ohter?: string; nurseMeasureList?: any[]; bradenScore?: Record<string, any>; }
interface BradenRow { time: string; score: Record<string, any>; total: number | null; risk: string; other: string; nurseMeasureList: any[]; signUserId?: string; signName?: string; }
interface RenderPage { index: number; rows: BradenRow[]; }

@Component({
  standalone: false,
  selector: 'app-braden-form',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <label class="page-select">页码：<select [(ngModel)]="selectedPage"><option [ngValue]="null">全部</option><option *ngFor="let p of pages" [ngValue]="p.index">第 {{p.index}} 页</option></select></label>
        <button class="btn" type="button" (click)="print()">打印</button>
      </div>
    </div>

    <div *ngIf="loading" class="loading no-print">加载中…</div>

    <ng-container *ngFor="let page of pages">
      <section class="sheet" [class.sheet-hidden]="selectedPage !== null && selectedPage !== page.index">
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}住院患者压力性损伤评估及措施记录单</div>
          <div class="patient-info-row">
            <span class="info-item"><b>科室：</b>{{patient?.dept || patient?.deptName || ''}}</span>
            <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
            <span class="info-item"><b>床号：</b>{{patient?.hisBed || ''}}</span>
            <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
            <span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
            <span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
            <span class="info-item diagnosis-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
          </div>
        </div>

        <table class="record-table">
          <thead>
            <tr>
              <th rowspan="4" class="date-col">日期　时间</th>
              <th colspan="24">压疮风险评估</th>
              <th rowspan="4" class="total-col">总分</th>
              <th rowspan="4" class="risk-col">风险等级</th>
              <th colspan="10">预防压疮护理措施</th>
              <th rowspan="4" class="other-col">其他</th>
              <th rowspan="4" class="sign-col">签名</th>
            </tr>
            <tr>
              <ng-container *ngFor="let item of BRADEN_ITEMS"><th colspan="4">{{item.title}}</th></ng-container>
              <ng-container *ngFor="let m of MEASURE_COLUMNS"><th rowspan="3" class="measure-head"><span class="vtext">{{m.title}}</span></th></ng-container>
            </tr>
            <tr><ng-container *ngFor="let item of BRADEN_ITEMS"><th *ngFor="let opt of item.options" class="score-desc">{{opt.score}}</th></ng-container></tr>
            <tr><ng-container *ngFor="let item of BRADEN_ITEMS"><th *ngFor="let opt of item.options" class="option-head"><span class="vtext">{{opt.label}}</span></th></ng-container></tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of pagePaddedRows(page)">
              <td class="date-col"><span class="dt-date">{{r ? fmtDate(r.time) : ''}}</span><span class="dt-time">{{r ? fmtTime(r.time) : ''}}</span></td>
              <ng-container *ngFor="let item of BRADEN_ITEMS"><td *ngFor="let opt of item.options" class="score-cell">{{r ? bradenCheck(r, item.field, opt.score) : ''}}</td></ng-container>
              <td>{{r && r.total !== null ? r.total : ''}}</td>
              <td>{{r ? r.risk : ''}}</td>
              <ng-container *ngFor="let m of MEASURE_COLUMNS"><td class="measure-cell">{{r ? measureCheck(r, m) : ''}}</td></ng-container>
              <td class="other-cell">{{r ? r.other : ''}}</td>
              <td>{{r ? (r.signName || '') : ''}}</td>
            </tr>
          </tbody>
        </table>

        <div class="result-line">
          <span class="rl-item">结果：<span class="fill-val">{{resultText}}</span></span>
          <span class="rl-item">日期：<span class="fill-val">{{resultDate}}</span></span>
          <span class="rl-item pressure-radio">发送院内压疮：<span>{{hospitalPressureSore === '是' ? '☑' : '☐'}}是</span> <span>{{hospitalPressureSore === '否' ? '☑' : '☐'}}否</span></span>
        </div>

        <div class="footnote">
          <div class="fn-title">备注：</div>
          <div class="fn" *ngFor="let t of FOOT_NOTES">{{t}}</div>
        </div>

        <div class="sheet-pageno">第 {{page.index}} 页　共 {{pages.length}} 页</div>
      </section>
    </ng-container>
  `,
  styles: [`
    :host{display:block;background:#f0f2f5;height:100vh;overflow:auto}
    .toolbar{display:flex;justify-content:flex-end;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid #eee;position:sticky;top:0;z-index:50}
    .toolbar-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
    .page-select{font-family:'SimSun','宋体',serif;font-size:14px;white-space:nowrap}
    .btn{padding:5px 16px;border:1px solid #1890ff;background:#1890ff;color:#fff;border-radius:4px;cursor:pointer}
    .loading{padding:16px;font-family:'SimSun','宋体',serif}
    .sheet-hidden{display:none}
    .sheet{box-sizing:border-box;width:297mm;min-height:210mm;margin:16px auto;padding:8mm 10mm;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15);position:relative;color:#000}
    .sheet-head{text-align:center;padding-bottom:4px}
    .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:20pt;line-height:1.3}
    .patient-info-row{display:flex;align-items:center;width:100%;gap:12px;font-family:'SimSun','宋体',serif;font-size:11pt;font-weight:400;white-space:nowrap;margin:2px 0 4px;color:#000;text-align:left}
    .info-item{flex:0 0 auto;white-space:nowrap}
    .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .record-table{width:100%;border-collapse:collapse;font-family:'SimSun','宋体',serif;font-size:8.5pt;table-layout:fixed}
    .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:1px;word-break:break-all;vertical-align:middle;overflow:hidden}
    .record-table td{height:24px}
    .date-col{width:70px;min-width:70px;white-space:nowrap;word-break:normal}
    .total-col{width:28px}
    .risk-col{width:38px}
    .other-col{width:80px}
    .sign-col{width:44px}
    .score-desc{height:18px;font-size:8.5pt}
    .option-head{width:27px;height:86px}
    .measure-head{width:27px;height:92px}
    .score-cell{width:27px;font-size:9pt}
    .measure-cell{width:27px;font-size:10pt}
    .vtext{writing-mode:vertical-rl;text-orientation:upright;white-space:normal;line-height:1.05;letter-spacing:.5px;font-family:'SimSun','宋体',serif;font-size:8.5pt;font-weight:700}
    .dt-date,.dt-time{display:block;white-space:nowrap;word-break:normal;text-align:center;line-height:1.2}
    .other-cell{text-align:left;padding-left:3px}
    .result-line{display:flex;flex-wrap:wrap;gap:70px;margin-top:6px;align-items:center;font-family:'SimSun','宋体',serif;font-size:12pt}
    .rl-item{display:inline-flex;align-items:center}
    .pressure-radio{gap:10px}
    .fill-val{min-width:130px;border-bottom:1px solid #000;padding:0 6px;display:inline-block}
    .footnote{margin-top:5px;font-family:'SimSun','宋体',serif;font-size:9.5pt;line-height:1.25;text-align:left;margin-bottom:10mm}
    .footnote .fn-title{font-weight:700;display:inline}
    .footnote .fn{margin:0}
    .sheet-pageno{position:absolute;left:12mm;right:12mm;bottom:6mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:13pt;font-weight:400;line-height:1;color:#000;white-space:nowrap}
    @media screen{.sheet{zoom:var(--sheet-scale,1)}}
    @media print{:host{height:auto;overflow:visible}.no-print{display:none!important}.sheet-hidden{display:none!important}.sheet{width:297mm;height:210mm;overflow:hidden;margin:0;box-shadow:none;zoom:1;page-break-after:always}.sheet:last-of-type{page-break-after:auto}}
  `],
})
export class BradenFormComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  readonly BRADEN_ITEMS = BRADEN_ITEMS;
  readonly MEASURE_COLUMNS = MEASURE_COLUMNS;
  readonly FOOT_NOTES = FOOT_NOTES;

  loading = true;
  patient: any = null;
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';
  age: number | null = null;

  rows: BradenRow[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  resultText = '';
  resultDate = '';
  hospitalPressureSore = '';

  maxRowsPerPage = 17;

  private pid = '';
  private destroy$ = new Subject<void>();
  private ro?: ResizeObserver;
  private __lastPid: string | null = null;

  constructor(private http: HttpClient, private hostPatient: HostPatientService, private cdr: ChangeDetectorRef, private host: ElementRef) {}

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
        this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis || p.diagnosis);
      }),
      switchMap(({ pid }) => this.loadFromServer(pid)),
      takeUntil(this.destroy$),
    ).subscribe();
  }

  ngAfterViewInit(): void { this.fitScale(); this.ro = new ResizeObserver(() => this.fitScale()); this.ro.observe(this.host.nativeElement); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); this.ro?.disconnect(); }

  private resetForm(): void {
    this.rows = []; this.pages = []; this.selectedPage = null;
    this.resultText = ''; this.resultDate = ''; this.hospitalPressureSore = '';
    this.cdr.detectChanges();
  }

  private loadHospitalName(): void {
    this.http.get<any>(this.API_HOSPITAL).subscribe({
      next: res => { const name = res?.hospitalName || res?.name || res?.data?.hospitalName || res?.data?.name; if (name) this.hospitalName = String(name); },
      error: () => { this.hospitalName = '重钢总医院'; },
    });
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http.get<ScoreRecord[]>(this.API_SCORE, { params: { pid, scoreType: SCORE_TYPE } }).pipe(
      tap(res => {
        const list = Array.isArray(res) ? res : res ? [res as any] : [];
        this.buildRows(list.filter(r => r && r.valid === true && r.scoreType === SCORE_TYPE));
      }),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    );
  }

  private buildRows(records: ScoreRecord[]): void {
    const rows: BradenRow[] = records
      .filter(r => !!r.time)
      .map(r => ({
        time: r.time!, score: r.bradenScore || {},
        total: this.num(r.total), risk: r.conclusion || '',
        other: String(r.ohter ?? '').trim(),
        nurseMeasureList: r.nurseMeasureList || [],
        signUserId: r.inputUserId, signName: r.inputUser || '',
      }))
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));

    this.rows = rows;
    const latest = rows[rows.length - 1];
    if (latest) { this.resultText = latest.risk || ''; this.resultDate = this.fmtDate(latest.time); }

    const userIds = [...new Set(rows.map(r => r.signUserId).filter(Boolean) as string[])];
    if (userIds.length) {
      this.http.get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } }).subscribe({
        next: accounts => {
          const nameMap = new Map<string, string>();
          if (Array.isArray(accounts)) { for (const a of accounts) { const id = a?._id || a?.id || a?.accountId; const name = a?.trueName || a?.accountName || a?.name; if (id && name) nameMap.set(String(id), String(name)); } }
          for (const row of this.rows) { if (row.signUserId && nameMap.has(row.signUserId)) { row.signName = nameMap.get(row.signUserId) || row.signName; } }
          this.paginate();
        },
        error: () => { this.paginate(); },
      });
    } else { this.paginate(); }
  }

  bradenCheck(row: BradenRow, field: BradenItem['field'], score: number): string { return this.num(row.score?.[field]) === score ? String(score) : ''; }
  measureCheck(row: BradenRow, measure: (typeof MEASURE_COLUMNS)[number]): string {
    const list = Array.isArray(row.nurseMeasureList) ? row.nurseMeasureList : [];
    return list.some(m => m && m.value === true && measure.match.some(kw => String(m.code || '').trim().includes(kw))) ? '√' : '';
  }
  pagePaddedRows(page: RenderPage): (BradenRow | null)[] { const r: (BradenRow | null)[] = page.rows.slice(0, this.maxRowsPerPage); while (r.length < this.maxRowsPerPage) r.push(null); return r; }

  private paginate(): void {
    const per = this.maxRowsPerPage; const pages: RenderPage[] = [];
    if (!this.rows.length) { pages.push({ index: 1, rows: [] }); }
    else { for (let i = 0; i < this.rows.length; i += per) { pages.push({ index: pages.length + 1, rows: this.rows.slice(i, i + per) }); } }
    this.pages = pages;
    if (this.selectedPage !== null && this.selectedPage > pages.length) this.selectedPage = null;
  }

  fmtDate(time: string): string { return formatShanghaiDate(time); }
  fmtTime(time: string): string { return formatShanghaiTime(time); }
  genderText(g: any): string { const s = String(g ?? '').trim(); if (s === '1' || s === '男' || /^m$/i.test(s) || /^male$/i.test(s)) return '男性'; if (s === '2' || s === '女' || /^f$/i.test(s) || /^female$/i.test(s)) return '女性'; return s; }
  print(): void { window.print(); }

  private fitScale(): void { try { const w = this.host.nativeElement.clientWidth || window.innerWidth; this.host.nativeElement.style.setProperty('--sheet-scale', String(Math.min(1, Math.max(0.5, (w - 32) / (397 * 3.7795275591))))); } catch {} }
  private calcAge(b: any): number | null { if (!b) return null; const d = new Date(b); if (Number.isNaN(d.getTime())) return null; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); const m = n.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--; return a >= 0 && a < 150 ? a : null; }
  private formatDiagnosis(v: any): string { if (!v) return ''; if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : x?.name || x?.diagnosisName || x?.text || '').filter(Boolean).join('、'); if (typeof v === 'object') return v.name || v.diagnosisName || v.text || ''; return String(v); }
  private num(v: any): number | null { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
  private ts(t: string): number { const n = new Date(t).getTime(); return Number.isFinite(n) ? n : 0; }
}
