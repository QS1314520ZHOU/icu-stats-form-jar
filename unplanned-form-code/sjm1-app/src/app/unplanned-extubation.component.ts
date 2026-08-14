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
import { databaseTimeValue, formatShanghaiDate, formatShanghaiTime } from './form-date.util';
import { HostPatientService } from './services/host-patient.service';

const SCORE_TYPE = 'unPlannedCGZYYScore';
const COLS_PER_GROUP = 6;

interface NurseMeasure {
  code?: string;
  value?: boolean;
}

interface UnplannedScoreValue {
  rass?: number;
  noRass?: number;
  noRassIndexList?: number[];
  ssd?: number;
  gthz?: number;
  xwhz?: number;
  dgsl?: number;
  dggd?: number;
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
  unPlannedCGZYYScore?: UnplannedScoreValue;
}

interface EvalColumn {
  time: string;
  total: number | null;
  conclusion: string;
  score: UnplannedScoreValue;
  measures: NurseMeasure[];
  signUserId?: string;
  signName: string;
}

interface ReportGroup {
  index: number;
  cols: Array<EvalColumn | null>;
  firstSheet: number;
  secondSheet: number;
}

interface AssessmentRow {
  field: keyof UnplannedScoreValue;
  label: string;
  score: number;
  item?: string;
  itemRowspan?: number;
  subgroup?: string;
  subgroupRowspan?: number;
  noRassIndex?: number;
}

interface MeasureGroup {
  name: string;
  startIndex: number;
  items: string[];
}

const FIRST_PAGE_ROWS: AssessmentRow[] = [
  { field: 'rass', item: '神志意识及精神状态', itemRowspan: 10, subgroup: '实施镇静剂的患者', subgroupRowspan: 4, label: 'RASS评分 -5~-3分', score: 0 },
  { field: 'rass', label: 'RASS评分 -2~0分', score: 1 },
  { field: 'rass', label: 'RASS评分 1~2分', score: 2 },
  { field: 'rass', label: 'RASS评分 3~4分', score: 3 },
  { field: 'noRass', subgroup: '未实施镇静或不适宜用RASS评分患者', subgroupRowspan: 6, label: '意识清楚，情绪稳定或平静/昏迷且对外界刺激无反应', score: 0, noRassIndex: 0 },
  { field: 'noRass', label: '意识清楚，情绪烦躁或易激惹、兴奋或欣快', score: 3, noRassIndex: 1 },
  { field: 'noRass', label: '意识清楚，情绪悲观或拒绝治疗', score: 3, noRassIndex: 2 },
  { field: 'noRass', label: '嗜睡或昏睡或痴呆', score: 2, noRassIndex: 3 },
  { field: 'noRass', label: '意识模糊或谵妄，精神狂躁或抑郁', score: 3, noRassIndex: 4 },
  { field: 'noRass', label: '昏迷且躁动、无指令性动作', score: 3, noRassIndex: 5 },

  { field: 'ssd', item: '舒适度', itemRowspan: 4, label: '无疼痛或不适主诉（含昏迷或镇静）/CPOT：0分', score: 0 },
  { field: 'ssd', label: 'NRS：1～3分/CPOT：1分/偶有不适主诉，可耐受导管留置', score: 1 },
  { field: 'ssd', label: 'NRS：≥4分/CPOT：2分/频感不适，意图拔管', score: 2 },
  { field: 'ssd', label: 'NRS：≥7分/CPOT：≥3分/严重不适，无法耐受导管留置，意图拔管', score: 3 },

  { field: 'gthz', item: '沟通合作', itemRowspan: 3, label: '患者或陪护人员完全理解并配合', score: 0 },
  { field: 'gthz', label: '患者或陪护人员部分理解与配合', score: 1 },
  { field: 'gthz', label: '患者或陪护人员不理解或拒绝配合', score: 3 },

  { field: 'xwhz', item: '行为合作', itemRowspan: 3, label: '肌力≤2级', score: 0 },
  { field: 'xwhz', label: '肌力＞2级，无拔管史', score: 1 },
  { field: 'xwhz', label: '肌力＞2级，有拔管史', score: 2 },

  { field: 'dgsl', item: '导管数量', itemRowspan: 2, label: '留置导管数量≤2', score: 1 },
  { field: 'dgsl', label: '留置导管数量＞2', score: 2 },

  { field: 'dggd', item: '导管固定', itemRowspan: 1, label: '使用胶布或贴膜固定或系带固定', score: 3 },
];

