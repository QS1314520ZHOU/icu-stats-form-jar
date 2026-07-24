import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';
import { bedsideTimeValue, formatBedsideHourMinute, formatBedsideMonthDay } from './form-date.util';

interface BedsideRecord {
  id?: string; pid: string | number; code: string; time: string;
  strVal?: string; valid: boolean | string | number; editUser?: string; editTime?: string;
  recordUserName?: string; editUserName?: string;
}

interface EcmoMetric { label: string; code: string; aliases?: string[]; }
interface EcmoGroup { name: string; metrics: EcmoMetric[]; }

interface RenderPage { index: number; times: string[]; showConsumables: boolean; }

const ECMO_GROUPS: EcmoGroup[] = [
  { name: 'ECMO相关参数', metrics: [
    { label: '治疗模式', code: 'param_ECMOMoShi' }, { label: '治疗状态', code: 'param_治疗状态' },
    { label: '血流量（L/min）', code: 'param_ECMO_xueLiuLiang' },
    { label: '转速', code: 'param_ECMO_liXinBengZhuanSu', aliases: ['param_ECMO_IXinBengZhuanSu', 'param_ECMO_lXinBengZhuanSu', 'param_ECMO_iXinBengZhuanSu'] },
    { label: '气流量（L/min）', code: 'param_ECMO_QiLiuLiang' }, { label: 'FiO₂(%)', code: 'param_ECMO_FiO2' },
    { label: '血温℃', code: 'param_bg_Temp' }, { label: '设置水温℃', code: 'param_ShuiXiangTemp_set' },
    { label: '实际水温℃', code: 'param_ShuiXiangTemp_act' }, { label: 'P泵前（mmHg）', code: 'param_P_Beng_MoQian_MoHou' },
    { label: 'P膜前（mmHg）', code: 'param_P膜前' }, { label: 'P膜后（mmHg）', code: 'param_P膜后' },
  ]},
  { name: '抗凝适用和凝血指标', metrics: [
    { label: '抗凝剂（IU）', code: 'param_抗凝剂' }, { label: '抗凝剂首剂（IU）', code: 'param_抗凝剂首剂' },
    { label: '抗凝剂维持剂量（IU）', code: 'param_抗凝剂维持量' }, { label: 'ACT(S)', code: 'param_ACTs' },
    { label: 'APTT(S)', code: 'param_ECMO_aPTT' },
  ]},
  { name: '侧支循环', metrics: [
    { label: '是否建立侧支循环', code: 'param_是否建立侧支循环' }, { label: '远端灌注管血流', code: 'param_远端灌注管血流' },
  ]},
  { name: '穿刺部位及肢体观察', metrics: [
    { label: '引血端置入部位', code: 'param_引血端置入部位' }, { label: '引血端导管深度（cm）', code: 'param_引血端导管深度' },
    { label: '回血端置入部位', code: 'param_回血端置入部位' }, { label: '导管置入深度（cm）', code: 'param_导管置入深度' },
    { label: '穿刺部位情况', code: 'param_穿刺部位情况' }, { label: '远端肢体观察', code: 'param_远端肢体观察' },
  ]},
  { name: '设备运行观察', metrics: [
    { label: '设备运行正常', code: 'param_设备运行正常' }, { label: '外部管路抖动情况', code: 'param_外部管路抖动情况' },
    { label: '管路有无气泡', code: 'param_管路有无气泡' }, { label: '管路及膜肺凝血块观察', code: 'param_管路及膜肺凝血块观察' },
  ]},
  { name: '血气指标', metrics: [
    { label: 'PH', code: 'param_lis_xueQi_PH' }, { label: 'PaO₂(mmHg)', code: 'param_lis_xueQi_PaO2' },
    { label: 'PaCO₂(mmHg)', code: 'param_PaCO2' }, { label: 'HCO₃⁻（mmol/L）', code: 'param_bg_HCO3-' },
    { label: 'Lac（mmol/L）', code: 'param_bg_Lac' }, { label: 'BE（mmol/L）', code: 'param_bg_BE' },
    { label: 'SaO₂(%)', code: 'param_SaO2' },
  ]},
];

