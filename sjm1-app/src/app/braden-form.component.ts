/**
 * 住院患者压力性损伤评估及措施记录单（Braden）—— Angular 组件
 * 访问路径：/bradenForm
 */
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { of } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { formatShanghaiDate, formatShanghaiTime } from './form-date.util';

const SCORE_TYPE = 'bradenScore';
const FORM_CODE = 'bradenForm';
const API_EXTRA_LATEST = '/api/v1/icu/fall-danger-extra/latest';
const API_EXTRA_SAVE = '/api/v1/icu/fall-danger-extra/save';

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
  { key:'turnOver',title:'定时翻身',match:['bao10chi17chuang1pu2he19yi6ku5qing4jie14'],showMeasures:'1' },
  { key:'bedCleanDry',title:'床单元整洁干燥',match:['bao11chi2pi19fu17qing17jie19'],showMeasures:'2' },
  { key:'airOrWaterMattress',title:'使用气垫床或水垫',match:['ding5shi2fan10shen2'],showMeasures:'3' },
  { key:'dressing',title:'使用敷料',match:['gei0yu5qi12dian13chuang16'],showMeasures:'4' },
  { key:'nutrition',title:'营养支持',match:['gei2yu9jian12ya6yong1ju12'],showMeasures:'5' },
  { key:'avoidShear',title:'避免拖、拉、推，防剪切力',match:['ju11bu11tie5tou0ming1tie17'],showMeasures:'6' },
  { key:'healthEducation',title:'健康教育',match:['jia2qiang17ying9yang5'],showMeasures:'7' },
  { key:'incontinenceCare',title:'两便失禁护理',match:['qi17ta5'],showMeasures:'8' },
  { key:'deviceRelated',title:'避免医疗器械相关性压疮因素',match:['VSD3fu6ya14xi16yin11'],showMeasures:'9' },
  { key:'changeDressing',title:'换药',match:['huan13yao2'],showMeasures:'10' },
];

const FOOT_NOTES = [
  '轻度危险：15~18分；中度危险：13~14分；高度危险：10~12分；极高度危险：≤9分。',
  '院外带入或评分≤18分，采取预防措施。',
  '轻度危险、中度危险采取预防措施，评估与记录至少1次/周。',
  '有重要改变24小时内再次评估；高度危险、极高度危险保护护士长及伤口小组，采取预防措施，建立翻身卡并记录，评估与记录至少1次/天。',
];

