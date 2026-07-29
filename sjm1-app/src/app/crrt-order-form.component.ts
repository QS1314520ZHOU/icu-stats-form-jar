import { Component, ChangeDetectorRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, firstValueFrom, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

type AutoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface CheckboxOption { id: string; label: string; }
interface AccountOption { accountId: string; accountName: string; profession?: string; }
interface SignatureValue { accountId: string; accountName: string; signedAt?: string | null; }
interface OrderTimeOption { id: string; orderTime: string; updatedAt?: string; }
interface PrescriptionColumn { code: string; dateTime: string; baseSolution: number | null; potassiumChloride: number | null; sodiumChloride: number | null; doctorSignature: SignatureValue | null; executionTime: string; nurseSignature: SignatureValue | null; }
interface OrderItem { dateTime: string; content: string; doctorSignature: SignatureValue | null; executionTime: string; nurseSignature: SignatureValue | null; }
interface AnticoagulationValue {
  types: string[];
  heparinGroupFirstDose: number|null; heparinGroupMaintenance: number|null;
  lowMolecularSodiumFirstDose: number|null; lowMolecularSodiumMaintenance: number|null;
  citrateMaintenance: number|null; calciumMaintenance: number|null;
  nafamostatFirstDose: number|null; nafamostatMaintenance: number|null;
}
interface CrrtOrderFormRecord {
  id?: string; version?: number;
  pid: string; department: string; patientName: string; bedNo: string; age: string; gender: string; hospitalNo: string; diagnosis: string;
  orderTime: string;
  vascularAccess: string[]; treatmentModes: string[]; machineConsumables: string[];
  anticoagulation: AnticoagulationValue;
  cbpDose: { preReplacement: number|null; postReplacement: number|null; dialysate: number|null; sodiumBicarbonate: number|null; plasmaSeparationSpeed: number|null; plasmaDiscardSpeed: number|null; plasmaReplacementSpeed: number|null; totalPlasmaExchange: number|null; };
  replacementFormulaA: { baseSolution: number|null; potassiumChloride: number|null; sodiumChloride: number|null; };
  dialysateFormulaA: { baseSolution: number|null; potassiumChloride: number|null; sodiumChloride: number|null; };
  treatmentPlan: { bloodFlow: number|null; estimatedHours: number|null; ultrafiltrationRate: number|null; };
  doctorSignature: SignatureValue|null; machineNurseSignature: SignatureValue|null; checkNurseSignature: SignatureValue|null;
  replacementPrescriptions: PrescriptionColumn[]; dialysatePrescriptions: PrescriptionColumn[]; orderItems: OrderItem[];
  createdAt?: string; updatedAt?: string;
}

const DOCTOR_PROFS = ['director', 'doctor'];
const NURSE_PROFS = ['nurse', 'matron'];
const ADMIN_PROFS = ['systemadmin', 'admin'];

@Component({
  standalone: false, selector: 'app-crrt-order-form',
  templateUrl: './crrt-order-form.component.html', styleUrls: ['./crrt-order-form.component.css'],
})
export class CrrtOrderFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly apiUrl = '/api/v1/icu/crrt-orders';

  patient: any = null; account: any = null;
  pid = ''; age: number | null = null; diagnosisDisplay = '';
  record: CrrtOrderFormRecord = this.createEmptyRecord();
  timeOptions: OrderTimeOption[] = [];
  selectedRecordId = '';
  doctorAccounts: AccountOption[] = [];
  nurseAccounts: AccountOption[] = [];
  loading = false; isDraft = false; hasRecords = false;
  message = ''; errorMessage = '';
  switchingRecord = false; creating = false;

  /* 新增弹框 */
  createDialogOpen = false;
  createDraftTime = '';
  createDialogError = '';

  /* 打印 */
  selectedPrintPage: number | null = null;
  printingAll = false;
  printAllMode = false;
  printRecords: CrrtOrderFormRecord[] = [];

  /* 自动保存 */
  autoSaveState: AutoSaveState = 'idle';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight = false;
  private saveAgainAfterCurrent = false;
  private localRevision = 0;
  private savedRevision = 0;

  readonly vascularAccessOptions = ['右侧股静脉','左侧股静脉','右侧颈内静脉','左侧颈内静脉','右侧锁骨下静脉','左侧锁骨下静脉','动静脉内瘘','ECMO'];
  readonly vascularAccessLeft = ['右侧股静脉','右侧颈内静脉','右侧锁骨下静脉','动静脉内瘘'];
  readonly vascularAccessRight = ['左侧股静脉','左侧颈内静脉','左侧锁骨下静脉','ECMO'];
  readonly treatmentModeOptions = ['CVVH','CVVHD','CVVHDF','SCUF','HP','PE','DPMAS','DFPP','CPFA','ECCO2R'];
  readonly treatmentModeLeft = ['CVVH','CVVHDF','HP','DPMAS','CPFA'];
  readonly treatmentModeRight = ['CVVHD','SCUF','PE','DFPP','ECCO2R'];
  readonly machineConsumableOptions = ['金宝','日机装','山外山','贝朗','M150','血液滤过管路（日机装）','TWT-CBP-02P（山外山）','一次性使用体外循环血路（贝朗）','AV600S','HA330','HA330-II','膜式血浆分离器','BS330','二级膜 EC-50W','ST150','OXIRIS'];
  readonly machineConsumableRows: ReadonlyArray<ReadonlyArray<CheckboxOption>> = [
    [{ id: 'machine-gambro', label: '金宝' }, { id: 'filter-m150', label: 'M150' }],
    [{ id: 'machine-nikkiso', label: '日机装' }, { id: 'circuit-nikkiso', label: '血液滤过管路（日机装）' }, { id: 'av600s-nikkiso', label: 'AV600S' }],
    [{ id: 'machine-shanwaishan', label: '山外山' }, { id: 'circuit-twt-cbp-02p', label: 'TWT-CBP-02P（山外山）' }, { id: 'av600s-shanwaishan', label: 'AV600S' }],
    [{ id: 'machine-bbraun', label: '贝朗' }, { id: 'circuit-bbraun', label: '一次性使用体外循环血路（贝朗）' }, { id: 'av600s-bbraun', label: 'AV600S' }],
    [{ id: 'cartridge-ha330', label: 'HA330' }, { id: 'cartridge-ha330-ii', label: 'HA330-II' }, { id: 'plasma-separator', label: '膜式血浆分离器' }, { id: 'filter-bs330', label: 'BS330' }],
    [{ id: 'secondary-membrane-ec-50w', label: '二级膜 EC-50W' }, { id: 'filter-st150', label: 'ST150' }, { id: 'filter-oxiris', label: 'OXIRIS' }],
  ];
  readonly replacementCodes = ['B','C','D','E','F','G','H','I'];
  readonly dialysateCodes = ['b','c','d','e','f','g','h','i'];
  readonly anticoagulationOptions = ['无肝素','肝素钠','低分子肝素','低分子肝素钠','4%枸橼酸钠','10%葡萄糖酸钙','甲磺酸萘莫司他'];

  constructor(private http: HttpClient, private hostPatient: HostPatientService, private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngOnInit(): void {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a => { if (a) this.account = a; });
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p) return;
      const oldPid = this.pid;
      this.patient = p;
      const newPid = this.resolvePid(p);
      this.pid = newPid;
      this.age = this.calcAge(p.birthday);
      this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis || p.diagnosis);
      if (newPid && newPid !== oldPid) { this.flushAutoSave(); this.record = this.createEmptyRecord(); this.applyPatientToRecord(this.record); this.loadTimeOptions(); }
    });
    this.loadSignatureAccounts();
  }

  ngOnDestroy(): void { this.flushAutoSave(); window.removeEventListener('beforeunload', this.beforeUnloadHandler); if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; } this.destroy$.next(); this.destroy$.complete(); }

  private beforeUnloadHandler = (e: BeforeUnloadEvent) => { if (this.autoSaveState === 'dirty' || this.autoSaveState === 'saving' || this.saveInFlight) { e.preventDefault(); e.returnValue = ''; } };

  /* 权限 */
  get profession(): string { return String(this.account?.profession ?? '').trim().toLowerCase(); }
  isDoctorRole(): boolean { return DOCTOR_PROFS.includes(this.profession); }
  isNurseRole(): boolean { return NURSE_PROFS.includes(this.profession); }
  isAdminRole(): boolean { return ADMIN_PROFS.includes(this.profession); }
  canEditDoctorField(): boolean { return this.isFormActive() && (this.isDoctorRole() || this.isAdminRole()); }
  canEditNurseField(): boolean { return this.isFormActive() && (this.isNurseRole() || this.isAdminRole()); }
  isFormActive(): boolean { return this.isDraft || !!this.record.id; }
  private currentAccountId(): string { return String(this.account?.id ?? this.account?._id ?? this.account?.accountId ?? '').trim(); }
  genderText(g?: string|number): string { const v = String(g ?? '').trim(); if (['Male','M','男','1'].includes(v)) return '男'; if (['Female','F','女','2'].includes(v)) return '女'; return v; }

  /* 签名排序 */
  get orderedDoctorAccounts(): AccountOption[] {
    const cid = this.currentAccountId();
    return [...this.doctorAccounts].sort((a, b) => { const ac = a.accountId === cid ? -1 : 0; const bc = b.accountId === cid ? -1 : 0; return ac - bc || a.accountName.localeCompare(b.accountName, 'zh-CN'); });
  }
  get orderedNurseAccounts(): AccountOption[] {
    const cid = this.currentAccountId();
    return [...this.nurseAccounts].sort((a, b) => { const ac = a.accountId === cid ? -1 : 0; const bc = b.accountId === cid ? -1 : 0; return ac - bc || a.accountName.localeCompare(b.accountName, 'zh-CN'); });
  }

  /* 加载 */
  loadTimeOptions(selectId?: string): void {
    if (!this.pid) return;
    this.loading = true; this.errorMessage = '';
    this.http.get<OrderTimeOption[]>(`${this.apiUrl}/patient/${encodeURIComponent(this.pid)}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: opts => {
          this.ngZone.run(() => {
            this.timeOptions = [...(opts ?? [])].sort((a, b) => new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime());
            this.hasRecords = this.timeOptions.length > 0;
            if (!this.hasRecords) { this.selectedRecordId = ''; this.isDraft = false; this.record = this.createEmptyRecord(); this.applyPatientToRecord(this.record); this.message = '当前患者暂无 CRRT 医嘱单，请点击新增后填写。'; this.loading = false; this.cdr.detectChanges(); return; }
            const id = selectId || this.timeOptions[0].id;
            this.selectedRecordId = id;
            this.loading = false;
            this.cdr.detectChanges();
            this.loadRecord(id);
          });
        },
        error: e => { this.ngZone.run(() => { this.errorMessage = e?.error?.message || '加载失败'; this.loading = false; this.cdr.detectChanges(); }); },
      });
  }

  loadRecord(id: string): void {
    if (!id || this.switchingRecord) return;
    const requestPid = this.pid;
    this.switchingRecord = true; this.loading = true; this.errorMessage = '';
    this.http.get<CrrtOrderFormRecord>(`${this.apiUrl}/${encodeURIComponent(id)}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rec => {
          this.ngZone.run(() => {
            if (requestPid !== this.pid) return;
            this.record = this.normalizeRecord(rec);
            this.selectedRecordId = this.record.id || id;
            this.isDraft = false; this.autoSaveState = 'idle'; this.localRevision = 0; this.savedRevision = 0; this.errorMessage = '';
            this.switchingRecord = false; this.loading = false; this.cdr.detectChanges();
          });
        },
        error: e => {
          this.ngZone.run(() => {
            if (requestPid !== this.pid) return;
            this.errorMessage = e?.error?.message || 'CRRT 医嘱单加载失败。';
            this.selectedRecordId = this.record.id || '';
            this.switchingRecord = false; this.loading = false; this.cdr.detectChanges();
          });
        },
      });
  }

  onTimeChange(id: string): void {
    if (!id || id === this.record.id || this.switchingRecord || this.creating) return;
    const prev = this.record.id || '';
    this.flushAutoSave();
    this.loadRecord(id);
  }

  /* 新增弹框 */
  openCreateDialog(): void {
    if (!this.pid) { this.errorMessage = '缺少患者信息'; return; }
    this.createDraftTime = this.toLocalDateTimeValue(new Date());
    this.createDialogError = '';
    this.createDialogOpen = true;
  }

  confirmCreate(): void {
    if (this.creating) return;
    this.createDialogError = '';
    if (!this.pid) { this.createDialogError = '缺少患者信息，不能创建医嘱单。'; return; }
    if (!this.createDraftTime) { this.createDialogError = '请选择医嘱时间。'; return; }
    if (this.timeOptions.some(o => this.sameMinute(o.orderTime, this.createDraftTime))) { this.createDialogError = '该医嘱时间已经存在，请选择其他时间。'; return; }
    const operatorId = this.currentAccountId();
    if (!operatorId) { this.createDialogError = '未获取到当前账号，不能创建医嘱单。'; return; }
    const draft = this.createEmptyRecord();
    this.applyPatientToRecord(draft);
    draft.orderTime = this.createDraftTime;
    this.creating = true;
    this.http.post(this.apiUrl, draft, { params: { operatorId } })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.ngZone.run(() => { this.creating = false; this.cdr.detectChanges(); }); }))
      .subscribe({
        next: (saved: any) => {
          this.ngZone.run(() => {
            try {
              const normalized = this.normalizeRecord(saved as CrrtOrderFormRecord);
              this.record = normalized;
              this.selectedRecordId = normalized.id || '';
              this.isDraft = false; this.autoSaveState = 'saved';
              this.upsertTimeOption(normalized);
              this.createDialogOpen = false; this.createDraftTime = ''; this.createDialogError = '';
            } catch (e) {
              console.error('CRRT record normalization failed', e, saved);
              this.createDialogError = '记录已创建，但服务器返回数据解析失败，请刷新后重试。';
            }
            this.cdr.detectChanges();
          });
        },
        error: e => { this.ngZone.run(() => { this.createDialogError = e?.error?.message || `创建失败${e?.status ? `（${e.status}）` : ''}`; this.cdr.detectChanges(); }); },
      });
  }

  private upsertTimeOption(record: CrrtOrderFormRecord): void {
    if (!record.id) return;
    const opt: OrderTimeOption = { id: record.id, orderTime: record.orderTime, updatedAt: record.updatedAt };
    const others = this.timeOptions.filter(o => o.id !== opt.id);
    this.timeOptions = [opt, ...others].sort((a, b) => new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime());
    this.hasRecords = true;
  }

  /* 自动保存 */
  onPageChanged(): void { if (!this.record.id) return; this.localRevision++; this.autoSaveState = 'dirty'; if (this.saveInFlight) this.saveAgainAfterCurrent = true; if (this.saveTimer) clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flushAutoSave(); }, 800); }
  onDiscreteChange(): void { if (!this.record.id) return; this.onPageChanged(); this.flushAutoSave(); }

  flushAutoSave(): void {
    if (!this.record.id || (this.autoSaveState !== 'dirty' && this.autoSaveState !== 'error')) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.saveInFlight) { this.saveAgainAfterCurrent = true; return; }
    const pid = this.record.pid; const reqRev = this.localRevision;
    const snap = JSON.parse(JSON.stringify(this.record));
    this.saveInFlight = true; this.saveAgainAfterCurrent = false; this.autoSaveState = 'saving'; this.cdr.detectChanges();
    this.http.put<CrrtOrderFormRecord>(`${this.apiUrl}/${this.record.id}?operatorId=${encodeURIComponent(this.currentAccountId())}`, snap)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: saved => {
          this.ngZone.run(() => {
            this.saveInFlight = false;
            if (pid !== this.record.pid) { this.cdr.detectChanges(); return; }
            this.record = this.normalizeRecord(saved);
            if (reqRev === this.localRevision) { this.savedRevision = reqRev; this.autoSaveState = 'saved'; }
            else { this.autoSaveState = 'dirty'; this.saveAgainAfterCurrent = true; }
            if (this.saveAgainAfterCurrent) setTimeout(() => this.flushAutoSave(), 100);
            this.cdr.detectChanges();
          });
        },
        error: (e: any) => {
          this.ngZone.run(() => {
            this.saveInFlight = false; this.autoSaveState = 'error';
            if (e?.status === 409) this.errorMessage = '该医嘱单已被其他人员修改，请重新加载后再保存';
            this.cdr.detectChanges();
          });
        },
      });
  }

  retryAutoSave(): void { this.autoSaveState = 'dirty'; this.flushAutoSave(); }

  ensureCurrentRecordSaved(): Promise<void> {
    if (!this.record.id || this.autoSaveState === 'saved' || this.autoSaveState === 'idle') return Promise.resolve();
    this.flushAutoSave();
    return new Promise((resolve, reject) => {
      const check = () => { if (this.autoSaveState === 'saved' || this.autoSaveState === 'idle') resolve(); else if (this.autoSaveState === 'error') reject(new Error('save failed')); else setTimeout(check, 100); };
      check();
    });
  }

  /* 一键打印全部 */
  async printAllOrders(): Promise<void> {
    if (this.printingAll || !this.timeOptions.length) return;
    this.printingAll = true; this.errorMessage = '';
    try {
      await this.ensureCurrentRecordSaved();
      const records = await firstValueFrom(
        forkJoin(this.timeOptions.map(opt => this.http.get<CrrtOrderFormRecord>(`${this.apiUrl}/${encodeURIComponent(opt.id)}`).pipe(catchError(() => of(null)))))
      );
      this.printRecords = records.filter((r): r is CrrtOrderFormRecord => !!r).map(r => this.normalizeRecord(r)).sort((a, b) => new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime());
      this.printAllMode = true;
      this.cdr.detectChanges();
      await this.waitForRender();
      const cleanup = () => { this.printAllMode = false; this.printRecords = []; this.printingAll = false; window.removeEventListener('afterprint', cleanup); this.cdr.detectChanges(); };
      window.addEventListener('afterprint', cleanup);
      window.print();
    } catch (error: any) {
      this.printingAll = false; this.printAllMode = false; this.printRecords = [];
      this.errorMessage = error?.error?.message || '加载全部 CRRT 医嘱单失败。';
      this.cdr.detectChanges();
    }
  }

  trackRecordById(_: number, rec: CrrtOrderFormRecord): string { return rec.id || ''; }

  private waitForRender(): Promise<void> { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))); }

  /* 数组操作 */
  toggleArrayValue(values: string[], value: string, checked: boolean): void { if (checked) { if (!values.includes(value)) values.push(value); } else { const i = values.indexOf(value); if (i >= 0) values.splice(i, 1); } }
  isChecked(values: string[], value: string): boolean { return values.includes(value); }
  updateSignature(target: any, key: string, accountId: string, accounts: AccountOption[]): void {
    const acc = accounts.find(a => a.accountId === accountId);
    target[key] = acc ? { accountId: acc.accountId, accountName: acc.accountName, signedAt: new Date().toISOString() } : null;
  }
  addOrderItem(): void { this.record.orderItems.push(this.createEmptyOrderItem()); this.onPageChanged(); }
  removeOrderItem(i: number): void { if (this.record.orderItems.length <= 1) return; this.record.orderItems.splice(i, 1); this.onPageChanged(); }
  trackByIndex(index: number): number { return index; }
  displayTime(value: string): string { if (!value) return ''; const d = new Date(value); if (Number.isNaN(d.getTime())) return value; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  datePart(value: string | null | undefined): string { if (!value) return ''; const d = new Date(value); if (Number.isNaN(d.getTime())) { const t = String(value); return t.length >= 10 ? t.substring(0, 10) : t; } const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  timePart(value: string | null | undefined): string { if (!value) return ''; const d = new Date(value); if (Number.isNaN(d.getTime())) { const t = String(value); const m = t.match(/(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : ''; } const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; }
  fmtDateTime(value: string): string { return this.displayTime(value); }
  sameMinute(a: string, b: string): boolean { return !!a && !!b && this.displayTime(a).substring(0, 16) === this.displayTime(b).substring(0, 16); }

  print(): void { if (this.autoSaveState === 'dirty' || this.saveInFlight) { this.flushAutoSave(); setTimeout(() => window.print(), 400); return; } window.print(); }

  /* 签名账号加载 */
  private loadSignatureAccounts(): void {
    forkJoin({
      d: this.http.get<any[]>('/api/v1/icu/accounts?profession=Director').pipe(catchError(() => of([]))),
      e: this.http.get<any[]>('/api/v1/icu/accounts?profession=Doctor').pipe(catchError(() => of([]))),
      n: this.http.get<any[]>('/api/v1/icu/accounts?profession=Nurse').pipe(catchError(() => of([]))),
      m: this.http.get<any[]>('/api/v1/icu/accounts?profession=Matron').pipe(catchError(() => of([]))),
    }).pipe(takeUntil(this.destroy$)).subscribe(r => {
      this.doctorAccounts = this.uniqueAcc([...r.d, ...r.e]);
      this.nurseAccounts = this.uniqueAcc([...r.n, ...r.m]);
    });
  }
  private uniqueAcc(list: any[]): AccountOption[] {
    const m = new Map<string, AccountOption>();
    for (const a of list ?? []) { const id = String(a?.accountId ?? a?._id ?? a?.id ?? '').trim(); const name = String(a?.accountName ?? a?.trueName ?? a?.name ?? '').trim(); if (id && name) m.set(id, { accountId: id, accountName: name, profession: a?.profession }); }
    return [...m.values()].sort((a, b) => a.accountName.localeCompare(b.accountName, 'zh-CN'));
  }

  /* 数据模型 */
  private createEmptyRecord(): CrrtOrderFormRecord {
    return {
      pid: '', department: '', patientName: '', bedNo: '', age: '', gender: '', hospitalNo: '', diagnosis: '', orderTime: '',
      vascularAccess: [], treatmentModes: [], machineConsumables: [],
      anticoagulation: { types: [], heparinGroupFirstDose: null, heparinGroupMaintenance: null, lowMolecularSodiumFirstDose: null, lowMolecularSodiumMaintenance: null, citrateMaintenance: null, calciumMaintenance: null, nafamostatFirstDose: null, nafamostatMaintenance: null },
      cbpDose: { preReplacement: null, postReplacement: null, dialysate: null, sodiumBicarbonate: null, plasmaSeparationSpeed: null, plasmaDiscardSpeed: null, plasmaReplacementSpeed: null, totalPlasmaExchange: null },
      replacementFormulaA: { baseSolution: 4000, potassiumChloride: null, sodiumChloride: null },
      dialysateFormulaA: { baseSolution: 4000, potassiumChloride: null, sodiumChloride: null },
      treatmentPlan: { bloodFlow: null, estimatedHours: null, ultrafiltrationRate: null },
      doctorSignature: null, machineNurseSignature: null, checkNurseSignature: null,
      replacementPrescriptions: this.prescriptions(['B','C','D','E','F','G','H','I']),
      dialysatePrescriptions: this.prescriptions(['b','c','d','e','f','g','h','i']),
      orderItems: Array.from({ length: 8 }, () => this.createEmptyOrderItem()),
    };
  }
  private prescriptions(codes: string[]): PrescriptionColumn[] { return codes.map(cd => ({ code: cd, dateTime: '', baseSolution: 4000, potassiumChloride: null, sodiumChloride: null, doctorSignature: null, executionTime: '', nurseSignature: null })); }
  private padPrescriptions(list: PrescriptionColumn[], codes: string[]): PrescriptionColumn[] {
    const result = codes.map((code, i) => ({ code, dateTime: '', baseSolution: 4000, potassiumChloride: null, sodiumChloride: null, doctorSignature: null, executionTime: '', nurseSignature: null, ...(list[i] ?? {}) }));
    return result;
  }
  private createEmptyOrderItem(): OrderItem { return { dateTime: '', content: '', doctorSignature: null, executionTime: '', nurseSignature: null }; }

  private normalizeMachineConsumables(values: unknown): string[] {
    const source = Array.isArray(values) ? values.map(v => String(v)) : [];
    const legacyMap: Record<string, string[]> = {
      '金宝': ['machine-gambro'], 'M150': ['filter-m150'],
      '日机装': ['machine-nikkiso'], '血液滤过管路（日机装）': ['circuit-nikkiso'],
      '山外山': ['machine-shanwaishan'], 'TWT-CBP-02P（山外山）': ['circuit-twt-cbp-02p'],
      '贝朗': ['machine-bbraun'], '一次性使用体外循环血路（贝朗）': ['circuit-bbraun'],
      'HA330': ['cartridge-ha330'], 'HA330-II': ['cartridge-ha330-ii'],
      '膜式血浆分离器': ['plasma-separator'], 'BS330': ['filter-bs330'],
      '二级膜 EC-50W': ['secondary-membrane-ec-50w'], 'ST150': ['filter-st150'], 'OXIRIS': ['filter-oxiris'],
      'AV600S': ['av600s-nikkiso', 'av600s-shanwaishan', 'av600s-bbraun'],
    };
    const normalized = source.flatMap(v => {
      if (['av600s-nikkiso','av600s-shanwaishan','av600s-bbraun'].includes(v)) return [v];
      return legacyMap[v] ?? [v];
    });
    return [...new Set(normalized)];
  }

  private normalizeAnticoagulation(value: any): AnticoagulationValue {
    const source = value ?? {};
    return {
      types: Array.isArray(source.types) ? source.types.map(String) : [],
      heparinGroupFirstDose: source.heparinGroupFirstDose ?? source.heparinFirstDose ?? null,
      heparinGroupMaintenance: source.heparinGroupMaintenance ?? source.heparinMaintenance ?? null,
      lowMolecularSodiumFirstDose: source.lowMolecularSodiumFirstDose ?? source.heparinFirstDose ?? null,
      lowMolecularSodiumMaintenance: source.lowMolecularSodiumMaintenance ?? source.heparinMaintenance ?? null,
      citrateMaintenance: source.citrateMaintenance ?? null,
      calciumMaintenance: source.calciumMaintenance ?? null,
      nafamostatFirstDose: source.nafamostatFirstDose ?? null,
      nafamostatMaintenance: source.nafamostatMaintenance ?? null,
    };
  }

  private normalizeRecord(rec: CrrtOrderFormRecord): CrrtOrderFormRecord {
    const empty = this.createEmptyRecord();
    return {
      ...empty, ...rec,
      anticoagulation: this.normalizeAnticoagulation(rec.anticoagulation),
      cbpDose: { ...empty.cbpDose, ...(rec.cbpDose ?? {}) },
      replacementFormulaA: { ...empty.replacementFormulaA, ...(rec.replacementFormulaA ?? {}) },
      dialysateFormulaA: { ...empty.dialysateFormulaA, ...(rec.dialysateFormulaA ?? {}) },
      treatmentPlan: { ...empty.treatmentPlan, ...(rec.treatmentPlan ?? {}) },
      vascularAccess: rec.vascularAccess ?? [], treatmentModes: rec.treatmentModes ?? [],
      machineConsumables: this.normalizeMachineConsumables(rec.machineConsumables),
      replacementPrescriptions: this.padPrescriptions(rec.replacementPrescriptions ?? [], this.replacementCodes),
      dialysatePrescriptions: this.padPrescriptions(rec.dialysatePrescriptions ?? [], this.dialysateCodes),
      orderItems: rec.orderItems?.length ? rec.orderItems : empty.orderItems,
    };
  }

  private applyPatientToRecord(rec: CrrtOrderFormRecord): void {
    const p = this.patient;
    rec.pid = this.resolvePid(p);
    rec.department = String(p?.dept ?? p?.deptName ?? p?.departmentName ?? p?.wardName ?? '');
    rec.patientName = String(p?.name ?? p?.patientName ?? '');
    rec.bedNo = String(p?.bedNo ?? p?.bedNumber ?? p?.bedName ?? '');
    rec.age = String(this.age ?? '');
    rec.gender = this.genderText(p?.gender);
    rec.hospitalNo = String(p?.hospitalNo ?? p?.admissionNo ?? p?.visitId ?? '');
    rec.diagnosis = String(p?.clinicalDiagnosis ?? p?.diagnosis ?? p?.diagnose ?? '');
  }

  private resolvePid(p: any): string { return String(p?.id ?? p?._id ?? p?.pid ?? p?.patientId ?? p?.patientID ?? '').trim(); }
  private calcAge(b?: string): number | null { if (!b) return null; const d = new Date(b); if (Number.isNaN(d.getTime())) return null; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); const m = n.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--; return a >= 0 && a < 150 ? a : null; }
  private formatDiagnosis(v?: string): string { if (!v) return ''; let idx = -1; for (const s of [';', '；', ',', '，']) { const cur = v.indexOf(s); if (cur >= 0 && (idx < 0 || cur < idx)) idx = cur; } return idx >= 0 ? v.substring(0, idx).trim() : v.trim(); }
  private toLocalDateTimeValue(d: Date): string { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
}
