/**
 * 亚低温治疗体温记录单 —— Angular 组件
 * 访问路径：/form/ydwzlForm
 *
 * A4 横向，转置矩阵表（行=参数，列=时间点）
 * 仅有体温(param_T)的时间点不成列
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

/* ----------------------------- 数据模型 ----------------------------- */

interface BedsideRecord {
  pid?: string;
  code?: string;
  time?: string;
  strVal?: string;
  valid?: boolean;
  editUser?: string;
}

interface TimeColumn {
  time: string;
  T?: string;
  body?: string;
  water?: string;
  cool?: string;
  warm?: string;
  coolMark?: string;
  warmMark?: string;
  signUserId?: string;
  signName?: string;
}

interface RenderPage {
  index: number;
  cols: TimeColumn[];
}

const CODE_T = 'param_T';
const CODE_BODY = 'param_亚低温体温设置';
const CODE_WATER = 'param_亚低温水温设置';
const CODE_COOL = 'param_降温措施';
const CODE_WARM = 'param_升温措施';
const CODE_YISHI = 'param_Yishi';
const TARGET_CODES = [CODE_T, CODE_BODY, CODE_WATER, CODE_COOL, CODE_WARM, CODE_YISHI];

const COOL_OPTIONS = ['头部冰帽、背部冰毯', '前额、颈部、腋窝及腹股沟区放置冰袋', '降低室温', '血管内降温', '冬眠合剂'];
const WARM_OPTIONS = ['复温毯、复温帽', '棉被/毛毯保暖', '提升室温', '血管内复温', '停用冬眠合剂'];
const OPTION_MARKS = ['①', '②', '③', '④', '⑤'];
const MARK_OTHER = '⑥';