const SECOND_PAGE_FIX_ROWS: AssessmentRow[] = [
  { field: 'dggd', item: '导管固定', itemRowspan: 2, label: '使用胶布+贴膜固定或系带+胶布/贴膜固定', score: 2 },
  { field: 'dggd', label: '缝线固定或固定器固定或水囊（气囊）固定', score: 1 },
];

const MEASURE_GROUPS: MeasureGroup[] = [
  {
    name: '妥善固定',
    startIndex: 0,
    items: [
      '1.根据患者意识状态和皮肤情况，选择合适的固定材料。',
      '2.选择合适的固定方法，进行二次固定，确保固定牢固、松紧适宜。',
      '3.每班观察管道情况，高风险患者每小时观察1次，如导管移位或敷料潮湿、松动等异常情况，及时处置。',
      '4.患者翻身、穿脱衣物、下床、过床、外出检查等过程中，避免外力牵拉管道。',
      '5.更换固定材料时，选择正确的更换方式，避免管道移位或脱出，必要时双人操作。',
    ],
  },
  {
    name: '患者管理',
    startIndex: 5,
    items: [
      '1.保持管路连接部位远离患者双手活动范围。',
      '2.规范使用管道标识。',
      '3.健康教育：告知管道的重要性及护理方法，鼓励患者和陪护主动参与管道管理，出现异常立即通知医务人员。',
    ],
  },
  {
    name: '镇静镇痛管理',
    startIndex: 8,
    items: [
      '1.选择适宜的疼痛评估工具进行评估，遵医嘱使用镇痛药物，镇痛期间密切监测镇痛效果和生命体征，将患者的疼痛程度控制在轻度及以下范围内。',
      '2.遵医嘱使用镇静药物，可根据RASS评分动态调整给药方式和药物用量，使患者的镇静深度达到治疗目标，避免镇静不足或过度。',
      '3.根据病情实施每日唤醒。',
    ],
  },
  {
    name: '谵妄管理',
    startIndex: 11,
    items: [
      '1.疑似谵妄患者，应根据CAM-ICU量表、ICDSC量表进行评估。',
      '2.谵妄患者积极治疗原发病，减少或避免引发谵妄的高危因素，必要时遵医嘱用药和/或实施约束。',
    ],
  },
  {
    name: '身体约束管理',
    startIndex: 13,
    items: [
      '1.合理把握约束指征，对于意识障碍、烦躁不安等患者，必要时遵医嘱给予有效约束。',
      '2.签署《保护性约束知情同意书》，向家属解释约束必要性。',
      '3.每班评估约束的必要性，使用最小化约束，及时解除不必要的约束。',
      '4.约束时肢体应处于功能位，动态观察约束效果及有无并发症，必要时更换约束部位。如体位改变，应及时调整约束位置，确保手部与管道保持安全距离。',
      '5.每2h观察约束部位的皮肤及血液循环情况。',
    ],
  },
  {
    name: '尽早拔管',
    startIndex: 18,
    items: ['每日评估管道留置的必要性，符合拔管指征应尽早拔除。'],
  },
];

