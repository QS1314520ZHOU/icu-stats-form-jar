import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject, catchError, distinctUntilChanged, filter, finalize, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';

interface AccountOption { accountId: string; accountName: string; username?: string; code?: string; }
interface AccountSignature { accountId: string; accountName: string; }
interface VitalSigns { temperature: string; pulse: string; respiration: string; systolic: string; diastolic: string; }
interface BloodProductSnapshot { bloodProductId: string; source: 'manual' | 'transfusion-system'; bagNo: string; aboType: string; rhType: string; productType: string; dose: string; doseUnit: string; expiresAt: string; }
interface TransfusionItem {
  product: BloodProductSnapshot; receiveAt: string; receiver: AccountSignature | null;
  preVitals: VitalSigns; appearance: '' | '正常' | '不正常'; crossMatch: '' | '相合' | '不相合';
  deviceQualified: '' | '是' | '否'; salineBefore: '' | '是' | '否'; identityMatched: '' | '一致' | '不一致';
  bedsideVerifier1: AccountSignature | null; bedsideVerifier2: AccountSignature | null;
  startAt: string; slowReaction: '' | '无' | '有'; slowReactionSigner: AccountSignature | null;
  after15Vitals: VitalSigns; dripRate: string; duringReaction: '' | '无' | '有'; duringReactionSigner: AccountSignature | null;
  salineAfter: '' | '是' | '否'; harmlessDisposal: '' | '是' | '否'; postVitals: VitalSigns;
  endAt: string; endSigner: AccountSignature | null; adverseReaction: '' | '无' | '有'; recorder: AccountSignature | null;
}
interface TransfusionPage { pageId: string; pageNo: number; items: TransfusionItem[]; persisted?: boolean; }
interface TransfusionRecord { id?: string; pid: string; pages: TransfusionPage[]; valid: boolean; version?: number; createdBy?: string; createdAt?: string; updatedBy?: string; updatedAt?: string; }

type AutoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

@Component({ standalone: false, selector: 'app-transfusion-record', templateUrl: './transfusion-record.component.html', styleUrls: ['./transfusion-record.component.css'] })
export class TransfusionRecordComponent implements OnInit, OnDestroy {
  private readonly API = '/api/v1/icu/transfusion-record'; private readonly destroy$ = new Subject<void>();
  patient: any = null; account: any = null; pid = ''; age: number | null = null; diagnosisDisplay = '';
  record: TransfusionRecord | null = null; pages: TransfusionPage[] = [];
  selectedPageNo = 1; selectedPrintPage: number | null = null;
  loading = false; deleting = false; loadError = '';
  private defaultPlaceholderPageId: string | null = null;
  accounts: AccountOption[] = [];
  productDialogOpen = false; productTarget: { pageId: string; itemIndex: number } | null = null;
  productDraft: BloodProductSnapshot = this.emptyProduct(); productLoading = false; availableProducts: BloodProductSnapshot[] = [];

  /* 自动保存 */
  autoSaveState: AutoSaveState = 'idle';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight = false;
  private saveAgainAfterCurrent = false;
  private dirtyPageIds = new Set<string>();
  private localRevision = 0;
  private savedRevision = 0;

  constructor(private readonly http: HttpClient, private readonly hostPatient: HostPatientService, private readonly cdr: ChangeDetectorRef, private readonly host: ElementRef) {}

