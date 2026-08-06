import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { databaseTimeValue, formatShanghaiDate, formatShanghaiHourMinute } from './form-date.util';

interface BedsideRecord { pid: string|number; code: string; time: string; strVal?: string; valid: boolean|string|number; editUser?: string; }
interface CrrtMetric { label: string; code: string; unit?: string; }
interface CrrtGroup { name: string; metrics: CrrtMetric[]; }
interface TimePoint { instant: number; rawTime: string; }
interface RenderPage { index: number; timeInstants: number[]; }

const CRRT_GROUPS: CrrtGroup[] = [
  { name: '治疗模式', metrics: [
    { label: '治疗模式', code: 'param_CBP_Mode' },
    { label: '治疗状态', code: 'param_CRRT治疗状态' },
  ]},
  { name: '抗凝方式', metrics: [
    { label: '抗凝剂1名称', code: 'param_抗凝剂1' },
    { label: '抗凝剂1速度', code: 'param_抗凝剂速度' },
    { label: '抗凝剂2名称', code: 'param_抗凝剂2' },
    { label: '抗凝剂2速度', code: 'param_抗凝剂2速度' },
  ]},
  { name: '治疗处方', metrics: [
    { label: '血流速度', code: 'param_血流速度' },
    { label: '前置换速度', code: 'param_CBP_set_PRE_REPL_Flow' },
    { label: '后置换速度', code: 'param_CBP_set_POST_REPL_Flow' },
    { label: '置换液更换', code: 'param_置换液更换' },
    { label: '透析液速度', code: 'param_CBP_set_DIAL_Flow' },
    { label: '透析液更换', code: 'param_透析液更换' },
    { label: '碳酸氢钠速度', code: 'param_CBP_tanSQNZS' },
    { label: '葡萄糖酸钙速度', code: 'param_葡萄糖酸钙' },
  ]},
  { name: '治疗参数', metrics: [
    { label: '超滤率', code: 'param_CBP_set_UFR' },
    { label: '超滤量/总脱水量', code: 'param_净超滤量2' },
    { label: '生理盐水', code: 'param_生理盐水' },
    { label: '净超滤量', code: 'param_chaoLvLiang' },
    { label: '分浆速度', code: 'param_分浆速度' },
    { label: '弃浆速度', code: 'param_弃浆速度' },
    { label: '补浆速度', code: 'param_补浆速度' },
    { label: '血浆置换总量', code: 'param_血浆置换总量' },
  ]},
  { name: '压力参数', metrics: [
    { label: '动脉压PA', code: 'param_CBP_dongMY' },
    { label: '静脉压PV', code: 'param_CBP_jingMY' },
    { label: '滤前压PBE', code: 'param_滤前压PBE' },
    { label: '跨膜压TMP', code: 'param_CBP_kuaMY' },
  ]},
  { name: '治疗监测', metrics: [
    { label: '滤器前钙', code: 'param_滤器前钙' },
    { label: '滤器后钙', code: 'param_滤器后钙' },
    { label: '滤器前APTT', code: 'param_滤器前APTT' },
    { label: '滤器后APTT', code: 'param_滤器后APTT' },
    { label: '穿刺点情况', code: 'param_CBP_chuanCiDian' },
  ]},
  { name: '下机', metrics: [
    { label: '体外循环凝血等级', code: 'param_滤器凝血等级' },
  ]},
  { name: '备注', metrics: [
    { label: '备注', code: 'param_备注' },
  ]},
];

const CRRT_BUILD_MARKER = 'crrt-metric-map-20260806-v2';

@Component({
  standalone: false, selector: 'app-crrt-record',
  templateUrl: './crrt-record.component.html', styleUrls: ['./crrt-record.component.css'],
})
export class CrrtRecordComponent implements OnInit, OnDestroy {
  private readonly API = '/api/v1/icu/bedside';
  private readonly destroy$ = new Subject<void>();
  private readonly values = new Map<string, string>();
  private yishiRecords: Array<{ instant: number; editUser: string }> = [];
  private accountNameMap = new Map<string, string>();

  readonly groups = CRRT_GROUPS;
  readonly metricCodes = CRRT_GROUPS.flatMap(g => g.metrics.map(m => m.code));
  readonly queryCodes = Array.from(new Set([...this.metricCodes, 'param_Yishi']));
  readonly columnIndexes = [0, 1, 2, 3, 4, 5, 6, 7];

  visibleGroups: CrrtGroup[] = [];
  patient: any = null; account: any = null;
  pid = ''; age: number | null = null; diagnosisDisplay = '';
  loading = false; loadError = '';
  pages: RenderPage[] = [{ index: 1, timeInstants: [] }];
  selectedPrintPage: number | null = null;