@Component({
  standalone: false,
  selector: 'app-ydwzl-temperature',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <span class="page-select">
          页码选择：
          <select [(ngModel)]="selectedPage">
            <option [value]="null">全部</option>
            <option *ngFor="let p of pages" [value]="p.index">第 {{p.index}} 页</option>
          </select>
        </span>
        <button class="btn" (click)="onPrint()">打印</button>
      </div>
    </div>

    <div class="loading" *ngIf="loading">加载中…</div>

    <div *ngFor="let page of pages">
      <div class="sheet" *ngIf="selectedPage === null || selectedPage === page.index">
        <!-- 标题 -->
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}重症医学科患者亚低温治疗体温记录单</div>
        </div>

        <!-- 患者信息：全部在同一排 -->
        <div class="patient-info-row">
          <span class="info-item"><b>床号：</b>{{patient?.hisBed || ''}}</span>
          <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
          <span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
          <span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
          <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
          <span class="info-item diagnosis-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
          <span class="info-item date-item">
            <!-- <b>日期：</b> -->
            <input type="date" class="date-input" [(ngModel)]="recordDate" (click)="openNativePicker($event)" (change)="onFieldChange()" />
          </span>
        </div>

        <!-- 记录表格 -->
        <table class="record-table">
          <colgroup>
            <col class="label-col" />
            <col *ngFor="let c of pagePaddedCols(page)" class="data-col" />
          </colgroup>
          <tbody>
            <!-- 体温监测方式 -->
            <tr>
              <th class="row-label">体温监测方式</th>
              <td class="monitor-cell" [attr.colspan]="colsPerPage">
                <label class="monitor-option"><input type="checkbox" [(ngModel)]="monitorModes.anal" (change)="onFieldChange()" /> 肛温</label>
                <label class="monitor-option"><input type="checkbox" [(ngModel)]="monitorModes.bladder" (change)="onFieldChange()" /> 膀胱温</label>
                <label class="monitor-option"><input type="checkbox" [(ngModel)]="monitorModes.blood" (change)="onFieldChange()" /> 血温</label>
                <label class="monitor-option"><input type="checkbox" [(ngModel)]="monitorModes.axillary" (change)="onFieldChange()" /> 腋温</label>
              </td>
            </tr>
            <!-- 数据行 -->
            <tr>
              <th class="row-label">日期时间</th>
              <td *ngFor="let c of pagePaddedCols(page)">
                <div class="dt-date">{{ c ? fmtDate(c.time) : '' }}</div>
                <div class="dt-time">{{ c ? fmtTime(c.time) : '' }}</div>
              </td>
            </tr>
            <tr>
              <th class="row-label">体温（℃）</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.T || '') : '' }}</td>
            </tr>
            <tr>
              <th class="row-label">亚低温治疗仪体控温度设置（℃）</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.body || '') : '' }}</td>
            </tr>
            <tr>
              <th class="row-label">亚低温治疗仪水温温度设置（℃）</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.water || '') : '' }}</td>
            </tr>
            <tr>
              <th class="row-label">降温措施</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.coolMark || '') : '' }}</td>
            </tr>
            <tr>
              <th class="row-label">复温措施</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.warmMark || '') : '' }}</td>
            </tr>
            <tr>
              <th class="row-label">护士签名</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.signName || '') : '' }}</td>
            </tr>
            <!-- 备注 -->
            <tr>
              <td class="remark-cell" [attr.colspan]="colsPerPage + 1">
                <div class="remark-text">
                  备注：<br>
                  1、目标温度：33℃-35℃。<br>
                  2、降温措施：每小时降温＜1℃，达到目标温度前每15分钟测量记录核心温度一次；达到目标温度后每1小时测量核心温度，维持治疗期间每2小时记录核心温度一次；降温措施：①头部冰帽、背部冰毯；②前额、颈部、腋窝及腹股沟区放置冰袋；③降低室温；④血管内降温；⑤冬眠合剂；⑥其他 <input class="other-input" type="text" [(ngModel)]="coolOther" disabled />。<br>
                  3、复温：患者意识恢复或治疗结束后复温，每小时记录核心温度一次；缓慢复温，每小时复温≤0.5℃，复温时间≥5小时，12-24小时恢复核心温度36℃-37℃：①复温毯、复温帽；②棉被/毛毯保暖；③提升室温；④血管内复温；⑤停用冬眠合剂；⑥其他 <input class="other-input" type="text" [(ngModel)]="warmOther" disabled />。<br>
                  4、注意事项：亚低温治疗期间每2小时翻身、检查皮肤、记录呼吸、心率、血压；密切观察患者有无皮肤冻伤或压力性损伤、电解质紊乱、凝血功能障碍以及心率失常等并发症。
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 页码 -->
        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
    </div>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5;     }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:'SimSun', '宋体', serif; }

    /* A4 横向 */
    .sheet { box-sizing:border-box; width:297mm; height:210mm; min-height:210mm; margin:16px auto; padding:10mm 12mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); overflow:hidden; position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:'SimHei', '黑体', sans-serif; font-weight:700; font-size:24pt; line-height:1.35; }

    /* 患者信息：一排 */
    .patient-info-row { display:flex; align-items:center; width:100%; gap:18px; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; white-space:nowrap; margin:2px 0; color:#000; }
    .info-item { flex:0 0 auto; white-space:nowrap; }
    .info-item b { font-weight:700; }
    .info-item b, .info-item strong { font-family:inherit; font-size:inherit; font-style:inherit; line-height:inherit; color:inherit; font-weight:700; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .date-item { flex:0 0 auto; margin-left:auto; }
    .date-input {
      font-size: 12pt;
      cursor: pointer;
      border: none;
      outline: none;
      background: transparent;
    }

    /* 表格 */
    .record-table { width:100%; border-collapse:collapse; font-family:'SimSun', '宋体', serif; font-size:9pt; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:4px 2px; word-break:break-all; height:34px; }
    .record-table th { background:transparent; font-weight:700; }
    .row-label { width:130px; }
    .label-col { width:130px; }
    .data-col { width:auto; }

    /* 体温监测方式 */
    .monitor-cell { box-sizing:border-box; text-align:left !important; padding:5px 12px !important; white-space:nowrap; overflow:hidden; }
    .monitor-option { display:inline-flex; align-items:center; margin-right:26px; white-space:nowrap; }

    /* 备注 */
    .remark-cell { box-sizing:border-box; width:100%; text-align:left !important; vertical-align:top; padding:5px 8px !important; font-size:9.5pt; line-height:1.3; white-space:normal; word-break:break-word; margin-bottom:10mm; }
    .remark-text { text-align:left; line-height:1.5; }

    .other-input { border:none; border-bottom:1px solid #000; min-width:120px; font-size:7.5pt; }
    input:disabled,select:disabled { cursor:not-allowed; opacity:.6; }

    .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.25;}

    .sheet-pageno { position:absolute; left:12mm; right:12mm; bottom:6mm; margin:0; text-align:center; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; line-height:1; color:#000; white-space:nowrap; }
    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print { .no-print { display:none !important; } .print-hidden { display:none !important; } }
  `],
})
export class YdwzlTemperatureComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_BEDSIDE = '/api/v1/icu/bedside/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_EXTRA_LATEST = '/api/v1/icu/ydwzl-extra/latest';
  private readonly API_EXTRA_DETAIL = '/api/v1/icu/ydwzl-extra/detail';
  private readonly API_EXTRA_SAVE = '/api/v1/icu/ydwzl-extra/save';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  loading = true;
  patient: any = null;
  records: BedsideRecord[] = [];
  columns: TimeColumn[] = [];
  pages: RenderPage[] = [];

  hospitalName = '重钢总医院';
  age: number | null = null;
  diagnosisDisplay = '';

  recordDate = '';
  coolOther = '';
  warmOther = '';
  monitorModes = { anal: false, bladder: false, blood: false, axillary: false };

  selectedPage: number | null = null;
  readonly colsPerPage = 16;
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
    this.columns = [];
    this.pages = [];
    this.recordDate = '';
    this.coolOther = '';
    this.warmOther = '';
    this.monitorModes = { anal: false, bladder: false, blood: false, axillary: false };
    this.selectedPage = null;
    this.cdr.detectChanges();
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http
      .get<BedsideRecord[]>(this.API_BEDSIDE, { params: { pid, codes: TARGET_CODES.join(',') } })
      .pipe(
        tap((res) => {
          const list = Array.isArray(res) ? res : res ? [res as any] : [];
          this.records = list.filter(r => r && r.valid === true && TARGET_CODES.includes(r.code || ''));
          this.buildColumns();
        }),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      );
  }

  /** 聚合 + 只有体温不成列 + 签名批量查询 */
  private buildColumns(): void {
    const map = new Map<string, TimeColumn>();
    for (const r of this.records) {
      const t = r.time;
      if (!t) continue;
      const key = String(this.ts(t));
      let col = map.get(key);
      if (!col) { col = { time: t }; map.set(key, col); }
      const v = (r.strVal ?? '').trim();
      switch (r.code) {
        case CODE_T: col.T = v; break;
        case CODE_BODY: col.body = v; break;
        case CODE_WATER: col.water = v; break;
        case CODE_COOL: col.cool = v; break;
        case CODE_WARM: col.warm = v; break;
        case CODE_YISHI: col.signUserId = r.editUser || v; break;
      }
    }
    // 只有体温（或仅体温+签名）不成列，只有存在治疗数据才成列
    const kept = [...map.values()].filter(col => !!(col.body || col.water || col.cool || col.warm));
    this.columns = kept.sort((a, b) => this.ts(a.time) - this.ts(b.time));

    // 降温/复温措施 → 圈号推导，收集"其他"文本
    const coolOthers = new Set<string>();
    const warmOthers = new Set<string>();
    const toMark = (val: string | undefined, opts: string[], others: Set<string>): string => {
      const v = (val ?? '').trim();
      if (!v) return '';
      if (['①', '②', '③', '④', '⑤', '⑥'].includes(v)) return v;
      const i = opts.indexOf(v);
      if (i >= 0) return OPTION_MARKS[i];
      others.add(v);
      return MARK_OTHER;
    };
    for (const col of this.columns) {
      col.coolMark = toMark(col.cool, COOL_OPTIONS, coolOthers);
      col.warmMark = toMark(col.warm, WARM_OPTIONS, warmOthers);
    }
    this.coolOther = [...coolOthers].join('；');
    this.warmOther = [...warmOthers].join('；');

    // 护士签名批量查询
    const userIds = [...new Set(this.columns.map(c => c.signUserId).filter(Boolean))];
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
          for (const col of this.columns) {
            if (col.signUserId && nameMap.has(col.signUserId)) {
              col.signName = nameMap.get(col.signUserId) || '';
            }
          }
          this.loadExtra();
          this.paginate();
          this.cdr.detectChanges();
        },
        error: () => { this.loadExtra(); this.paginate(); this.cdr.detectChanges(); },
      });
    } else {
      this.loadExtra();
      this.paginate();
    }
  }

  private fitScale(): void {
    const SHEET_W = 297 * (96 / 25.4);
    const avail = this.host.nativeElement.clientWidth - 32;
    const scale = Math.min(1, avail / SHEET_W);
    this.host.nativeElement.style.setProperty('--sheet-scale', String(scale));
  }

  private loadHospitalName(): void {
    this.http.get<{ hospitalName: string }>(this.API_HOSPITAL).subscribe({
      next: (res) => { if (res?.hospitalName) this.hospitalName = res.hospitalName; },
      error: () => {},
    });
  }

  get hasData(): boolean { return this.columns.length > 0; }

  private loadExtra(): void {
    this.http.get<any>(this.API_EXTRA_LATEST, { params: { pid: this.pid } }).subscribe({
      next: (d) => {
        if (d) {
          if (d.recordDate) this.recordDate = d.recordDate;
          if (d.monitorModes) {
            if (d.monitorModes.anal != null) this.monitorModes.anal = d.monitorModes.anal;
            if (d.monitorModes.bladder != null) this.monitorModes.bladder = d.monitorModes.bladder;
            if (d.monitorModes.blood != null) this.monitorModes.blood = d.monitorModes.blood;
            if (d.monitorModes.axillary != null) this.monitorModes.axillary = d.monitorModes.axillary;
          }
        }
        this.cdr.detectChanges();
      },
      error: () => { console.error('[ydwzl] loadExtra failed'); this.cdr.detectChanges(); },
    });
  }

  private saveExtra(): void {
    if (!this.pid) return;
    const body = {
      pid: this.pid,
      recordDate: this.recordDate,
      monitorModes: { anal: this.monitorModes.anal, bladder: this.monitorModes.bladder, blood: this.monitorModes.blood, axillary: this.monitorModes.axillary },
    };
    this.http.post(this.API_EXTRA_SAVE, body).subscribe({
      next: () => {},
      error: (err) => { console.error('[ydwzl] saveExtra failed', err); },
    });
  }

  onFieldChange(): void { this.saveExtra(); }

  openNativePicker(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    try {
      if (typeof (input as any).showPicker === 'function') {
        (input as any).showPicker();
      } else {
        input.focus();
      }
    } catch {
      input.focus();
    }
  }

  genderText(g?: string): string {
    if (g === 'Male' || g === 'M' || g === '男') return '男';
    if (g === 'Female' || g === 'F' || g === '女') return '女';
    return g || '';
  }

  private formatDiagnosis(diagnosis?: string): string {
    if (!diagnosis) return '';
		if (!diagnosis) return '';
		let index = -1;
		const seps = [';', '；', ',', '，'];
		for (const s of seps) {
			const i = diagnosis.indexOf(s);
			if (i >= 0 && (index < 0 || i < index)) index = i;
		}
		if (index >= 0) return diagnosis.substring(0, index).trim();
		return diagnosis.trim();
  }

  private paginate(): void {
    const per = this.colsPerPage;
    const pages: RenderPage[] = [];
    if (!this.columns.length) {
      pages.push({ index: 1, cols: [] });
    } else {
      for (let i = 0; i < this.columns.length; i += per) {
        pages.push({ index: pages.length + 1, cols: this.columns.slice(i, i + per) });
      }
    }
    this.pages = pages;
    if (this.selectedPage !== null && this.selectedPage > pages.length) {
      this.selectedPage = null;
    }
  }

  /** 返回恰好 colsPerPage 项的数组 */
  pagePaddedCols(page: RenderPage): (TimeColumn | null)[] {
    const result: (TimeColumn | null)[] = page.cols.slice(0, this.colsPerPage);
    while (result.length < this.colsPerPage) result.push(null);
    return result;
  }

  onPrint(): void {
    const sheets = this.host.nativeElement.querySelectorAll('.sheet');
    if (!sheets.length) return;
    let body = '';
    sheets.forEach((s: HTMLElement) => {
      const c = s.cloneNode(true) as HTMLElement;
      c.querySelectorAll('input[type=checkbox]').forEach(el => {
        const sp = document.createElement('span');
        sp.textContent = (el as HTMLInputElement).checked ? '☑' : '☐';
        el.replaceWith(sp);
      });
      c.querySelectorAll('input[type=text],input[type=date]').forEach(el => {
        const sp = document.createElement('span');
        sp.textContent = (el as HTMLInputElement).value || '';
        sp.style.cssText = 'display:inline-block;min-width:100px;';
        el.replaceWith(sp);
      });
      c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
      c.style.zoom = '1';
      c.style.transform = 'none';
      body += '<div class="print-page">' + c.outerHTML + '</div>';
    });
    const css = `
      @page { size: A4 landscape; margin:0; }
      html,body{margin:0;padding:0;}
      body{color:#000;font-family:'SimSun','宋体',serif;}
      .print-page{box-sizing:border-box;width:297mm;height:210mm;margin:0;overflow:hidden;page-break-after:always;background:#fff;}
      .print-page:last-of-type{page-break-after:auto;}
      .sheet{position:relative;width:297mm;height:210mm;margin:0;padding:4mm 10mm 12mm;overflow:hidden;box-shadow:none;background:#fff;color:#000;transform:none!important;zoom:1!important;filter:none!important;text-shadow:none!important;}
      .sheet-head{text-align:center;padding-bottom:6px;}
      .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:22pt;line-height:1.35;}
      .patient-info-row{display:flex;align-items:center;width:100%;gap:18px;font-size:12pt;font-weight:400;white-space:nowrap;margin:2px 0;color:#000;}
      .info-item{flex:0 0 auto;white-space:nowrap;}
      .info-item b{font-weight:700;}
      .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
      .date-item{flex:0 0 auto;margin-left:auto;}
      .record-table{width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:4px 2px;height:34px;word-break:break-all;}
      .record-table th{background:transparent;font-weight:700;}
      .row-label{width:130px;}
      .monitor-cell{box-sizing:border-box;text-align:left !important;padding:5px 12px !important;white-space:nowrap;overflow:hidden;}
      .monitor-option{display:inline-flex;align-items:center;margin-right:26px;white-space:nowrap;}
      .remark-cell{box-sizing:border-box;width:100%;text-align:left !important;vertical-align:top;padding:5px 8px !important;font-size:8pt;line-height:1.3;margin-bottom:10mm;white-space:normal;word-break:break-word;}
      .dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.25;}
      .sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:4mm;margin:0;text-align:center;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();
    const doPrint = () => { win.focus(); win.print(); };
    const ready = () => { const doc = win.document as any; if (doc.fonts?.ready) { doc.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); }); } else { requestAnimationFrame(() => requestAnimationFrame(doPrint)); } };
    win.addEventListener('afterprint', () => { try { win.close(); } catch(e) {} });
    if ((win.document as any).readyState === 'complete') { ready(); } else { win.addEventListener('load', ready); }
  }

  private calcAge(birthday?: string): number | null {
    if (!birthday) return null;
    const b = new Date(birthday);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age >= 0 ? age : null;
  }

  fmtDate(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  fmtTime(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  fmtDateTime(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private ts(v?: string): number {
    const t = v ? new Date(v).getTime() : 0;
    return isNaN(t) ? 0 : t;
  }
}