  ngOnInit(): void {
    this.loadAccounts();
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a => this.account = a);
    this.hostPatient.patient$.pipe(filter(Boolean), map(p => ({ p, pid: String(p.id || '').trim() })), filter(x => !!x.pid),
      distinctUntilChanged((a, b) => a.pid === b.pid),
      tap(({ p, pid }) => { if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; } this.closeProductDialog(); this.patient = p; this.pid = pid; this.age = this.calcAge(p.birthday); this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis); this.record = null; this.pages = []; this.dirtyPageIds.clear(); this.localRevision = 0; this.savedRevision = 0; this.autoSaveState = 'idle'; this.saveInFlight = false; this.saveAgainAfterCurrent = false; this.selectedPageNo = 1; this.selectedPrintPage = null; this.loadError = ''; }),
      switchMap(({ pid }) => this.fetchRecord(pid)), takeUntil(this.destroy$)).subscribe();
  }
  ngOnDestroy(): void { if (this.saveTimer) clearTimeout(this.saveTimer); this.destroy$.next(); this.destroy$.complete(); }

  get selectedPage(): TransfusionPage | null { return this.pages.find(p => p.pageNo === this.selectedPageNo) || null; }

  get orderedAccounts(): AccountOption[] {
    const cid = this.currentAccountId();
    return [...this.accounts].sort((a, b) => { const aC = a.accountId === cid; const bC = b.accountId === cid; if (aC && !bC) return -1; if (!aC && bC) return 1; return a.accountName.localeCompare(b.accountName, 'zh-CN'); });
  }

  private fetchRecord(pid: string) {
    this.loading = true; this.loadError = '';
    return this.http.get<TransfusionRecord>(`${this.API}/byPid`, { params: { pid } }).pipe(
      catchError((e: HttpErrorResponse) => { if (e.status === 404) return of(null); if (pid === this.pid) this.loadError = e.error?.message || '加载失败'; return of(null); }),
      tap(r => { if (pid !== this.pid) return; if (r && r.pid === pid && Array.isArray(r.pages) && r.pages.length > 0) this.applyRecord(r); else this.showDefaultBlankPage(); }),
      finalize(() => { if (pid === this.pid) { this.loading = false; this.cdr.detectChanges(); } }));
  }

  private applyRecord(r: TransfusionRecord): void { this.record = { ...r, pages: Array.isArray(r.pages) ? r.pages : [] }; this.pages = this.record.pages.sort((a, b) => a.pageNo - b.pageNo).map((p, i) => this.normalizePage({ ...p, pageNo: i + 1, persisted: true })); if (!this.pages.length) this.pages = [this.emptyPage(1)]; if (this.selectedPageNo > this.pages.length) this.selectedPageNo = this.pages.length; if (this.selectedPageNo < 1) this.selectedPageNo = 1; this.selectedPrintPage = null; }

  /* ---- 页面始终可编辑：自动保存 ---- */
  onPageChanged(page: TransfusionPage): void {
    if (!this.pid) return;
    this.localRevision++; this.dirtyPageIds.add(page.pageId); this.autoSaveState = 'dirty';
    if (this.saveInFlight) { this.saveAgainAfterCurrent = true; }
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); }
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flushPageSave(page); }, 800);
  }

  flushPageSave(page: TransfusionPage): void {
    if (!this.pid || !this.dirtyPageIds.has(page.pageId)) return;
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.saveInFlight) { this.saveAgainAfterCurrent = true; return; }
    const op = this.pid; const reqRev = this.localRevision; const cid = page.pageId; const snap = structuredClone(page);
    this.saveInFlight = true; this.saveAgainAfterCurrent = false; this.autoSaveState = 'saving';
    const body = { pid: op, page: { pageId: page.persisted ? page.pageId : '', pageNo: page.pageNo, items: snap.items }, version: this.record?.version ?? null, operatorId: this.currentAccountId() };
    this.http.post<TransfusionRecord>(`${this.API}/savePageTyped`, body).pipe(finalize(() => { this.saveInFlight = false; this.cdr.detectChanges(); }), takeUntil(this.destroy$)).subscribe({
      next: saved => { if (op !== this.pid) return; this.updateIdentity(saved, cid, snap.pageNo); if (reqRev === this.localRevision) { this.dirtyPageIds.delete(cid); this.savedRevision = reqRev; this.autoSaveState = 'saved'; } else { this.autoSaveState = 'dirty'; this.saveAgainAfterCurrent = true; } if (this.saveAgainAfterCurrent || this.localRevision > reqRev) { const cp = this.pages.find(p => p.pageNo === snap.pageNo); if (cp) queueMicrotask(() => this.flushPageSave(cp)); } },
      error: (e: HttpErrorResponse) => { this.autoSaveState = 'error'; if (e.status === 409) alert('记录已被其他人员修改，请刷新后重试'); }
    });
  }

  retryAutoSave(): void { const p = this.selectedPage; if (p && this.dirtyPageIds.has(p.pageId)) { this.autoSaveState = 'dirty'; this.flushPageSave(p); } }

  private updateIdentity(saved: TransfusionRecord, oldId: string, pageNo: number): void {
    this.record = { ...(this.record || { pid: this.pid, pages: [], valid: true }), id: saved.id, version: saved.version, valid: saved.valid, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy };
    const sp = saved.pages?.find(x => x.pageNo === pageNo); if (!sp) return;
    const lp = this.pages.find(x => x.pageId === oldId || x.pageNo === pageNo); if (!lp) return;
    const wasDirty = this.dirtyPageIds.has(oldId); lp.pageId = sp.pageId; lp.persisted = true;
    if (wasDirty) { this.dirtyPageIds.delete(oldId); this.dirtyPageIds.add(sp.pageId); }
  }

  addPage(): void { if (!this.pid || this.saveInFlight) return; const draft = this.pages.find(p => p.persisted !== true); if (draft) { this.selectedPageNo = draft.pageNo; return; } const p = this.emptyPage(this.pages.length + 1); this.pages = [...this.pages, p]; this.selectedPageNo = p.pageNo; this.onPageChanged(p); }

  deleteCurrentPage(): void {
    const page = this.selectedPage; if (!page || this.deleting) return;
    if (this.dirtyPageIds.has(page.pageId)) { this.flushPageSave(page); return; }
    if (!page.persisted || !this.record?.id) { this.pages = this.pages.filter(p => p.pageId !== page.pageId).map((p, i) => ({ ...p, pageNo: i + 1 })); if (!this.pages.length) this.showDefaultBlankPage(); this.selectedPageNo = Math.min(this.selectedPageNo, this.pages.length); return; }
    if (!confirm(`确认删除第 ${page.pageNo} 页？`)) return;
    const op = this.pid; this.deleting = true;
    this.http.delete<TransfusionRecord>(`${this.API}/page/${encodeURIComponent(page.pageId)}`, { params: { pid: op, version: String(this.record.version ?? ''), operatorId: this.currentAccountId() } }).pipe(finalize(() => { this.deleting = false; this.cdr.detectChanges(); }), takeUntil(this.destroy$)).subscribe({
      next: r => { if (op !== this.pid) return; this.applyRecord(r); },
      error: (e: HttpErrorResponse) => { if (e.status === 409) alert('记录已被其他人员修改'); else alert(e.error?.message || '删除失败'); }
    });
  }

  onSelectedPageChange(next: number): void { const cur = this.selectedPage; if (cur && this.dirtyPageIds.has(cur.pageId)) this.flushPageSave(cur); this.selectedPageNo = Number(next); }

  print(): void {
    const cur = this.selectedPage; if (cur && this.dirtyPageIds.has(cur.pageId)) { this.flushPageSave(cur); return; }
    window.print();
  }

  /* 时间控件 */
  openDatePicker(input: HTMLInputElement): void { input.focus(); try { (input as any).showPicker?.(); } catch { input.click(); } }
  onDateCellClick(event: Event): void { const inp = (event.currentTarget as HTMLElement).querySelector('input'); if (inp) this.openDatePicker(inp); }

  /* 签名 */
  setSigner(item: TransfusionItem, field: keyof TransfusionItem, accountId: string): void { if (!accountId) { (item as any)[field] = null; return; } const a = this.accounts.find(x => x.accountId === accountId); (item as any)[field] = a ? { accountId: a.accountId, accountName: a.accountName } : null; }
  signerId(item: TransfusionItem, field: keyof TransfusionItem): string { return ((item as any)[field] as AccountSignature | null)?.accountId || ''; }
  signerName(item: TransfusionItem, field: keyof TransfusionItem): string { return ((item as any)[field] as AccountSignature | null)?.accountName || ''; }

  /* 血液制品弹框 */
  openProductSelector(page: TransfusionPage, itemIndex: number): void { this.productTarget = { pageId: page.pageId, itemIndex }; this.productDraft = structuredClone(page.items[itemIndex].product); this.productDialogOpen = true; this.loadAvailableProducts(); }
  selectAvailableProduct(p: BloodProductSnapshot): void { this.productDraft = { ...structuredClone(p), source: 'transfusion-system' }; }
  confirmProduct(): void { if (!this.productTarget) return; const pg = this.pages.find(x => x.pageId === this.productTarget!.pageId); if (!pg) return; pg.items[this.productTarget.itemIndex].product = structuredClone(this.productDraft); this.closeProductDialog(); this.onPageChanged(pg); this.flushPageSave(pg); }
  closeProductDialog(): void { this.productDialogOpen = false; this.productTarget = null; this.productDraft = this.emptyProduct(); this.availableProducts = []; }
  private loadAvailableProducts(): void { this.productLoading = true; this.http.get<BloodProductSnapshot[]>('/api/v1/icu/transfusion-products/available', { params: { pid: this.pid } }).pipe(finalize(() => { this.productLoading = false; this.cdr.detectChanges(); }), takeUntil(this.destroy$)).subscribe({ next: r => { this.availableProducts = Array.isArray(r) ? r : []; }, error: () => { this.availableProducts = []; } }); }

  private loadAccounts(): void { this.http.get<any[]>('/api/v1/icu/accounts').pipe(takeUntil(this.destroy$)).subscribe({ next: rows => { const src = Array.isArray(rows) ? rows : []; this.accounts = src.map(r => ({ accountId: String(r?.accountId ?? r?._id ?? r?.id ?? '').trim(), accountName: String(r?.accountName ?? r?.trueName ?? r?.name ?? '').trim(), username: String(r?.username ?? r?.loginName ?? '').trim(), code: String(r?.code ?? r?.jobNumber ?? '').trim() })).filter(a => !!a.accountId && !!a.accountName); }, error: () => { this.accounts = []; } }); }

  private createDraftPageId(): string { try { const co = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined; if (co && typeof co.randomUUID === 'function') return `draft-${co.randomUUID()}`; } catch { /* fallback */ } return ['draft', Date.now().toString(36), Math.random().toString(36).slice(2), Math.random().toString(36).slice(2)].join('-'); }
  private showDefaultBlankPage(): void { const p = this.emptyPage(1); this.record = null; this.defaultPlaceholderPageId = p.pageId; this.pages = [p]; this.selectedPageNo = 1; this.selectedPrintPage = null; this.dirtyPageIds.clear(); this.autoSaveState = 'idle'; }
  private emptyPage(no: number): TransfusionPage { return { pageId: this.createDraftPageId(), pageNo: no, items: [this.emptyItem(), this.emptyItem(), this.emptyItem()], persisted: false }; }
  private normalizePage(page: TransfusionPage): TransfusionPage { const items = (Array.isArray(page.items) ? page.items.slice(0, 3) : []); while (items.length < 3) items.push(this.emptyItem()); return { ...page, pageId: page.pageId || this.createDraftPageId(), items: items.map(i => ({ ...this.emptyItem(), ...i, product: { ...this.emptyProduct(), ...(i.product || {}) }, preVitals: { ...this.emptyVitals(), ...(i.preVitals || {}) }, after15Vitals: { ...this.emptyVitals(), ...(i.after15Vitals || {}) }, postVitals: { ...this.emptyVitals(), ...(i.postVitals || {}) } })) }; }
  private emptyItem(): TransfusionItem { return { product: this.emptyProduct(), receiveAt: '', receiver: null, preVitals: this.emptyVitals(), appearance: '', crossMatch: '', deviceQualified: '', salineBefore: '', identityMatched: '', bedsideVerifier1: null, bedsideVerifier2: null, startAt: '', slowReaction: '', slowReactionSigner: null, after15Vitals: this.emptyVitals(), dripRate: '', duringReaction: '', duringReactionSigner: null, salineAfter: '', harmlessDisposal: '', postVitals: this.emptyVitals(), endAt: '', endSigner: null, adverseReaction: '', recorder: null }; }
  private emptyVitals(): VitalSigns { return { temperature: '', pulse: '', respiration: '', systolic: '', diastolic: '' }; }
  private emptyProduct(): BloodProductSnapshot { return { bloodProductId: '', source: 'manual', bagNo: '', aboType: '', rhType: '', productType: '', dose: '', doseUnit: '', expiresAt: '' }; }
  private currentAccountId(): string { return String(this.account?.id ?? this.account?._id ?? this.account?.accountId ?? '').trim(); }
  genderText(g?: string | number): string { const v = String(g ?? '').trim(); if (['Male', 'M', '男', '1'].includes(v)) return '男'; if (['Female', 'F', '女', '2'].includes(v)) return '女'; return v; }
  fmtDateTime(v?: string): string { if (!v) return ''; const d = new Date(v); if (Number.isNaN(d.getTime())) return v; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  toLocalInput(v?: string): string { if (!v) return ''; const d = new Date(v); if (Number.isNaN(d.getTime())) return ''; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
  private calcAge(v?: string): number | null { if (!v) return null; const b = new Date(v); if (Number.isNaN(b.getTime())) return null; const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a >= 0 ? a : null; }
  private formatDiagnosis(v?: string): string { if (!v) return ''; let idx = -1; for (const s of [';', '；', ',', '，']) { const c = v.indexOf(s); if (c >= 0 && (idx < 0 || c < idx)) idx = c; } return idx >= 0 ? v.substring(0, idx).trim() : v.trim(); }
}