@Component({
  standalone: false,
  selector: 'app-unplanned-extubation',
  template: `
    <div class="toolbar no-print">
      <label>页码选择：
        <select [(ngModel)]="selectedSheet">
          <option [ngValue]="null">全部</option>
          <option *ngFor="let n of sheetNumbers" [ngValue]="n">第 {{ n }} 页</option>
        </select>
      </label>
      <button class="btn" type="button" (click)="onPrint()">打印</button>
    </div>

    <div *ngIf="loading" class="loading">加载中…</div>

    <ng-container *ngFor="let group of reportGroups">
      <section class="sheet" [class.sheet-hidden]="!sheetVisible(group.firstSheet)" [attr.data-sheet]="group.firstSheet">
        <ng-container *ngTemplateOutlet="header"></ng-container>

        <table class="record-table assessment-table">
          <colgroup>
            <col class="item-col"><col class="subgroup-col"><col class="detail-col"><col class="score-col">
            <col *ngFor="let c of group.cols" class="data-col">
          </colgroup>
          <thead>
            <tr>
              <th rowspan="2">项目名称</th>
              <th colspan="2" rowspan="2">具体评估细则</th>
              <th rowspan="2">分值</th>
              <th [attr.colspan]="group.cols.length">评估日期</th>
            </tr>
            <tr>
              <th *ngFor="let c of group.cols" class="date-cell">
                <span>{{ c ? fmtDate(c.time) : '' }}</span>
                <span>{{ c ? fmtTime(c.time) : '' }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of firstPageRows">
              <td *ngIf="row.item" [attr.rowspan]="row.itemRowspan" class="item-cell">{{ row.item }}</td>
              <td *ngIf="row.subgroup" [attr.rowspan]="row.subgroupRowspan" class="subgroup-cell">{{ row.subgroup }}</td>
              <td [attr.colspan]="row.subgroup ? 1 : (row.field === 'rass' || row.field === 'noRass' ? 1 : 2)" class="detail-cell">{{ row.label }}</td>
              <td>{{ row.score }}</td>
              <td *ngFor="let c of group.cols" class="check-cell">{{ scoreCheck(c, row) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="remark">{{ remarkText }}</div>
        <div class="sheet-pageno">第 {{ group.firstSheet }} 页</div>
      </section>

      <section class="sheet" [class.sheet-hidden]="!sheetVisible(group.secondSheet)" [attr.data-sheet]="group.secondSheet">
        <table class="record-table measure-table">
          <colgroup>
            <col class="item-col"><col class="subgroup-col"><col class="detail-col"><col class="score-col">
            <col *ngFor="let c of group.cols" class="data-col">
          </colgroup>
          <tbody>
            <tr *ngFor="let row of secondPageFixRows">
              <td *ngIf="row.item" [attr.rowspan]="row.itemRowspan" class="item-cell">{{ row.item }}</td>
              <td colspan="2" class="detail-cell">{{ row.label }}</td>
              <td>{{ row.score }}</td>
              <td *ngFor="let c of group.cols" class="check-cell">{{ scoreCheck(c, row) }}</td>
            </tr>
            <tr>
              <td colspan="4" class="summary-label">评估总分</td>
              <td *ngFor="let c of group.cols" class="check-cell">{{ c?.total ?? '' }}</td>
            </tr>
            <tr>
              <td colspan="4" class="summary-label">危险程度</td>
              <td *ngFor="let c of group.cols" class="check-cell">{{ c?.conclusion || '' }}</td>
            </tr>

            <ng-container *ngFor="let mg of measureGroups; let gi = index">
              <tr *ngFor="let text of mg.items; let mi = index">
                <td *ngIf="gi === 0 && mi === 0" [attr.rowspan]="measureRowCount" class="vertical-cell">护理措施</td>
                <td *ngIf="mi === 0" [attr.rowspan]="mg.items.length" class="measure-name">{{ mg.name }}</td>
                <td colspan="2" class="measure-text">{{ text }}</td>
                <td *ngFor="let c of group.cols" class="check-cell">{{ measureCheck(c, mg.startIndex + mi) }}</td>
              </tr>
            </ng-container>

            <tr>
              <td colspan="4" class="summary-label">护士签名</td>
              <td *ngFor="let c of group.cols" class="sign-cell">{{ c?.signName || '' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="remark">{{ remarkText }}</div>
        <div class="sheet-pageno">第 {{ group.secondSheet }} 页</div>
      </section>
    </ng-container>

    <ng-template #header>
      <header class="sheet-head">
        <div class="title-line">{{ hospitalName }}非计划拔管风险评估及护理措施记录单</div>
        <div class="patient-info-row">
          <span><b>科室：</b>{{ patient?.dept || '' }}</span>
          <span><b>姓名：</b>{{ patient?.name || '' }}</span>
          <span><b>床号：</b>{{ bedText }}</span>
          <span><b>住院号：</b>{{ patient?.mrn || '' }}</span>
          <span><b>性别：</b>{{ genderText(patient?.gender) }}</span>
          <span><b>年龄：</b>{{ age ?? '' }}{{ age !== null ? '岁' : '' }}</span>
          <span class="diagnosis"><b>诊断：</b>{{ diagnosisDisplay }}</span>
        </div>
      </header>
    </ng-template>
  `,
  styles: [`
    :host { display:block; height:100vh; overflow:auto; background:#f0f2f5; color:#000; }
    .toolbar { position:sticky; top:0; z-index:50; display:flex; justify-content:flex-end; align-items:center; gap:12px; padding:10px 16px; background:#fff; border-bottom:1px solid #ddd; font:14px Arial,'Microsoft YaHei',sans-serif; }
    .toolbar select { margin-left:6px; padding:5px 8px; border:1px solid #bbb; border-radius:4px; background:#fff; }
    .btn { min-height:34px; padding:5px 18px; border:1px solid #1677ff; border-radius:4px; background:#1677ff; color:#fff; cursor:pointer; }
    .btn:focus-visible, select:focus-visible { outline:2px solid #1677ff; outline-offset:2px; }
    .loading { padding:16px; font-family:'SimSun','宋体',serif; }
    .sheet-hidden { display:none !important; }

    .sheet { box-sizing:border-box; position:relative; width:297mm; height:210mm; margin:16px auto; padding:5mm 8mm 10mm; overflow:hidden; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.15); font-family:'SimSun','宋体',serif; }
    .sheet-head { padding-bottom:5px; text-align:center; }
    .title-line { font-family:'SimHei','黑体',sans-serif; font-size:22pt; font-weight:700; line-height:1.25; }
    .patient-info-row { display:flex; align-items:center; gap:14px; margin-top:6px; font-size:11pt; white-space:nowrap; }
    .patient-info-row span { flex:0 0 auto; }
    .patient-info-row .diagnosis { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; text-align:left; }

    .record-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.4pt; }
    .record-table th, .record-table td { border:1px solid #000; padding:2px 3px; text-align:center; vertical-align:middle; line-height:1.15; word-break:break-all; }
    .record-table th { font-weight:400; }
    .assessment-table td { height:16px; }
    .measure-table td { height:20px; }
    .item-col { width:25mm; }
    .subgroup-col { width:36mm; }
    .detail-col { width:92mm; }
    .score-col { width:13mm; }
    .data-col { width:17mm; }
    .item-cell, .subgroup-cell, .measure-name, .vertical-cell { font-size:9pt; }
    .detail-cell, .measure-text { text-align:left !important; padding-left:5px !important; }
    .date-cell span { display:block; white-space:nowrap; }
    .check-cell { font-size:11pt; }
    .summary-label { font-size:10pt; }
    .vertical-cell { writing-mode:vertical-rl; text-orientation:upright; letter-spacing:2px; }
    .measure-name { width:25mm; }
    .measure-text { font-size:8.2pt; }
    .sign-cell { font-size:9pt; }
    .remark { margin-top:4px; font-size:7.8pt; line-height:1.25; text-align:left; }
    .sheet-pageno { position:absolute; right:8mm; bottom:3.5mm; left:8mm; text-align:center; font-size:11pt; }

    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print {
      :host { height:auto; overflow:visible; background:#fff; }
      .no-print { display:none !important; }
      .sheet { margin:0; box-shadow:none; zoom:1 !important; page-break-after:always; }
      .sheet:last-of-type { page-break-after:auto; }
    }
  `],
})
export class UnplannedExtubationComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  readonly firstPageRows = FIRST_PAGE_ROWS;
  readonly secondPageFixRows = SECOND_PAGE_FIX_ROWS;
  readonly measureGroups = MEASURE_GROUPS;
  readonly measureRowCount = MEASURE_GROUPS.reduce((sum, group) => sum + group.items.length, 0);
  readonly remarkText = '备注：评估总分：≥9分高危，6-8分中危，≤5分低危；首次评估后：＜9分者每周评估1次；≥9分者每天评估1次，每班交接，直至导管拔出；当评估内容发生变化随时评估更新。RASS：Richmond躁动-镇静量表；NRS：疼痛数字评定量表；CPOT：重症监护疼痛观察工具。*如果按照低风险为1分，并根据等级分值逐渐累加，结合组合权重的分值，将组合权重×50后可初步得出相应的分值，考虑到部分情况无拔管风险，故将组合权重×50-1，得到无风险的分值为0分，低风险为1分，如此累加。';

  loading = true;
  hospitalName = '重钢总医院';
  patient: any = null;
  age: number | null = null;
  diagnosisDisplay = '';
  reportGroups: ReportGroup[] = [];
  selectedSheet: number | null = null;

  private pid = '';
  private lastPid: string | null = null;
  private destroy$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;

  constructor(
    private http: HttpClient,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.loadHospitalName();
    this.hostPatient.patient$.pipe(
      filter((patient) => !!patient),
      map((patient) => ({ patient, pid: String(patient.id || '').trim() })),
      filter(({ pid }) => !!pid),
      distinctUntilChanged((a, b) => a.pid === b.pid),
      tap(({ patient, pid }) => {
        if (pid !== this.lastPid) this.lastPid = pid;
        this.resetForm();
        this.patient = patient;
        this.pid = pid;
        this.age = this.calcAge(patient.birthday);
        this.diagnosisDisplay = this.formatDiagnosis(patient.clinicalDiagnosis);
      }),
      switchMap(({ pid }) => this.loadFromServer(pid)),
      takeUntil(this.destroy$),
    ).subscribe();
  }

  ngAfterViewInit(): void {
    this.fitScale();
    this.resizeObserver = new ResizeObserver(() => this.fitScale());
    this.resizeObserver.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
  }

  get bedText(): string {
    const bed = String(this.patient?.hisBed || '').trim();
    return bed && !bed.endsWith('床') ? `${bed}床` : bed;
  }

  get sheetNumbers(): number[] {
    return this.reportGroups.flatMap((group) => [group.firstSheet, group.secondSheet]);
  }

  sheetVisible(sheet: number): boolean {
    return this.selectedSheet === null || Number(this.selectedSheet) === sheet;
  }

  scoreCheck(column: EvalColumn | null, row: AssessmentRow): string {
    if (!column) return '';
    const value = this.num(column.score[row.field]);

    if (row.field === 'noRass') {
      const indexes = Array.isArray(column.score.noRassIndexList)
        ? column.score.noRassIndexList.map(Number).filter(Number.isFinite)
        : [];
      if (indexes.length > 0) return indexes.includes(row.noRassIndex ?? -1) ? '√' : '';

      // 兼容旧数据：noRassIndexList 缺失时，同分值只勾选第一条，避免3分的四行全部被勾选。
      if (value !== row.score) return '';
      const firstIndex = FIRST_PAGE_ROWS.find((item) => item.field === 'noRass' && item.score === row.score)?.noRassIndex;
      return row.noRassIndex === firstIndex ? '√' : '';
    }

    return value === row.score ? '√' : '';
  }

  measureCheck(column: EvalColumn | null, index: number): string {
    return column?.measures?.[index]?.value === true ? '√' : '';
  }

  fmtDate(value?: string): string {
    return formatShanghaiDate(value) || '';
  }

  fmtTime(value?: string): string {
    return formatShanghaiTime(value) || '';
  }

  genderText(value?: string): string {
    if (value === 'Male' || value === 'M' || value === '男') return '男性';
    if (value === 'Female' || value === 'F' || value === '女') return '女性';
    return value || '';
  }

  onPrint(): void {
    const sheets = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.sheet'));
    const selected = this.selectedSheet === null ? null : Number(this.selectedSheet);
    const printable = sheets.filter((sheet) => selected === null || Number(sheet.dataset['sheet']) === selected);
    if (!printable.length) return;

    const body = printable.map((sheet) => {
      const clone = sheet.cloneNode(true) as HTMLElement;
      clone.classList.remove('sheet-hidden');
      clone.style.zoom = '1';
      return `<div class="print-page">${clone.outerHTML}</div>`;
    }).join('');

    const css = `
      @page { size:A4 landscape; margin:0; }
      html,body { margin:0; padding:0; background:#fff; color:#000; }
      .print-page { width:297mm; height:210mm; overflow:hidden; page-break-after:always; }
      .print-page:last-child { page-break-after:auto; }
      ${this.componentPrintCss()}
    `;

    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) {
      alert('打印窗口被拦截，请允许弹出窗口');
      return;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();

    const print = () => {
      win.focus();
      win.print();
    };
    const doc = win.document as Document & { fonts?: { ready: Promise<unknown> } };
    if (doc.fonts?.ready) doc.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(print)));
    else win.addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(print)));
    win.addEventListener('afterprint', () => win.close());
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http.get<ScoreRecord[]>(this.API_SCORE, {
      params: { pid, scoreType: SCORE_TYPE },
    }).pipe(
      tap((response) => {
        const records = (Array.isArray(response) ? response : response ? [response as unknown as ScoreRecord] : [])
          .filter((record) => record?.valid === true && record.scoreType === SCORE_TYPE && !!record.time)
          .sort((a, b) => databaseTimeValue(a.time) - databaseTimeValue(b.time));
        this.buildGroups(records);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout(() => this.fitScale());
      }),
    );
  }

  private buildGroups(records: ScoreRecord[]): void {
    const columns: EvalColumn[] = records.map((record) => ({
      time: record.time!,
      total: this.num(record.total),
      conclusion: record.conclusion || '',
      score: record.unPlannedCGZYYScore || {},
      measures: Array.isArray(record.nurseMeasureList) ? record.nurseMeasureList : [],
      signUserId: record.inputUserId,
      signName: record.inputUser || '',
    }));

    this.reportGroups = this.chunkColumns(columns);
    const userIds = [...new Set(columns.map((column) => column.signUserId).filter(Boolean) as string[])];
    if (!userIds.length) return;

    this.http.get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } }).subscribe({
      next: (accounts) => {
        const names = new Map<string, string>();
        for (const account of Array.isArray(accounts) ? accounts : []) {
          const id = String(account?._id || account?.id || '');
          if (id) names.set(id, account?.trueName || account?.accountName || '');
        }
        for (const group of this.reportGroups) {
          for (const column of group.cols) {
            if (column?.signUserId && names.has(column.signUserId)) {
              column.signName = names.get(column.signUserId) || column.signName;
            }
          }
        }
        this.cdr.detectChanges();
      },
      error: () => undefined,
    });
  }

  private chunkColumns(columns: EvalColumn[]): ReportGroup[] {
    const source = columns.length ? columns : [];
    const groups: ReportGroup[] = [];
    const count = Math.max(1, Math.ceil(source.length / COLS_PER_GROUP));

    for (let index = 0; index < count; index++) {
      const cols: Array<EvalColumn | null> = source.slice(index * COLS_PER_GROUP, (index + 1) * COLS_PER_GROUP);
      while (cols.length < COLS_PER_GROUP) cols.push(null);
      groups.push({
        index: index + 1,
        cols,
        firstSheet: index * 2 + 1,
        secondSheet: index * 2 + 2,
      });
    }
    return groups;
  }

  private resetForm(): void {
    this.reportGroups = [];
    this.selectedSheet = null;
    this.age = null;
    this.diagnosisDisplay = '';
    this.cdr.detectChanges();
  }

  private loadHospitalName(): void {
    this.http.get<{ hospitalName?: string }>(this.API_HOSPITAL).subscribe({
      next: (response) => {
        if (response?.hospitalName) this.hospitalName = response.hospitalName;
        this.cdr.detectChanges();
      },
      error: () => undefined,
    });
  }

  private calcAge(birthday?: string): number | null {
    if (!birthday) return null;
    const birth = new Date(birthday);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : null;
  }

  private formatDiagnosis(value?: string): string {
    if (!value) return '';
    const positions = [';', '；', ',', '，'].map((separator) => value.indexOf(separator)).filter((index) => index >= 0);
    const end = positions.length ? Math.min(...positions) : value.length;
    return value.slice(0, end).trim();
  }

  private num(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isNaN(number) ? null : number;
  }

  private fitScale(): void {
    const sheetWidth = 297 * (96 / 25.4);
    const available = this.host.nativeElement.clientWidth - 32;
    this.host.nativeElement.style.setProperty('--sheet-scale', String(Math.min(1, available / sheetWidth)));
  }

  private componentPrintCss(): string {
    return `
      .sheet { box-sizing:border-box; position:relative; width:297mm; height:210mm; margin:0; padding:5mm 8mm 10mm; overflow:hidden; background:#fff; font-family:'SimSun','宋体',serif; color:#000; }
      .sheet-head { padding-bottom:5px; text-align:center; }
      .title-line { font-family:'SimHei','黑体',sans-serif; font-size:22pt; font-weight:700; line-height:1.25; }
      .patient-info-row { display:flex; align-items:center; gap:14px; margin-top:6px; font-size:11pt; white-space:nowrap; }
      .patient-info-row span { flex:0 0 auto; }
      .patient-info-row .diagnosis { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; text-align:left; }
      .record-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.4pt; }
      .record-table th,.record-table td { border:1px solid #000; padding:2px 3px; text-align:center; vertical-align:middle; line-height:1.15; word-break:break-all; }
      .record-table th { font-weight:400; }
      .assessment-table td { height:16px; }
      .measure-table td { height:20px; }
      .item-col { width:25mm; } .subgroup-col { width:36mm; } .detail-col { width:92mm; } .score-col { width:13mm; } .data-col { width:17mm; }
      .item-cell,.subgroup-cell,.measure-name,.vertical-cell { font-size:9pt; }
      .detail-cell,.measure-text { text-align:left!important; padding-left:5px!important; }
      .date-cell span { display:block; white-space:nowrap; }
      .check-cell { font-size:11pt; }
      .summary-label { font-size:10pt; }
      .vertical-cell { writing-mode:vertical-rl; text-orientation:upright; letter-spacing:2px; }
      .measure-text { font-size:8.2pt; }
      .sign-cell { font-size:9pt; }
      .remark { margin-top:4px; font-size:7.8pt; line-height:1.25; text-align:left; }
      .sheet-pageno { position:absolute; right:8mm; bottom:3.5mm; left:8mm; text-align:center; font-size:11pt; }
      .sheet-hidden,.no-print { display:none!important; }
    `;
  }
}