  constructor(private http: HttpClient, private hostPatient: HostPatientService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.info(`%c[CRRT BUILD] ${CRRT_BUILD_MARKER}`, 'color:#1677c8;font-weight:bold');
    console.table(CRRT_GROUPS.flatMap(g => g.metrics.map(m => ({ group: g.name, label: m.label, code: m.code }))));
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a => this.account = a);
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p?.id) { this.reset(); return; }
      const next = String(p.id).trim(); if (!next) return;
      const prev = this.pid;
      this.patient = p; this.pid = next;
      this.age = this.calcAge(p.birthday);
      this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis);
      if (next !== prev) { this.values.clear(); this.yishiRecords = []; this.accountNameMap.clear(); this.visibleGroups = []; this.pages = [{ index: 1, timeInstants: [] }]; this.load(); }
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
  private reset(): void { this.pid = ''; this.patient = null; this.values.clear(); this.yishiRecords = []; this.accountNameMap.clear(); this.visibleGroups = []; this.pages = [{ index: 1, timeInstants: [] }]; }

  load(): void {
    if (!this.pid) return;
    const requestPid = this.pid;
    this.loading = true; this.loadError = '';
    const params = new HttpParams().set('pid', this.pid).set('codes', this.queryCodes.join(','));
    this.http.get<BedsideRecord[] | { data?: BedsideRecord[] }>(`${this.API}/listByPid`, { params })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: r => {
          if (requestPid !== this.pid) return;
          const src = Array.isArray(r) ? r : (r as any)?.data || [];
          this.build(src.filter((x: any) => { const ok = x.valid === true || x.valid === 1 || x.valid === '1' || String(x.valid).toLowerCase() === 'true'; return ok && String(x.pid ?? '').trim() === this.pid; }));
          this.loading = false; this.cdr.detectChanges();
        },
        error: e => { if (requestPid !== this.pid) return; this.loadError = e?.error?.message || 'CRRT记录加载失败'; this.loading = false; this.build([]); this.cdr.detectChanges(); },
      });
  }

  private build(records: BedsideRecord[]): void {
    this.values.clear(); this.yishiRecords = []; this.accountNameMap.clear();
    const metricSet = new Set(this.metricCodes);
    const timeMap = new Map<number, TimePoint>();
    const editUserIds = new Set<string>();

    records.forEach(r => {
      const code = String(r.code ?? '').trim();
      const time = String(r.time ?? '').trim();
      if (!code || !time) return;
      const instant = databaseTimeValue(time);
      if (!Number.isFinite(instant)) return;
      if (code === 'param_Yishi') {
        const user = String(r.editUser ?? '').trim();
        if (user) { this.yishiRecords.push({ instant, editUser: user }); editUserIds.add(user); }
      } else if (metricSet.has(code)) {
        const value = String(r.strVal ?? '').trim();
        if (!value) return;
        if (!timeMap.has(instant)) timeMap.set(instant, { instant, rawTime: time });
        this.values.set(`${code}@@${instant}`, value);
      }
    });

    this.yishiRecords.sort((a, b) => a.instant - b.instant);

    // 汇总：哪些参数行有值（per-metric 级别过滤）
    const metricHasValue = (metric: CrrtMetric): boolean =>
      [...this.values.entries()].some(([key, value]) => key.startsWith(metric.code + '@@') && value.trim().length > 0);
    const hasAnyValue = CRRT_GROUPS.some(group => group.metrics.some(metricHasValue));
    this.visibleGroups = hasAnyValue
      ? CRRT_GROUPS
          .map(group => ({ ...group, metrics: group.metrics.filter(metricHasValue) }))
          .filter(group => group.metrics.length > 0)
      : CRRT_GROUPS;

    const timeInstants = [...timeMap.values()].sort((a, b) => a.instant - b.instant).map(tp => tp.instant);
    this.pages = [];
    for (let i = 0; i < Math.max(1, timeInstants.length); i += 8) {
      this.pages.push({ index: 0, timeInstants: timeInstants.slice(i, i + 8) });
    }
    if (!this.pages.length) this.pages.push({ index: 0, timeInstants: [] });
    this.pages = this.pages.map((p, i) => ({ ...p, index: i + 1 }));
    this.selectedPrintPage = null;

    if (editUserIds.size) this.loadAccountNames([...editUserIds]);
  }

  metricValue(metric: CrrtMetric, instant: number | undefined): string {
    if (instant === undefined || !Number.isFinite(instant)) return '';
    return this.values.get(`${metric.code}@@${instant}`) ?? '';
  }

  signatureAt(instant: number | undefined): string {
    if (instant === undefined || !Number.isFinite(instant)) return '';
    for (let i = this.yishiRecords.length - 1; i >= 0; i--) {
      const s = this.yishiRecords[i];
      if (s.instant <= instant && s.editUser) return this.accountNameMap.get(s.editUser) || '';
    }
    return '';
  }

  displayDate(instant: number | undefined): string { return instant !== undefined ? formatShanghaiDate(instant) : ''; }
  displayClock(instant: number | undefined): string { return instant !== undefined ? formatShanghaiHourMinute(instant) : ''; }
  instantAt(page: RenderPage, idx: number): number | undefined { return page.timeInstants[idx]; }

  private loadAccountNames(ids: string[]): void {
    if (!ids.length) return;
    const params = new HttpParams().set('ids', ids.join(','));
    this.http.get<any[]>('/api/v1/icu/accounts/listByIds', { params }).pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => { (Array.isArray(rows) ? rows : []).forEach(r => { const id = this.norm(r?.accountId ?? r?._id ?? r?.id); const name = this.norm(r?.accountName ?? r?.trueName ?? r?.name); if (id && name) this.accountNameMap.set(id, name); }); this.cdr.detectChanges(); },
      error: () => {},
    });
  }

  genderText(g?: string | number): string { const v = String(g ?? '').trim(); if (['Male', 'M', '男', '1'].includes(v)) return '男'; if (['Female', 'F', '女', '2'].includes(v)) return '女'; return v; }
  private norm(v: unknown): string { return String(v ?? '').trim(); }
  private calcAge(b?: string): number | null { if (!b) return null; const d = new Date(b); if (Number.isNaN(d.getTime())) return null; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a >= 0 ? a : null; }
  private formatDiagnosis(d?: string): string { if (!d) return ''; let idx = -1; for (const sep of [';', '；', ',', '，']) { const cur = d.indexOf(sep); if (cur >= 0 && (idx < 0 || cur < idx)) idx = cur; } return idx >= 0 ? d.substring(0, idx).trim() : d.trim(); }
  print(): void { window.print(); }
}