interface ScoreRecord { time?: any; scoreType?: string; total?: number; conclusion?: string; valid?: boolean; inputUserId?: string; inputUser?: string; ohter?: string; nurseMeasureList?: any[]; bradenScore?: Record<string, any>; }
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
            <span class="info-item"><b>科室：</b>{{patient?.dept || ''}}</span>
            <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
            <span class="info-item"><b>床号：</b>{{patient?.hisBed || ''}}</span>
            <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
            <span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
            <span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
            <span class="info-item diagnosis-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
          </div>
        </div>

        <table class="record-table">
          <thead>
            <tr>
              <th rowspan="6" class="date-col">日期　时间</th>
              <th colspan="7" class="group-head">压疮风险评估</th>
              <th rowspan="6" class="total-col">总分</th>
              <th rowspan="6" class="risk-col">风险等级</th>
              <th [attr.colspan]="MEASURE_COLUMNS.length" class="group-head">预防压疮护理措施</th>
              <th rowspan="6" class="other-col">其他</th>
              <th rowspan="6" class="sign-col">签名</th>
            </tr>
            <tr>
              <th class="score-index-col">分值</th>
              <th *ngFor="let item of BRADEN_ITEMS" class="braden-title-col">{{item.title}}</th>
              <ng-container *ngFor="let m of MEASURE_COLUMNS"><th rowspan="5" class="measure-head"><span class="vtext">{{m.title}}</span></th></ng-container>
            </tr>
            <tr *ngFor="let score of [1, 2, 3, 4]">
              <th class="score-index-col">{{score}}</th>
              <th *ngFor="let item of BRADEN_ITEMS" class="braden-desc-col">{{optionLabel(item, score)}}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of pagePaddedRows(page)">
              <td class="date-col"><span class="dt-date">{{r ? fmtDate(r.time) : ''}}</span><span class="dt-time">{{r ? fmtTime(r.time) : ''}}</span></td>
              <td class="score-index-col"></td>
              <td *ngFor="let item of BRADEN_ITEMS" class="score-cell">{{r ? bradenValue(r, item.field) : ''}}</td>
              <td class="total-col">{{r && r.total !== null ? r.total : ''}}</td>
              <td class="risk-col">{{r ? r.risk : ''}}</td>
              <ng-container *ngFor="let m of MEASURE_COLUMNS"><td class="measure-cell">{{r ? measureCheck(r, m) : ''}}</td></ng-container>
              <td class="other-cell">{{r ? r.other : ''}}</td>
              <td class="sign-col">{{r ? (r.signName || '') : ''}}</td>
            </tr>
          </tbody>
        </table>

        <div class="result-line">
          <span class="rl-item">结果：
            <input class="fill-input result-input no-print-input" [(ngModel)]="resultText" (ngModelChange)="scheduleSaveExtra()" />
            <span class="print-only fill-val">{{resultText}}</span>
          </span>
          <span class="rl-item">日期：
            <input class="fill-input date-input no-print-input" [(ngModel)]="resultDate" (ngModelChange)="scheduleSaveExtra()" placeholder="年/月/日" />
            <span class="print-only fill-val">{{resultDate}}</span>
          </span>
          <span class="rl-item pressure-radio">发送院内压疮：
            <label><input class="no-print-input" type="radio" name="hospitalPressureSore" value="是" [(ngModel)]="hospitalPressureSore" (ngModelChange)="scheduleSaveExtra()" /><span class="screen-only">是</span><span class="print-only">{{hospitalPressureSore === '是' ? '☑' : '☐'}}是</span></label>
            <label><input class="no-print-input" type="radio" name="hospitalPressureSore" value="否" [(ngModel)]="hospitalPressureSore" (ngModelChange)="scheduleSaveExtra()" /><span class="screen-only">否</span><span class="print-only">{{hospitalPressureSore === '否' ? '☑' : '☐'}}否</span></label>
          </span>
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
    .info-item b{font-weight:700}
    .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .record-table{width:100%;border-collapse:collapse;font-family:'SimSun','宋体',serif;font-size:8.5pt;table-layout:fixed}
    .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:1px 2px;word-break:break-all;vertical-align:middle;overflow:hidden;font-weight:400}
    .record-table th{height:18px;line-height:1.15}
    .record-table td{height:22px;line-height:1.15}
    .group-head{height:18px;font-weight:400}
    .date-col{width:74px;min-width:74px;white-space:nowrap;word-break:normal}
    .score-index-col{width:24px;min-width:24px}
    .braden-title-col{width:54px;min-width:54px;font-weight:400}
    .braden-desc-col{width:54px;min-width:54px;height:18px;line-height:1.1;font-size:8.5pt;white-space:normal}
    .score-cell{width:54px;min-width:54px;font-size:9pt}
    .total-col{width:28px;min-width:28px}
    .risk-col{width:42px;min-width:42px}
    .measure-head{width:42px;min-width:42px;height:92px}
    .measure-cell{width:42px;min-width:42px;font-size:10pt}
    .other-col{width:120px;min-width:120px}
    .other-cell{width:120px;min-width:120px;text-align:center;padding-left:2px}
    .sign-col{width:44px;min-width:44px}
    .vtext{writing-mode:vertical-rl;text-orientation:mixed;white-space:normal;line-height:1.05;letter-spacing:.5px;font-family:'SimSun','宋体',serif;font-size:10pt;font-weight:400;margin:0 auto}
    .dt-date,.dt-time{display:block;white-space:nowrap;word-break:normal;text-align:center;line-height:1.2}
    .result-line{display:flex;flex-wrap:wrap;gap:70px;margin-top:6px;align-items:center;font-family:'SimSun','宋体',serif;font-size:12pt}
    .rl-item{display:inline-flex;align-items:center}
    .pressure-radio{gap:10px}
    .fill-input{width:130px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;font-family:'SimSun','宋体',serif;font-size:12pt;background:#fff}
    .date-input{width:120px}
    .result-input{width:150px}
    .fill-val{min-width:130px;border-bottom:1px solid #000;padding:0 6px;display:inline-block}
    .print-only{display:none}
    .screen-only{display:inline}
    .footnote{margin-top:5px;font-family:'SimSun','宋体',serif;font-size:9.5pt;line-height:1.25;text-align:left;margin-bottom:10mm}
    .footnote .fn-title{font-weight:700;display:inline}
    .footnote .fn{margin:0}
    .sheet-pageno{position:absolute;left:12mm;right:12mm;bottom:6mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:13pt;font-weight:400;line-height:1;color:#000;white-space:nowrap}
    @media screen{.sheet{zoom:var(--sheet-scale,1)}}
    @media print{
      :host{height:auto;overflow:visible}
      .no-print{display:none!important}
      .no-print-input{display:none!important}
      .sheet-hidden{display:none!important}
      .sheet{width:297mm;height:210mm;overflow:hidden;margin:0;box-shadow:none;zoom:1;page-break-after:always}
      .sheet:last-of-type{page-break-after:auto}
      .print-only{display:inline!important}
      .screen-only{display:none!important}
    }
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
  private extraId: string | null = null;
  private destroy$ = new Subject<void>();
  private ro?: ResizeObserver;
  private __lastPid: string | null = null;
  private extraSave$ = new Subject<void>();

  constructor(private http: HttpClient, private hostPatient: HostPatientService, private cdr: ChangeDetectorRef, private host: ElementRef) {}

  ngOnInit(): void {
    this.loadHospitalName();

    // auto-save debounce
    this.extraSave$.pipe(
      debounceTime(500),
      switchMap(() => this.saveExtra()),
      takeUntil(this.destroy$),
    ).subscribe();

    this.hostPatient.patient$.pipe(
      filter(p => !!p),
      map(p => ({ p, pid: this.getPatientPid(p) })),
      tap(({ pid }) => { if (pid !== this.__lastPid) this.__lastPid = pid; }),
      distinctUntilChanged((a, b) => a.pid === b.pid),
      tap(({ p, pid }) => {
        this.resetForm();
        this.patient = p;
        this.pid = pid;
        this.age = this.calcAge(p.birthday);
        this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis || p.diagnosis);
      }),
      switchMap(({ pid }) => {
        if (!pid) {
          this.loading = false;
          this.pages = [{ index: 1, rows: [] }];
          this.cdr.detectChanges();
          return [];
        }
        return this.loadFromServer(pid);
      }),
      takeUntil(this.destroy$),
    ).subscribe();
  }

  ngAfterViewInit(): void { this.fitScale(); this.ro = new ResizeObserver(() => this.fitScale()); this.ro.observe(this.host.nativeElement); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); this.ro?.disconnect(); }

  /** Compatible PID extraction */
  private getPatientPid(p: any): string {
    return String(p?.id ?? p?._id ?? p?.pid ?? p?.patientId ?? p?.patientID ?? p?.patient?.id ?? p?.patient?._id ?? '').trim();
  }

  /** Normalize various time formats to ISO string */
  private normalizeTime(v: any): string {
    if (!v) return '';
    if (typeof v === 'number') { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); }
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object' && v.$date) return this.normalizeTime(v.$date);
    return String(v);
  }

  private resetForm(): void {
    this.rows = []; this.pages = []; this.selectedPage = null;
    this.resultText = ''; this.resultDate = ''; this.hospitalPressureSore = '';
    this.extraId = null;
    this.cdr.detectChanges();
  }

  private loadHospitalName(): void {
    this.http.get<any>(this.API_HOSPITAL).subscribe({
      next: res => { const name = res?.hospitalName || res?.name || res?.data?.hospitalName || res?.data?.name; if (name) this.hospitalName = String(name); },
      error: () => {},
    });
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http.get<ScoreRecord[]>(this.API_SCORE, { params: { pid, scoreType: SCORE_TYPE } }).pipe(
      tap(res => {
        const list = Array.isArray(res) ? res : res ? [res as any] : [];
        this.buildRows(list.filter(r => r && r.valid === true && r.scoreType === SCORE_TYPE));
      }),
      finalize(() => {
        this.loading = false;
        this.loadExtra(pid);
        this.cdr.detectChanges();
      }),
    );
  }

  private buildRows(records: ScoreRecord[]): void {
    const rows: BradenRow[] = records
      .map(r => ({
        time: this.normalizeTime(r.time),
        score: r.bradenScore || {},
        total: this.num(r.total),
        risk: r.conclusion || '',
        other: String(r.ohter ?? '').trim(),
        nurseMeasureList: r.nurseMeasureList || [],
        signUserId: r.inputUserId,
        signName: r.inputUser || '',
      }))
      .filter(r => !!r.time)
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));

    this.rows = rows;

    // Default result/date from latest record (only if not already set by extra)
    const latest = rows[rows.length - 1];
    if (latest) {
      if (!this.resultText) this.resultText = latest.risk || '';
      if (!this.resultDate) this.resultDate = this.fmtDate(latest.time);
    }

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

  /** Load extra data (result/date/hospitalPressureSore) */
  private loadExtra(pid: string): void {
    this.http.get<any>(API_EXTRA_LATEST, { params: { pid, formCode: FORM_CODE } }).pipe(takeUntil(this.destroy$)).subscribe({
      next: d => {
        if (pid !== this.pid) return;
        if (d) {
          this.extraId = d.id || d._id || null;
          const ej = d.extraJson || {};
          if (d.resultText || d.result) this.resultText = d.resultText || d.result || '';
          else if (ej.resultText || ej.result) this.resultText = ej.resultText || ej.result || '';
          if (d.resultDate) this.resultDate = d.resultDate || '';
          else if (ej.resultDate) this.resultDate = ej.resultDate || '';
          if (d.hospitalPressureSore || d.pressureSore) this.hospitalPressureSore = d.hospitalPressureSore || d.pressureSore || '';
          else if (ej.hospitalPressureSore || ej.pressureSore) this.hospitalPressureSore = ej.hospitalPressureSore || ej.pressureSore || '';
        }
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  scheduleSaveExtra(): void { this.extraSave$.next(); }

  private saveExtra() {
    if (!this.pid) return of(null);
    const body: any = {
      pid: this.pid,
      formCode: FORM_CODE,
      result: this.resultText,
      resultText: this.resultText,
      resultDate: this.resultDate,
      hospitalPressureSore: this.hospitalPressureSore,
      pressureSore: this.hospitalPressureSore,
      extraJson: {
        resultText: this.resultText,
        resultDate: this.resultDate,
        hospitalPressureSore: this.hospitalPressureSore,
      },
    };
    if (this.extraId) { body.id = this.extraId; body._id = this.extraId; }
    return this.http.post<any>(API_EXTRA_SAVE, body).pipe(
      tap(res => { if (res?.id || res?._id) this.extraId = res.id || res._id; }),
      finalize(() => this.cdr.detectChanges()),
    );
  }

  optionLabel(item: BradenItem, score: number): string { return item.options.find(o => o.score === score)?.label || ''; }
  bradenValue(row: BradenRow, field: BradenItem['field']): string { const n = this.num(row.score?.[field]); return n === null ? '' : String(n); }
  turnOverCheck(row: BradenRow): string {
    const list = Array.isArray(row.nurseMeasureList) ? row.nurseMeasureList : [];
    return list.some(m => m && m.value === true && String(m.code || '').trim().includes('ding5shi2fan10shen2')) ? '√' : '';
  }
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
