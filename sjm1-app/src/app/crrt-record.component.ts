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
interface CrrtStatusPoint { instant: number; treatmentStatus: string; }
type CrrtSessionStatus = 'ongoing' | 'ended';
interface CrrtSession { index: number; points: CrrtStatusPoint[]; startInstant: number; endInstant: number; allTimeInstants: number[]; pageTimeInstants: number[][]; status: CrrtSessionStatus; }

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

  sessions: CrrtSession[] = [];
  selectedSession: CrrtSession | null = null;
  selectedSessionId: number | null = null;
  visibleGroupsForSession: CrrtGroup[] = [];

  get sessionOptions(): Array<{ id: number; label: string }> {
    return this.sessions.map(s => ({
      id: s.index,
      label: `第 ${s.index} 场 (${this.sessionStartText(s)})${s.status === 'ongoing' ? ' — 治疗中' : ''}`,
    }));
  }
  patient: any = null; account: any = null;
  pid = ''; age: number | null = null; diagnosisDisplay = '';
  loading = false; loadError = '';
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
      if (next !== prev) { this.values.clear(); this.yishiRecords = []; this.accountNameMap.clear(); this.sessions = []; this.selectedSession = null; this.selectedSessionId = null; this.visibleGroupsForSession = []; this.load(); }
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
  private reset(): void { this.pid = ''; this.patient = null; this.values.clear(); this.yishiRecords = []; this.accountNameMap.clear(); this.sessions = []; this.selectedSession = null; this.selectedSessionId = null; this.visibleGroupsForSession = []; }

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

    const timeInstants = [...timeMap.values()].sort((a, b) => a.instant - b.instant).map(tp => tp.instant);

    // 会话拆分
    const statusPoints = this.normalizeTreatmentStatus(records);
    this.sessions = this.buildSessions(statusPoints);
    this.assignSessionTimeInstants(this.sessions, timeInstants);
    this.applyDefaultSession();
    this.rebuildSelectedSession();

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

  signatureAtForSession(instant: number | undefined, session: CrrtSession | null): string {
    if (instant === undefined || !Number.isFinite(instant) || !session) return '';
    const sessionInstants = new Set(session.allTimeInstants);
    for (let i = this.yishiRecords.length - 1; i >= 0; i--) {
      const s = this.yishiRecords[i];
      if (s.instant <= instant && sessionInstants.has(s.instant) && s.editUser) {
        return this.accountNameMap.get(s.editUser) || '';
      }
    }
    return '';
  }

  private normalizeTreatmentStatus(records: BedsideRecord[]): CrrtStatusPoint[] {
    const statusRecords = records
      .filter(r => String(r.code ?? '').trim() === 'param_CRRT治疗状态')
      .map(r => {
        const instant = databaseTimeValue(String(r.time ?? '').trim());
        const status = String(r.strVal ?? '').trim();
        return { instant, status } as { instant: number; status: string };
      })
      .filter(r => Number.isFinite(r.instant) && r.status);

    if (statusRecords.length === 0) return [];

    statusRecords.sort((a, b) => a.instant - b.instant);

    const points: CrrtStatusPoint[] = [];
    let lastStatus: string | null = null;
    let lastUpInstant: number | null = null;

    for (const rec of statusRecords) {
      const isUp = rec.status === '上机';
      const isDown = rec.status === '下机';

      if (rec.status === lastStatus) {
        if (!isUp) continue;
        if (isUp && lastUpInstant !== null) continue;
      }

      if (isUp && lastStatus === '上机' && lastUpInstant !== null) continue;

      points.push({ instant: rec.instant, treatmentStatus: rec.status });
      lastStatus = rec.status;
      if (isUp) lastUpInstant = rec.instant;
      else if (isDown) lastUpInstant = null;
    }

    return points;
  }

  private buildSessions(statusPoints: CrrtStatusPoint[]): CrrtSession[] {
    const sessions: CrrtSession[] = [];
    let sessionIndex = 1;
    let currentPoints: CrrtStatusPoint[] = [];
    let lastStatus: string | null = null;

    for (const point of statusPoints) {
      if (point.treatmentStatus === '上机') {
        if (lastStatus === '上机' && currentPoints.length > 0) {
          currentPoints.push(point);
        } else {
          if (currentPoints.length > 0) {
            sessions.push(this.createSession(sessionIndex++, currentPoints));
          }
          currentPoints = [point];
        }
      } else if (point.treatmentStatus === '下机') {
        currentPoints.push(point);
        sessions.push(this.createSession(sessionIndex++, currentPoints));
        currentPoints = [];
      } else {
        currentPoints.push(point);
      }
      lastStatus = point.treatmentStatus;
    }

    if (currentPoints.length > 0) {
      sessions.push(this.createSession(sessionIndex++, currentPoints));
    }

    return sessions;
  }

  private createSession(index: number, points: CrrtStatusPoint[]): CrrtSession {
    const startInstant = points[0].instant;
    const endInstant = points[points.length - 1].instant;
    const status: CrrtSessionStatus = points[points.length - 1].treatmentStatus === '下机' ? 'ended' : 'ongoing';
    return { index, points, startInstant, endInstant, allTimeInstants: [], pageTimeInstants: [], status };
  }

  private isInSession(instant: number, session: CrrtSession): boolean {
    return instant >= session.startInstant && instant <= session.endInstant;
  }

  private assignSessionTimeInstants(sessions: CrrtSession[], allSortedInstants: number[]): void {
    for (const session of sessions) {
      const sessionInstants = allSortedInstants.filter(t => this.isInSession(t, session));
      session.allTimeInstants = sessionInstants;

      session.pageTimeInstants = [];
      for (let i = 0; i < Math.max(1, sessionInstants.length); i += 8) {
        session.pageTimeInstants.push(sessionInstants.slice(i, i + 8));
      }
      if (session.pageTimeInstants.length === 0) session.pageTimeInstants.push([]);
    }
    // 不在任何上机~下机范围内的数据点直接丢弃，不生成 orphan 会话
  }

  private applyDefaultSession(): void {
    if (this.sessions.length > 0) {
      this.selectedSessionId = this.sessions[this.sessions.length - 1].index;
      this.selectedSession = this.sessions[this.sessions.length - 1];
    } else {
      this.selectedSessionId = null;
      this.selectedSession = null;
    }
  }

  private rebuildSelectedSession(): void {
    this.visibleGroupsForSession = this.buildVisibleGroupsForSession(this.selectedSession);
  }

  private buildVisibleGroupsForSession(session: CrrtSession | null): CrrtGroup[] {
    if (!session || session.allTimeInstants.length === 0) return CRRT_GROUPS;

    const sessionInstants = new Set(session.allTimeInstants);
    const metricHasValue = (metric: CrrtMetric): boolean =>
      [...this.values.entries()].some(([key, value]) => {
        if (!key.startsWith(metric.code + '@@')) return false;
        const instant = Number(key.split('@@')[1]);
        return sessionInstants.has(instant) && value.trim().length > 0;
      });

    const hasAnyValue = CRRT_GROUPS.some(group => group.metrics.some(metricHasValue));
    return hasAnyValue
      ? CRRT_GROUPS.map(group => ({ ...group, metrics: group.metrics.filter(metricHasValue) })).filter(group => group.metrics.length > 0)
      : CRRT_GROUPS;
  }

  onSessionChange(sessionId: number | null): void {
    this.selectedSession = sessionId != null ? this.sessions.find(s => s.index === sessionId) ?? null : null;
    this.rebuildSelectedSession();
  }

  get pages(): RenderPage[] {
    if (!this.selectedSession) return [{ index: 1, timeInstants: [] }];
    return this.selectedSession.pageTimeInstants.map((instants, i) => ({ index: i + 1, timeInstants: instants }));
  }

  formatSessionDateTime(instant: number | undefined): string {
    if (instant === undefined || !Number.isFinite(instant)) return '';
    return formatShanghaiDate(instant) + ' ' + formatShanghaiHourMinute(instant);
  }

  sessionStartText(session: CrrtSession | null): string {
    return session ? this.formatSessionDateTime(session.startInstant) : '';
  }

  sessionEndText(session: CrrtSession | null): string {
    return session ? this.formatSessionDateTime(session.endInstant) : '';
  }

  sessionStatusText(session: CrrtSession | null): string {
    if (!session) return '';
    return session.status === 'ongoing' ? '治疗中' : '已结束';
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