type ConsumablesSaveState = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  standalone: false,
  selector: 'app-ecmo-record',
  templateUrl: './ecmo-record.component.html',
  styleUrls: ['./ecmo-record.component.css'],
})
export class EcmoRecordComponent implements OnInit, OnDestroy {
  private readonly API = '/api/v1/icu/bedside';
  private readonly API_ECMO_EXTRA = '/api/v1/icu/ecmo-extra';
  private readonly destroy$ = new Subject<void>();
  private readonly values = new Map<string, string>();
  private readonly consumablesSave$ = new Subject<{ pid: string; text: string }>();
  private lastConsumablesDraft: { pid: string; text: string } | null = null;

  readonly groups = ECMO_GROUPS;
  readonly codes = Array.from(new Set(ECMO_GROUPS.flatMap(g => g.metrics.flatMap(m => [m.code, ...(m.aliases ?? [])]))));
  readonly queryCodes = Array.from(new Set([...this.codes, 'param_Yishi']));
  private signatureRecords: Array<{time: string; instant: number; editUser: string}> = [];

  patient: any = null; account: any = null;
  pid = ''; age: number | null = null; diagnosisDisplay = '';

  loading = false; loadError = '';
  records: BedsideRecord[] = [];
  pages: RenderPage[] = [{ index: 1, times: [], showConsumables: true }];
  selectedPrintPage: number | null = null;

  consumablesText = '';
  consumablesSaveState: ConsumablesSaveState = 'idle';

