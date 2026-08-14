/**
 * 住院患者压力性损伤评估及措施记录单（Braden）—— Angular 组件
 * 访问路径：/bradenForm
 */
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { of, Subject } from 'rxjs';
import { catchError, filter, finalize, map, retry, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { formatShanghaiDate, formatShanghaiTime } from './form-date.util';
import { normalizePrintPages, shouldPrintPage } from './form-print-pages.util';

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
interface BradenRow { time: string; bradenScore: Record<BradenItem['field'], number | null>; total: number | null; risk: string; other: string; nurseMeasureList: any[]; signUserId?: string; signName?: string; }
interface RenderPage { index: number; rows: BradenRow[]; }
interface PageExtraData { id: string | null; result: string; resultDate: string; happened: '' | '是' | '否'; loaded: boolean; loading: boolean; }

@Component({
  standalone: false,
  selector: 'app-braden-form',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <app-print-page-multi-select
          [totalPages]="pages.length"
          [(selectedPages)]="selectedPrintPages"
          [disabled]="loading"
        ></app-print-page-multi-select>
        <button class="btn" type="button" (click)="print()">打印</button>
      </div>
    </div>

    <div *ngIf="loading" class="loading no-print">加载中…</div>

    <ng-container *ngFor="let page of pages">
      <section class="sheet" [class.sheet-hidden]="!isPrintPageSelected(page.index)" [class.last-sheet]="page.index === pages.length">
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}住院患者压力性损伤评估及措施记录单</div>
          <div class="patient-info-row">
            <span class="info-item"><b>科室：</b>{{patient?.dept || patient?.deptName || patient?.departmentName || patient?.wardName || ''}}</span>
            <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
            <span class="info-item"><b>床号：</b>{{ (patient?.hisBed || patient?.bedNo) ? ((patient?.hisBed || patient?.bedNo).endsWith('床') ? (patient?.hisBed || patient?.bedNo) : (patient?.hisBed || patient?.bedNo) + '床') : '' }}</span>
            <span class="info-item"><b>住院号：</b>{{patient?.mrn || patient?.hospitalNo || ''}}</span>
            <span class="info-item"><b>年龄：</b>{{age ?? patient?.age ?? ''}}</span>
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
          <label class="rl-item">
            <span>结果：</span>
            <input class="result-combo screen-only" type="text" [attr.list]="'braden-result-options-' + page.index" [(ngModel)]="pageExtra(page.index).result" (ngModelChange)="scheduleSavePageExtra(page.index)" placeholder="请选择或输入" autocomplete="off" />
            <datalist [id]="'braden-result-options-' + page.index"><option value="出院"></option><option value="死亡"></option></datalist>
            <span class="fill-val print-only">{{ pageExtra(page.index).result }}</span>
          </label>
          <label class="rl-item">
            <span>时间：</span>
            <input class="result-datetime screen-only" type="datetime-local" [(ngModel)]="pageExtra(page.index).resultDate" (ngModelChange)="scheduleSavePageExtra(page.index)" />
            <span class="fill-val print-only">{{ pageExtra(page.index).resultDate ? pageExtra(page.index).resultDate.replace('T', ' ') : '' }}</span>
          </label>
          <div class="rl-item pressure-radio">
            <span>发生院内压力性损伤：</span>
            <label class="screen-only"><input type="radio" [name]="'braden-pressure-' + page.index" value="是" [(ngModel)]="pageExtra(page.index).happened" (ngModelChange)="scheduleSavePageExtra(page.index)" /> 是</label>
            <label class="screen-only"><input type="radio" [name]="'braden-pressure-' + page.index" value="否" [(ngModel)]="pageExtra(page.index).happened" (ngModelChange)="scheduleSavePageExtra(page.index)" /> 否</label>
            <span class="print-only">是 {{ pageExtra(page.index).happened === '是' ? '☑' : '☐' }}&nbsp;&nbsp;否 {{ pageExtra(page.index).happened === '否' ? '☑' : '☐' }}</span>
          </div>
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
    .record-table{width:100%;border-collapse:collapse;table-layout:fixed;font-family:'SimSun','宋体',serif;font-size:12px;font-weight:400;font-style:normal;color:#000;text-shadow:none;text-rendering:auto;-webkit-font-smoothing:auto;font-synthesis:none}
    .record-table th,.record-table td{box-sizing:border-box;border:1px solid #000;text-align:center;vertical-align:middle;padding:1px 2px;overflow:hidden;font-family:'SimSun','宋体',serif;font-size:12px;font-weight:400;font-style:normal;color:#000;text-shadow:none;text-rendering:auto;-webkit-font-smoothing:auto;transform:none;filter:none;opacity:1;font-synthesis:none}
    .record-table th{height:18px;line-height:1.15}
    .record-table td{height:22px;line-height:1.15}
    .group-head{height:18px;font-weight:400}
    .date-col{width:74px;min-width:74px;white-space:nowrap;word-break:normal}
    .score-index-col{width:24px;min-width:24px}
    .braden-title-col{width:54px;min-width:54px;font-weight:400}
    .braden-desc-col{width:54px;min-width:54px;height:18px;line-height:1.1;font-size:12px;white-space:normal}
    .score-cell{width:54px;min-width:54px;font-size:12px}
    .total-col{width:28px;min-width:28px}
    .risk-col{width:42px;min-width:42px}
    .measure-head{width:42px;min-width:42px;height:92px}
    .measure-cell{width:42px;min-width:42px;font-size:12px}
    .other-col{width:120px;min-width:120px}
    .other-cell{width:120px;min-width:120px;text-align:center;padding-left:2px}
    .sign-col{width:44px;min-width:44px}
    .vtext{display:inline-block;writing-mode:vertical-lr;text-orientation:upright;white-space:normal;line-height:14px;letter-spacing:0;font-family:'SimSun','宋体',serif;font-size:12px;font-weight:400;font-style:normal;color:#000;text-shadow:none;text-rendering:auto;-webkit-font-smoothing:auto;transform:none;filter:none;opacity:1;margin:0 auto}
    .dt-date,.dt-time{display:block;white-space:nowrap;word-break:normal;text-align:center;line-height:1.2}
    .result-line{display:flex;flex-wrap:wrap;gap:70px;margin-top:6px;align-items:center;font-family:'SimSun','宋体',serif;font-size:12pt}
    .rl-item{display:inline-flex;align-items:center}
    .pressure-radio{gap:10px}
    .fill-input{width:130px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;font-family:'SimSun','宋体',serif;font-size:12pt;background:#fff}
    .date-picker{width:125px;border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;padding:0 4px;font-family:'SimSun','宋体',serif;font-size:12pt}
    .date-picker:focus{border:0!important;outline:0!important;box-shadow:none!important}
    .result-input{width:150px}
    .fill-val{min-width:130px;border-bottom:1px solid #000;padding:0 6px;display:inline-block}
    .print-only{display:none}
    .screen-only{display:inline}
    .result-combo{box-sizing:border-box;width:160px;height:28px;padding:2px 26px 2px 6px;border:1px solid #999;border-radius:3px;background:#fff;color:#000;font:inherit}
    .result-combo:focus{border-color:#1677ff;outline:1px solid #1677ff;outline-offset:-1px}
    .result-datetime{box-sizing:border-box;width:190px;height:28px;padding:2px 5px;border:1px solid #999;border-radius:3px;background:#fff;color:#000;font:inherit}
    .result-line input[type="radio"]{width:14px;height:14px;margin:0 3px 0 10px;vertical-align:middle}
    .footnote{margin-top:5px;font-family:'SimSun','宋体',serif;font-size:9.5pt;line-height:1.25;text-align:left;margin-bottom:10mm}
    .footnote .fn-title{font-weight:700;display:inline}
    .footnote .fn{margin:0}
    .sheet-pageno{position:absolute;right:0;bottom:35px;left:0;width:auto;margin:0;padding:0;box-sizing:border-box;text-align:center;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;pointer-events:none;z-index:20}
    @media screen{.sheet{width:calc(100vw - 32px);max-width:297mm;min-width:980px;zoom:1!important;transform:none!important}}
    @media print{
      @page{size:A4 landscape;margin:0}
      :host{display:block;width:297mm;height:auto;margin:0!important;padding:0!important;overflow:visible}
      .no-print{display:none!important}
      .no-print-input{display:none!important}
      .sheet-hidden{display:none!important}
      .sheet{box-sizing:border-box;width:297mm!important;min-width:0!important;max-width:297mm!important;height:209mm!important;min-height:209mm!important;max-height:209mm!important;margin:0!important;padding:7mm 10mm!important;overflow:hidden!important;zoom:1!important;transform:none!important;filter:none!important;box-shadow:none!important;page-break-before:auto;page-break-inside:avoid;break-inside:avoid-page;page-break-after:always;break-after:page}
      .sheet.last-sheet{page-break-after:auto!important;break-after:auto!important}
      .record-table,.record-table th,.record-table td{font-family:'SimSun','宋体',serif!important;transform:none!important;filter:none!important;text-shadow:none!important;-webkit-font-smoothing:antialiased}
      .record-table th{height:18px}
      .record-table td{height:22px}
      .footnote{margin-bottom:6mm}
      .result-line{margin-top:5px}
      .print-only{display:inline!important}
      .screen-only{display:none!important}
      .result-combo,.result-datetime,.result-line input[type="radio"]{display:none!important}
    }
  `],
})
export class BradenFormComponent implements OnInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  readonly BRADEN_ITEMS = BRADEN_ITEMS;
  readonly MEASURE_COLUMNS = MEASURE_COLUMNS;
  readonly FOOT_NOTES = FOOT_NOTES;

  readonly maxRowsPerPage = 10;

  loading = true;
  patient: any = null;
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';
  age: number | null = null;

  rows: BradenRow[] = [];
  pages: RenderPage[] = [];
  selectedPrintPages: number[] = [];

  readonly resultOptions = ['出院', '死亡'];
  private pageExtraMap = new Map<number, PageExtraData>();
  private pageSaveTimers = new Map<number, ReturnType<typeof setTimeout>>();

  private pid = '';
  private destroy$ = new Subject<void>();
  private componentPatient$ = new Subject<any>();

  private bradenHostMessageHandler = (event: MessageEvent) => {
    const raw: any = event?.data;
    if (!raw || raw.type !== 'SmartCare' || !raw.patient) return;
    const pid = this.getPatientPid(raw.patient);
    if (!pid) return;
    this.ngZone.run(() => { this.componentPatient$.next(raw.patient); });
  };

  constructor(
    private http: HttpClient,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.loadHospitalName();

    window.addEventListener('message', this.bradenHostMessageHandler);

    // 主患者流
    this.componentPatient$.pipe(
      filter(p => !!p),
      map(p => ({ p, pid: this.getPatientPid(p) })),
      filter(x => !!x.pid),
      switchMap(({ p, pid }) => this.activatePatient(p, pid)),
      takeUntil(this.destroy$),
    ).subscribe({
      error: err => {
        console.error('[bradenForm] patient stream error', err);
        this.loading = false;
        this.ensureBlankPage();
        this.cdr.detectChanges();
      },
    });

    // 转发 HostPatientService 的患者到 componentPatient$
    this.hostPatient.patient$.pipe(
      filter(p => !!p),
      takeUntil(this.destroy$),
    ).subscribe(p => this.componentPatient$.next(p));

    // 主动读取当前缓存患者
    const current = this.hostPatient.getPatient();
    if (current) this.componentPatient$.next(current);

    const buffered = (window as any).__scMsg;
    if (buffered?.patient) this.componentPatient$.next(buffered.patient);

    if (!current && !buffered?.patient) {
      try { parent.postMessage({ type: 'SmartCareReady' }, '*'); } catch {}
    }
  }

  ngOnDestroy(): void { window.removeEventListener('message', this.bradenHostMessageHandler); this.destroy$.next(); this.destroy$.complete(); }

  private getPatientPid(p: any): string {
    return String(p?.id ?? p?._id ?? p?.pid ?? p?.patientId ?? p?.patientID ?? p?.patient?.id ?? p?.patient?._id ?? '').trim();
  }

  private activatePatient(patient: any, pid: string) {
    this.patient = patient;
    this.pid = pid;
    this.age = this.calcAge(patient?.birthday);
    this.diagnosisDisplay = this.formatDiagnosis(patient?.clinicalDiagnosis || patient?.diagnosis);
    this.resetPatientData();
    this.ensureBlankPage();
    this.loading = true;
    this.cdr.detectChanges();
    return this.loadFromServer(pid).pipe(
      catchError(err => {
        console.error('[bradenForm] score load failed', { pid, err });
        if (pid === this.pid) { this.rows = []; this.ensureBlankPage(); this.loading = false; this.cdr.detectChanges(); }
        return of(null);
      })
    );
  }

  private resetPatientData(): void {
    this.rows = []; this.pages = []; this.selectedPrintPages = [];
    this.pageSaveTimers.forEach(timer => clearTimeout(timer));
    this.pageSaveTimers.clear();
    this.pageExtraMap.clear();
  }

  private ensureBlankPage(): void {
    if (!this.pages.length) { this.pages = [{ index: 1, rows: [] }]; }
  }

  private normalizeTime(v: any): string {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); }
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object' && v.$date) return this.normalizeTime(v.$date);
    return String(v);
  }

  private getBradenScoreDetail(score: any): any {
    if (!score || score.scoreType !== SCORE_TYPE) return null;
    let detail = score?.[score.scoreType] ?? score?.bradenScore ?? score?.score?.bradenScore ?? score?.data?.bradenScore ?? null;
    if (typeof detail === 'string') { try { detail = JSON.parse(detail); } catch { /* ignore */ } }
    return detail;
  }

  private normalizeBradenScore(source: any): Record<BradenItem['field'], number | null> {
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch {
        try {
          const norm = source.replace(/Int32\(\s*["']?(-?\d+)["']?\s*\)/gi, '$1').replace(/NumberInt\(\s*["']?(-?\d+)["']?\s*\)/gi, '$1').replace(/(?:Int64|Long)\(\s*["']?(-?\d+)["']?\s*\)/gi, '$1');
          source = JSON.parse(norm);
        } catch { source = {}; }
      }
    }
    source = source || {};
    return {
      feel: this.num(source.feel), damp: this.num(source.damp), activityAbility: this.num(source.activityAbility),
      moveAbility: this.num(source.moveAbility), nutritionAbility: this.num(source.nutritionAbility), frictionAndShear: this.num(source.frictionAndShear),
    };
  }

  private extractScoreList(res: any): ScoreRecord[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.records)) return res.records;
    if (Array.isArray(res?.content)) return res.content;
    if (Array.isArray(res?.list)) return res.list;
    if (res && typeof res === 'object') return [res];
    return [];
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http.get<any>(this.API_SCORE, { params: { pid, scoreType: SCORE_TYPE } }).pipe(
      retry(2),
      tap(res => {
        if (pid !== this.pid) return;
        const list = this.extractScoreList(res);
        const validRows = list.filter(r => r && (r.valid === true || String(r.valid) === 'true') && r.scoreType === SCORE_TYPE);
        this.buildRows(validRows);
      }),
      catchError(err => {
        console.error('[bradenForm] score API failed', { pid, err });
        if (pid === this.pid) { this.rows = []; this.paginate(); }
        return of(null);
      }),
      finalize(() => {
        if (pid === this.pid) { this.loading = false; this.ensureBlankPage(); this.cdr.detectChanges(); }
      }),
    );
  }

  private buildRows(records: ScoreRecord[]): void {
    const rows: BradenRow[] = records
      .map(score => {
        const detail = this.getBradenScoreDetail(score);
        return {
          time: this.normalizeTime(score.time),
          bradenScore: this.normalizeBradenScore(detail),
          total: this.num(score.total),
          risk: String(score.conclusion || ''),
          other: String(score.ohter ?? '').trim(),
          nurseMeasureList: (score as any).nurseMeasureList || (score as any).measuresList || [],
          signUserId: score.inputUserId,
          signName: score.inputUser || '',
        };
      })
      .filter(r => !!r.time)
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));

    this.rows = rows;
    this.paginate();
    this.resolveSignerNames(rows);
    this.cdr.detectChanges();
  }

  private resolveSignerNames(rows: BradenRow[]): void {
    const userIds = [...new Set(rows.map(r => r.signUserId).filter(Boolean) as string[])];
    if (!userIds.length) return;
    this.http.get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: accounts => {
          const nameMap = new Map<string, string>();
          if (Array.isArray(accounts)) {
            for (const a of accounts) {
              const id = a?._id || a?.id || a?.accountId;
              const name = a?.trueName || a?.accountName || a?.name;
              if (id && name) nameMap.set(String(id), String(name));
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
        error: () => {},
      });
  }

  private loadPageExtra(pageIndex: number): void {
    if (!this.pid) return;
    const extra = this.pageExtra(pageIndex);
    if (extra.loaded || extra.loading) return;
    const requestPid = this.pid;
    const formCode = this.pageFormCode(pageIndex);
    extra.loading = true;
    this.http.get<any>(API_EXTRA_LATEST, { params: { pid: requestPid, formCode } })
      .pipe(
        catchError(error => {
          console.error('[bradenForm] load page extra failed', { pid: requestPid, pageIndex, formCode, error });
          return of(null);
        }),
        finalize(() => {
          if (requestPid !== this.pid) return;
          const current = this.pageExtraMap.get(pageIndex);
          if (current) { current.loading = false; current.loaded = true; }
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe(data => {
        if (requestPid !== this.pid) return;
        const current = this.pageExtra(pageIndex);
        current.id = data?.id ? String(data.id) : null;
        current.result = String(data?.result ?? '');
        current.resultDate = this.normalizeDateTimeInput(data?.resultDate);
        const happened = String(data?.fell ?? '');
        current.happened = happened === '是' || happened === '否' ? happened : '';
      });
  }

  scheduleSavePageExtra(pageIndex: number): void {
    if (!this.pid) return;
    const oldTimer = this.pageSaveTimers.get(pageIndex);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(() => {
      this.pageSaveTimers.delete(pageIndex);
      this.savePageExtra(pageIndex);
    }, 500);
    this.pageSaveTimers.set(pageIndex, timer);
  }

  private savePageExtra(pageIndex: number): void {
    if (!this.pid) return;
    const extra = this.pageExtra(pageIndex);
    if (extra.loading) return;
    const requestPid = this.pid;
    const body: any = {
      pid: requestPid,
      formCode: this.pageFormCode(pageIndex),
      result: extra.result.trim(),
      resultDate: extra.resultDate || '',
      fell: extra.happened || '',
    };
    if (extra.id) body.id = extra.id;
    this.http.post<any>(API_EXTRA_SAVE, body)
      .pipe(
        catchError(error => {
          console.error('[bradenForm] save page extra failed', { pageIndex, body, error });
          return of(null);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe(response => {
        if (requestPid !== this.pid) return;
        if (response?.id) this.pageExtra(pageIndex).id = String(response.id);
      });
  }

  private normalizeDateTimeInput(value: any): string {
    if (!value) return '';
    const text = String(value).trim();
    const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}))?/);
    if (!match) return '';
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    const hour = (match[4] || '00').padStart(2, '0');
    const minute = (match[5] || '00').padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }


  optionLabel(item: BradenItem, score: number): string { return item.options.find(o => o.score === score)?.label || ''; }
  bradenValue(row: BradenRow, field: BradenItem['field']): string { const v = this.num(row?.bradenScore?.[field]); return v === null ? '' : String(v); }
  measureCheck(row: BradenRow, measure: (typeof MEASURE_COLUMNS)[number]): string {
    const list = Array.isArray(row.nurseMeasureList) ? row.nurseMeasureList : [];
    return list.some(m => m && m.value === true && measure.match.some(kw => String(m.code || '').trim().includes(kw))) ? '√' : '';
  }
  pagePaddedRows(page: RenderPage): (BradenRow | null)[] { const r: (BradenRow | null)[] = page.rows.slice(0, this.maxRowsPerPage); while (r.length < this.maxRowsPerPage) r.push(null); return r; }

  pageExtra(pageIndex: number): PageExtraData {
    let data = this.pageExtraMap.get(pageIndex);
    if (!data) {
      data = { id: null, result: '', resultDate: '', happened: '', loaded: false, loading: false };
      this.pageExtraMap.set(pageIndex, data);
    }
    return data;
  }

  private pageFormCode(pageIndex: number): string {
    return `${FORM_CODE}:page:${pageIndex}`;
  }

  private paginate(): void {
    const per = this.maxRowsPerPage;
    const pages: RenderPage[] = [];
    if (!this.rows.length) { pages.push({ index: 1, rows: [] }); }
    else { for (let i = 0; i < this.rows.length; i += per) { pages.push({ index: pages.length + 1, rows: this.rows.slice(i, i + per) }); } }
    this.pages = pages;
    this.normalizeSelectedPrintPages(pages.length);
    this.syncPageExtras();
  }

  private syncPageExtras(): void {
    const validPageIndexes = new Set(this.pages.map(page => page.index));
    for (const pageIndex of [...this.pageExtraMap.keys()]) {
      if (!validPageIndexes.has(pageIndex)) {
        const timer = this.pageSaveTimers.get(pageIndex);
        if (timer) clearTimeout(timer);
        this.pageSaveTimers.delete(pageIndex);
        this.pageExtraMap.delete(pageIndex);
      }
    }
    for (const page of this.pages) {
      this.pageExtra(page.index);
      this.loadPageExtra(page.index);
    }
  }

  fmtDate(time: string): string { return formatShanghaiDate(time); }
  fmtTime(time: string): string { return formatShanghaiTime(time); }
  genderText(g: any): string { const s = String(g ?? '').trim(); if (s === '1' || s === '男' || /^m$/i.test(s) || /^male$/i.test(s)) return '男性'; if (s === '2' || s === '女' || /^f$/i.test(s) || /^female$/i.test(s)) return '女性'; return s; }
  isPrintPageSelected(pageNumber: number, totalPages = this.pages.length): boolean {
    return shouldPrintPage(pageNumber, this.selectedPrintPages, totalPages);
  }
  private normalizeSelectedPrintPages(totalPages: number): void {
    const normalized = normalizePrintPages(this.selectedPrintPages, totalPages);
    this.selectedPrintPages = (normalized.length === totalPages && totalPages > 0) ? [] : normalized;
  }

  print(): void { window.print(); }

  private loadHospitalName(): void {
    this.http.get<any>(this.API_HOSPITAL).subscribe({
      next: res => { const name = res?.hospitalName || res?.name || res?.data?.hospitalName || res?.data?.name; if (name) this.hospitalName = String(name); },
      error: () => {},
    });
  }

  private calcAge(b: any): number | null { if (!b) return null; const d = new Date(b); if (Number.isNaN(d.getTime())) return null; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); const m = n.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--; return a >= 0 && a < 150 ? a : null; }
  private formatDiagnosis(v: any): string { if (!v) return ''; if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : x?.name || x?.diagnosisName || x?.text || '').filter(Boolean).join('、'); if (typeof v === 'object') return v.name || v.diagnosisName || v.text || ''; return String(v); }
  private num(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const text = value.trim();
      const direct = Number(text);
      if (Number.isFinite(direct)) return direct;
      const int32Match = text.match(/^Int32\(\s*["']?(-?\d+)["']?\s*\)$/i);
      if (int32Match) return Number(int32Match[1]);
      const numberIntMatch = text.match(/^NumberInt\(\s*["']?(-?\d+)["']?\s*\)$/i);
      if (numberIntMatch) return Number(numberIntMatch[1]);
      const longMatch = text.match(/^(?:Long|Int64)\(\s*["']?(-?\d+)["']?\s*\)$/i);
      if (longMatch) return Number(longMatch[1]);
      return null;
    }
    if (typeof value === 'object') {
      const c = [value.$numberInt, value.$numberLong, value.value, value.int, value.data];
      for (const x of c) { if (x !== null && x !== undefined && x !== '') { const parsed = this.num(x); if (parsed !== null) return parsed; } }
      try { const prim = value.valueOf(); if (prim !== value && prim !== null && prim !== undefined) { const p = this.num(prim); if (p !== null) return p; } } catch {}
      try { const txt = value.toString(); if (txt && txt !== '[object Object]') { const p = this.num(txt); if (p !== null) return p; } } catch {}
    }
    return null;
  }
  private ts(t: string): number { const n = new Date(t).getTime(); return Number.isFinite(n) ? n : 0; }
}
