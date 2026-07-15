/**
 * 亚低温治疗体温记录单 —— Angular 组件
 * 访问路径：/form/ydwzlForm
 *
 * 数据源：bedside 集合 valid===true 记录，按 pid 查询
 * 以 time 为 key 聚合成列（行=参数，列=时间点）
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
  sign?: string;  // param_Yishi → account.trueName
}

interface RenderPage {
  index: number;
  cols: TimeColumn[];
}

interface MonitorMode {
  key: string;
  label: string;
  checked: boolean;
}

const CODE_T = 'param_T';
const CODE_BODY = 'param_亚低温体温设置';
const CODE_WATER = 'param_亚低温水温设置';
const CODE_COOL = 'param_降温措施';
const CODE_WARM = 'param_升温措施';
const CODE_SIGN = 'param_Yishi';
const TARGET_CODES = [CODE_T, CODE_BODY, CODE_WATER, CODE_COOL, CODE_WARM, CODE_SIGN];

/** 除体温外有数据的 code 集合（用于"不成列"判断） */
const NON_T_CODES = new Set([CODE_BODY, CODE_WATER, CODE_COOL, CODE_WARM, CODE_SIGN]);

@Component({
  selector: 'app-ydwzl-temperature',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <span class="page-select">
          页码选择：
          <select [(ngModel)]="selectedPage">
            <option [ngValue]="null">全部</option>
            <option *ngFor="let p of pages" [ngValue]="p.index">第 {{p.index}} 页</option>
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

        <!-- 患者信息 + 日期同排 -->
        <div class="patient-info">
          <div class="info-row">
            <span class="info-item"><b>床号：</b>{{patient?.hisBed || ''}}</span>
            <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
            <span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
            <span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
            <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
            <span class="info-item"><b>日期：</b><input class="date-input" type="date" [(ngModel)]="recordDate" (change)="onFieldChange()" /></span>
          </div>
          <div class="info-row">
            <span class="info-item wide"><b>诊断：</b>{{diagnosisDisplay}}</span>
          </div>
        </div>

        <!-- 记录表格 -->
        <table class="record-table">
          <colgroup>
            <col class="label-col" />
            <col *ngFor="let c of pagePaddedCols(page)" />
          </colgroup>
          <tbody>
            <!-- 体温监测方式行（跨全部列） -->
            <tr>
              <th class="row-label">体温监测方式</th>
              <td *ngFor="let c of pagePaddedCols(page); let first = first" [attr.colspan]="first ? pagePaddedCols(page).length : null">
                <label class="cb-inline" *ngFor="let m of monitorModes">
                  <input type="checkbox" [(ngModel)]="m.checked" (change)="onFieldChange()" /> {{m.label}}
                </label>
                <!-- 第一列显示复选框后隐藏其余列 -->
                <span *ngIf="!first" style="display: none"></span>
              </td>
            </tr>
            <!-- 日期时间行 -->
            <tr>
              <th class="row-label">日期时间</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? fmtDateTime(c.time) : '' }}</td>
            </tr>
            <!-- 数据行 -->
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
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.cool || '') : '' }}</td>
            </tr>
            <tr>
              <th class="row-label">复温措施</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.warm || '') : '' }}</td>
            </tr>
            <tr>
              <th class="row-label">护士签名</th>
              <td *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.sign || '') : '' }}</td>
            </tr>
            <!-- 备注行（跨全部列） -->
            <tr>
              <td class="remark-cell" *ngFor="let c of pagePaddedCols(page); let first = first" [attr.colspan]="first ? pagePaddedCols(page).length : null">
                <div class="sheet-remark" *ngIf="first">
                  <div>备注：</div>
                  <div>1、目标温度：33℃-35℃。</div>
                  <div>2、降温措施：每小时降温＜1℃，达到目标温度前每15分钟测量记录核心温度一次；达到目标温度后每1小时测量核心温度，维持治疗期间每2小时记录核心温度一次；降温措施：①头部冰帽、背部冰毯；②前额、颈部、腋窝及腹股沟区放置冰袋；③降低室温；④血管内降温；⑤冬眠合剂；⑥其他 <input class="other-input" type="text" [(ngModel)]="coolOther" (change)="onFieldChange()" /></div>
                  <div>3、复温：患者意识恢复或治疗结束后复温，每小时记录核心温度一次；缓慢复温，每小时复温≤0.5℃，复温时间≥5小时，12-24小时恢复核心温度36℃-37℃：①复温毯、复温帽；②棉被/毛毯保暖；③提升室温；④血管内复温；⑤停用冬眠合剂；⑥其他 <input class="other-input" type="text" [(ngModel)]="warmOther" (change)="onFieldChange()" /></div>
                  <div>4、注意事项：亚低温治疗期间每2小时翻身、检查皮肤、记录呼吸、心率、血压；密切观察患者有无皮肤冻伤或压力性损伤、电解质紊乱、凝血功能障碍以及血氧失常等并发症。</div>
                </div>
                <span *ngIf="!first" style="display: none"></span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 页脚 -->
        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
    </div>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; --fz-h2:29px; --fz-xs4:16px; --font-hei:'SimHei','黑体',sans-serif; --font-song:'SimSun','宋体',serif; }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:var(--font-song); }

    .sheet { box-sizing:border-box; width:297mm; min-height:210mm; margin:16px auto; padding:12mm 10mm 10mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:var(--font-hei); font-weight:700; font-size:var(--fz-h2); line-height:1.4; }

    .patient-info { font-family:var(--font-song); font-size:var(--fz-xs4); margin:8px 0 6px; }
    .info-row { display:flex; flex-wrap:wrap; gap:6px 24px; padding:3px 0; }
    .info-item { white-space:nowrap; }
    .info-item.wide { flex:1 1 100%; white-space:normal; }
    .info-item b { font-weight:700; }
    .date-input { font-size:14px; }
    .cb-inline { margin-right:16px; white-space:nowrap; }
    .other-input { border:none; border-bottom:1px solid #000; min-width:120px; font-size:12px; }
    input:disabled,select:disabled { cursor:not-allowed; opacity:.6; }

    .record-table { width:100%; border-collapse:collapse; font-family:var(--font-song); font-size:13px; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:4px 2px; word-break:break-all; height:34px; }
    .record-table th { background:transparent; font-weight:700; }
    .row-label { width:130px; }
    .label-col { width:130px; }
    .remark-cell { text-align:left !important; padding:6px; }

    .sheet-remark { text-align:left; font-size:12px; line-height:1.6; font-family:var(--font-song); }
    .sheet-remark > div { margin:2px 0; }
    .sheet-pageno { margin-top:4px; text-align:center; font-size:var(--fz-xs4); font-family:var(--font-song); }

    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print { .no-print { display:none !important; } .print-hidden { display:none !important; } }
  `],
})
export class YdwzlTemperatureComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_BEDSIDE = '/api/v1/icu/bedside/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_EXTRA = '/api/v1/icu/ydwzl-extra';
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
  monitorModes: MonitorMode[] = [
    { key: 'anal', label: '肛温', checked: false },
    { key: 'bladder', label: '膀胱温', checked: false },
    { key: 'blood', label: '血温', checked: false },
    { key: 'axillary', label: '腋温', checked: false },
  ];

  selectedPage: number | null = null;
  private colsPerPage = 10;
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
    setTimeout(() => this.recomputePagination(), 0);
    this.fitScale();
    this.ro = new ResizeObserver(() => this.fitScale());
    this.ro.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.ro?.disconnect();
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

  /** 聚合 + 签名反查 */
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
        case CODE_SIGN: col.sign = r.editUser || v; break; // 先用 editUser 占位，后面替换
      }
    }

    // 只有体温不成列：若某时间点仅有 T（无其它 code 数据），删除该列
    for (const [key, col] of map) {
      if (!col.body && !col.water && !col.cool && !col.warm && !col.sign) {
        map.delete(key);
      }
    }

    this.columns = [...map.values()].sort((a, b) => this.ts(a.time) - this.ts(b.time));

    // 查询签名用户名称
    const userIds = [...new Set(this.columns.map(c => c.sign).filter(Boolean))];
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
            if (col.sign && nameMap.has(col.sign)) {
              col.sign = nameMap.get(col.sign) || col.sign;
            }
          }
          this.loadExtra();
          this.paginate();
          this.cdr.detectChanges();
        },
        error: () => {
          this.loadExtra();
          this.paginate();
          this.cdr.detectChanges();
        },
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
    this.http.get<any>(this.API_EXTRA, { params: { pid: this.pid } }).subscribe({
      next: (d) => {
        if (!d) return;
        if (d.recordDate) this.recordDate = d.recordDate;
        if (d.coolOther != null) this.coolOther = d.coolOther;
        if (d.warmOther != null) this.warmOther = d.warmOther;
        if (Array.isArray(d.monitorModes)) {
          for (const m of this.monitorModes) {
            const hit = d.monitorModes.find((x: any) => x.key === m.key);
            if (hit) m.checked = !!hit.checked;
          }
        }
      },
      error: () => {},
    });
  }

  private saveExtra(): void {
    if (!this.pid) return;
    const body = {
      pid: this.pid,
      recordDate: this.recordDate,
      coolOther: this.coolOther,
      warmOther: this.warmOther,
      monitorModes: this.monitorModes.map(m => ({ key: m.key, checked: m.checked })),
    };
    this.http.post(this.API_EXTRA, body).subscribe({ next: () => {}, error: () => {} });
  }

  onFieldChange(): void { this.saveExtra(); }

  genderText(g?: string): string {
    if (g === 'Male' || g === 'M' || g === '男') return '男';
    if (g === 'Female' || g === 'F' || g === '女') return '女';
    return g || '';
  }

  private formatDiagnosis(diagnosis?: string): string {
    if (!diagnosis) return '';
    const a = diagnosis.indexOf(';');
    const b = diagnosis.indexOf('；');
    let index = -1;
    if (a >= 0 && b >= 0) index = Math.min(a, b);
    else if (a >= 0) index = a;
    else if (b >= 0) index = b;
    return (index >= 0 ? diagnosis.substring(0, index) : diagnosis).trim();
  }

  private paginate(): void {
    const per = Math.max(1, this.colsPerPage);
    const pages: RenderPage[] = [];
    if (this.columns.length === 0) {
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

  private recomputePagination(): void {
    const PX_PER_MM = 96 / 25.4;
    const usableW = (297 - 20) * PX_PER_MM;
    const labelW = 130;
    const colW = 54;
    const cols = Math.floor((usableW - labelW) / colW);
    const next = Math.max(6, cols);
    if (next !== this.colsPerPage) {
      this.colsPerPage = next;
      this.paginate();
      this.cdr.detectChanges();
    }
  }

  pagePaddedCols(page: RenderPage): (TimeColumn | null)[] {
    const cols: (TimeColumn | null)[] = [...page.cols];
    while (cols.length < this.colsPerPage) cols.push(null);
    return cols;
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
        sp.style.cssText = 'display:inline-block;min-width:100px;border-bottom:1px solid #000;';
        el.replaceWith(sp);
      });
      c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
      c.style.zoom = '1';
      body += c.outerHTML;
    });
    const css = `
      @page { size: A4 landscape; margin:0; }
      html,body{margin:0;padding:0;}
      body{color:#000;font-family:'SimSun','宋体',serif;}
      .sheet{box-sizing:border-box;width:297mm;height:210mm;padding:12mm 10mm 10mm;margin:0;overflow:hidden;position:relative;page-break-after:always;box-shadow:none;}
      .sheet:last-of-type{page-break-after:auto;}
      .sheet-head{text-align:center;}
      .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:29px;line-height:1.4;}
      .patient-info{font-size:16px;margin:8px 0 6px;}
      .info-row{display:flex;flex-wrap:wrap;gap:6px 24px;padding:3px 0;}
      .info-item.wide{flex:1 1 100%;}
      .cb-inline{margin-right:16px;}
      .record-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:4px 2px;height:34px;word-break:break-all;}
      .record-table th{background:transparent;font-weight:700;}
      .row-label{width:130px;}
      .remark-cell{text-align:left !important;padding:6px;}
      .sheet-remark{text-align:left;font-size:12px;line-height:1.6;}
      .sheet-remark > div{margin:2px 0;}
      .sheet-pageno{margin-top:4px;text-align:center;font-size:16px;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
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