  constructor(
    private readonly http: HttpClient,
    private readonly hostPatient: HostPatientService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.consumablesSave$.pipe(
      debounceTime(800),
      distinctUntilChanged((prev, cur) => prev.pid === cur.pid && prev.text === cur.text),
      tap(payload => { if (payload.pid === this.pid) { this.consumablesSaveState = 'saving'; this.cdr.detectChanges(); } }),
      switchMap(payload => this.http.post(`${this.API_ECMO_EXTRA}/save`, {
        pid: payload.pid, consumablesText: payload.text,
        updatedBy: String(this.account?.id || this.account?._id || this.account?.accountId || ''),
      }).pipe(
        map(() => ({ ok: true, pid: payload.pid, text: payload.text })),
        catchError(() => of({ ok: false, pid: payload.pid, text: payload.text })),
      )),
      takeUntil(this.destroy$),
    ).subscribe(result => {
      if (result.pid !== this.pid) return;
      this.consumablesSaveState = result.ok ? 'saved' : 'error';
      if (result.ok && this.lastConsumablesDraft?.pid === result.pid && this.lastConsumablesDraft?.text === result.text) this.lastConsumablesDraft = null;
      this.cdr.detectChanges();
    });

    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a => this.account = a);
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(patient => {
      if (!patient?.id) { this.pid = ''; this.records = []; this.values.clear(); this.pages = [{ index: 1, times: [], showConsumables: true }]; this.cdr.detectChanges(); return; }
      const nextPid = String(patient.id).trim();
      if (!nextPid) return;
      const prevPid = this.pid;
      this.pid = nextPid;
      this.setPatient(patient);
      if (nextPid !== prevPid) { this.records = []; this.values.clear(); this.buildPages(); this.load(); this.loadConsumables(nextPid); }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    if (this.lastConsumablesDraft && this.pid) {
      const body = { pid: this.lastConsumablesDraft.pid, consumablesText: this.lastConsumablesDraft.text, updatedBy: String(this.account?.id || this.account?._id || this.account?.accountId || '') };
      this.http.post(`${this.API_ECMO_EXTRA}/save`, body).subscribe({ error: () => {} });
    }
    this.destroy$.next(); this.destroy$.complete();
  }

  /* ---- 患者信息 ---- */
  genderText(g?: string | number): string {
    const v = String(g ?? '').trim();
    if (['Male', 'M', '男', '1'].includes(v)) return '男';
    if (['Female', 'F', '女', '2'].includes(v)) return '女';
    return v;
  }
  private setPatient(patient: any): void { this.patient = patient; this.age = this.calcAge(patient?.birthday); this.diagnosisDisplay = this.formatDiagnosis(patient?.clinicalDiagnosis); }
  private formatDiagnosis(d?: string): string { if (!d) return ''; let idx = -1; for (const sep of [';', '；', ',', '，']) { const cur = d.indexOf(sep); if (cur >= 0 && (idx < 0 || cur < idx)) idx = cur; } return idx >= 0 ? d.substring(0, idx).trim() : d.trim(); }

  private norm(v: unknown): string { return String(v ?? '').trim(); }
  private timeKey(v: unknown): string { return String(v ?? '').trim(); }

  /* ---- Bedside数据 ---- */
  load(): void {
    if (!this.pid) return;
    this.loading = true; this.loadError = '';
    const params = new HttpParams().set('pid', this.pid).set('codes', this.queryCodes.join(','));
    this.http.get<BedsideRecord[] | { data?: BedsideRecord[] }>(`${this.API}/listByPid`, { params }).pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        const source = Array.isArray(response) ? response : Array.isArray((response as any)?.data) ? (response as any).data : [];
        this.signatureRecords = [];
        const allCodes = new Set(this.queryCodes.map(c => this.norm(c)));
        this.records = source.filter(r => r.valid === true && this.norm(r.pid) === this.pid && allCodes.has(this.norm(r.code)));
        // extract param_Yishi signatures
        source.filter(r => r.valid === true && this.norm(r.pid) === this.pid && this.norm(r.code) === 'param_Yishi')
          .forEach(r => {
            const user = this.norm(r.editUser);
            const time = this.norm(r.time);
            if (user && time) this.signatureRecords.push({ time, instant: bedsideTimeValue(time), editUser: user });
          });
        this.signatureRecords.sort((a, b) => a.instant - b.instant);
        this.buildValueMap(); this.buildPages();
        this.loading = false; this.cdr.detectChanges();
      },
      error: e => {
        this.records = []; this.values.clear(); this.pages = [{ index: 1, times: [], showConsumables: true }];
        this.loading = false; this.loadError = e?.error?.message || 'ECMO运行记录加载失败';
        this.cdr.detectChanges();
      },
    });
  }

  /* 别名展开 */
  private metricCodes(m: EcmoMetric): string[] { return [m.code, ...(m.aliases ?? [])].map(c => this.norm(c)); }

  metricValue(metric: EcmoMetric, time: string | undefined): string {
    if (!time) return '';
    for (const c of this.metricCodes(metric)) { const v = this.values.get(this.valueKey(c, time)); if (v !== undefined && v !== null) return v; }
    return '';
  }

  /* 签名 — 来自bedside param_Yishi.editUser */
  signatureAt(time: string | undefined): string {
    if (!time) return '';
    const target = bedsideTimeValue(time);
    if (!Number.isFinite(target)) return '';
    for (let i = this.signatureRecords.length - 1; i >= 0; i--) {
      const s = this.signatureRecords[i];
      if (s.instant <= target && s.editUser) return s.editUser;
    }
    return '';
  }

  displayDate(time: string | undefined): string { return formatBedsideMonthDay(time); }
  displayClock(time: string | undefined): string { return formatBedsideHourMinute(time); }
  timeAt(page: RenderPage, idx: number): string | undefined { return page.times[idx]; }

  /* ---- 耗材 ---- */
  onConsumablesInput(value: string): void { this.consumablesText = value; if (!this.pid) return; const draft = { pid: this.pid, text: value }; this.lastConsumablesDraft = draft; this.consumablesSaveState = 'idle'; this.consumablesSave$.next(draft); }
  flushConsumablesSave(): void {
    if (!this.lastConsumablesDraft || !this.pid) return; const draft = this.lastConsumablesDraft; this.lastConsumablesDraft = null;
    this.consumablesSaveState = 'saving'; this.cdr.detectChanges();
    const body = { pid: draft.pid, consumablesText: draft.text, updatedBy: String(this.account?.id || this.account?._id || this.account?.accountId || '') };
    this.http.post(`${this.API_ECMO_EXTRA}/save`, body).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { if (draft.pid === this.pid) { this.consumablesSaveState = 'saved'; this.cdr.detectChanges(); } },
      error: () => { if (draft.pid === this.pid) { this.consumablesSaveState = 'error'; this.cdr.detectChanges(); } },
    });
  }
  private loadConsumables(pid: string): void {
    this.consumablesText = ''; this.consumablesSaveState = 'idle'; this.lastConsumablesDraft = null;
    this.http.get<any>(`${this.API_ECMO_EXTRA}/latest`, { params: { pid } }).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => { if (pid !== this.pid) return; this.consumablesText = data?.valid === true ? String(data.consumablesText || '') : ''; this.consumablesSaveState = 'idle'; this.cdr.detectChanges(); },
      error: () => { if (pid === this.pid) { this.consumablesText = ''; this.consumablesSaveState = 'error'; this.cdr.detectChanges(); } },
    });
  }

  /* ---- 打印 ---- */
  print(): void {
    const sheets = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.sheet'));
    if (!sheets.length) { alert('没有可打印的表单'); return; }
    if (this.selectedPrintPage !== null && (this.selectedPrintPage < 1 || this.selectedPrintPage > this.pages.length)) { alert('选择的打印页码无效'); return; }
    let body = '';
    sheets.forEach((sheet, i) => {
      if (this.selectedPrintPage !== null && i + 1 !== this.selectedPrintPage) return;
      const c = sheet.cloneNode(true) as HTMLElement;
      const pv = c.querySelector<HTMLElement>('.consumables-print-value');
      if (pv) pv.textContent = this.consumablesText || '';
      c.querySelectorAll('.no-print').forEach(n => n.remove());
      body += `<div class="print-page">${c.outerHTML}</div>`;
    });
    const componentStyles = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\n');
    const pw = window.open('', '_blank', 'width=900,height=700');
    if (!pw) { alert('打印窗口被拦截'); return; }
    pw.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>ECMO运行护理记录单</title><style>${componentStyles}</style><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.no-print{display:none!important}.print-only{display:block!important}.print-page{width:210mm;height:297mm;margin:0;overflow:hidden;break-after:page;page-break-after:always}.print-page:last-child{break-after:auto;page-break-after:auto}.sheet{margin:0!important;box-shadow:none!important}</style></head><body>${body}</body></html>`);
    pw.document.close();
    const run = () => { const doc: any = pw.document; (doc.fonts?.ready || Promise.resolve()).then(() => { requestAnimationFrame(() => requestAnimationFrame(() => { pw.document.querySelectorAll<HTMLElement>('.sheet').forEach((sh, i) => { if (sh.scrollHeight > sh.clientHeight + 1) console.warn(`第${i + 1}页溢出`, sh.scrollHeight - sh.clientHeight); }); pw.focus(); pw.print(); })); }); };
    if (pw.document.readyState === 'complete') run(); else pw.addEventListener('load', run, { once: true });
    pw.addEventListener('afterprint', () => { try { pw.close(); } catch { /* ignore */ } }, { once: true });
  }

  /* ---- 内部 ---- */
  private valueKey(code: unknown, time: unknown): string { return `${this.norm(code)} ${this.timeKey(time)}`; }

  private buildValueMap(): void {
    this.values.clear();
    const ordered = [...this.records].sort((a, b) => this.ts(a.time) - this.ts(b.time) || this.ts(a.editTime) - this.ts(b.editTime));
    for (const r of ordered) { const c = this.norm(r.code); const t = this.timeKey(r.time); if (!c || !t) continue; this.values.set(this.valueKey(c, t), String(r.strVal ?? '')); }
  }

  private buildPages(): void {
    const uniqueTimes = Array.from(new Set(this.records.map(r => String(r.time || '').trim()).filter(Boolean))).sort((a, b) => this.ts(a) - this.ts(b));
    const pages: RenderPage[] = [];
    if (uniqueTimes.length) { for (let i = 0; i < uniqueTimes.length; i += 8) pages.push({ index: 0, times: uniqueTimes.slice(i, i + 8), showConsumables: false }); }
    else { pages.push({ index: 0, times: [], showConsumables: false }); }
    if (pages.length) pages[pages.length - 1].showConsumables = true;
    this.pages = pages.map((p, i) => { p.index = i + 1; return p; });
    this.selectedPrintPage = null;
  }

  private ts(v?: string): number { return bedsideTimeValue(v); }
  private calcAge(birthday?: string): number | null { if (!birthday) return null; const b = new Date(birthday); if (Number.isNaN(b.getTime())) return null; const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a >= 0 ? a : null; }
}
