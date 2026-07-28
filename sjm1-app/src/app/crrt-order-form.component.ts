import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

type AutoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type FieldOwner = 'doctor' | 'nurse';

interface AccountOption { accountId: string; accountName: string; profession?: string; }
interface SignatureValue { accountId: string; accountName: string; signedAt?: string | null; }
interface OrderTimeOption { id: string; orderTime: string; updatedAt?: string; }
interface PrescriptionColumn { code: string; dateTime: string; baseSolution: number | null; potassiumChloride: number | null; sodiumChloride: number | null; doctorSignature: SignatureValue | null; executionTime: string; nurseSignature: SignatureValue | null; }
interface OrderItem { dateTime: string; content: string; doctorSignature: SignatureValue | null; executionTime: string; nurseSignature: SignatureValue | null; }

interface CrrtOrderFormRecord {
  id?: string; version?: number;
  pid: string; patientName: string; bedNo: string; age: string; hospitalNo: string; diagnosis: string;
  orderTime: string;
  vascularAccess: string[]; treatmentModes: string[]; machineConsumables: string[];
  anticoagulation: { types: string[]; heparinFirstDose: number|null; heparinMaintenance: number|null; citrateMaintenance: number|null; calciumMaintenance: number|null; nafamostatFirstDose: number|null; nafamostatMaintenance: number|null; };
  cbpDose: { preReplacement: number|null; postReplacement: number|null; dialysate: number|null; sodiumBicarbonate: number|null; plasmaSeparationSpeed: number|null; plasmaDiscardSpeed: number|null; plasmaReplacementSpeed: number|null; totalPlasmaExchange: number|null; };
  replacementFormulaA: { baseSolution: number|null; potassiumChloride: number|null; sodiumChloride: number|null; };
  dialysateFormulaA: { baseSolution: number|null; potassiumChloride: number|null; sodiumChloride: number|null; };
  treatmentPlan: { bloodFlow: number|null; estimatedHours: number|null; ultrafiltrationRate: number|null; };
  doctorSignature: SignatureValue|null; machineNurseSignature: SignatureValue|null; checkNurseSignature: SignatureValue|null;
  replacementPrescriptions: PrescriptionColumn[]; dialysatePrescriptions: PrescriptionColumn[]; orderItems: OrderItem[];
  createdAt?: string; updatedAt?: string;
}

@Component({
  standalone: false,
  selector: 'app-crrt-order-form',
  templateUrl: './crrt-order-form.component.html',
  styleUrls: ['./crrt-order-form.component.css'],
})
export class CrrtOrderFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly apiUrl = '/api/v1/icu/crrt-orders';

  patient: any = null; account: any = null;
  record: CrrtOrderFormRecord = this.createEmptyRecord();
  timeOptions: OrderTimeOption[] = [];
  selectedRecordId = '';
  doctorAccounts: AccountOption[] = [];
  nurseAccounts: AccountOption[] = [];
  loading = false; isDraft = false; hasRecords = false;
  message = ''; errorMessage = '';

  /* 新增弹框 */
  createDialogOpen = false;
  createOrderTime = '';
  createError = '';
  creating = false;

  /* 打印 */
  selectedPrintPage: number | null = null;

  /* 自动保存 */
  autoSaveState: AutoSaveState = 'idle';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight = false;
  private saveAgainAfterCurrent = false;
  private localRevision = 0;
  private savedRevision = 0;

  /* 扩展字段权限：Director/Doctor 可编辑医生字段，Nurse/Matron 可编辑护士字段，Admin 全部可编辑 */
  private readonly DOCTOR_PROFESSIONS = ['director', 'doctor'];
  private readonly NURSE_PROFESSIONS = ['nurse', 'matron'];
  private readonly ADMIN_PROFESSIONS = ['systemadmin', 'admin'];

  readonly vascularAccessOptions = ['右侧股静脉','左侧股静脉','右侧颈内静脉','左侧颈内静脉','右侧锁骨下静脉','左侧锁骨下静脉','动静脉内瘘','ECMO'];
  readonly treatmentModeOptions = ['CVVH','CVVHD','CVVHDF','SCUF','HP','PE','DPMAS','DFPP','CPFA','ECCO2R'];
  readonly machineConsumableOptions = ['金宝','日机装','山外山','贝朗','M150','血液滤过管路（日机装）','TWT-CBP-02P（山外山）','一次性使用体外循环血路（贝朗）','AV600S','HA330','HA330-II','膜式血浆分离器','BS330','二级膜 EC-50W','ST150','OXIRIS'];
  readonly anticoagulationOptions = ['无肝素','肝素钠','低分子肝素','低分子肝素钠','4%枸橼酸钠','10%葡萄糖酸钙','甲磺酸萘莫司他'];

  constructor(private http: HttpClient, private hostPatient: HostPatientService) {}

  ngOnInit(): void {
    // beforeunload
    window.addEventListener('beforeunload', this.beforeUnloadHandler);

    // 账号
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a => { if (a) this.account = a; });

    // 患者
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (!p) return;
      const oldPid = this.record.pid;
      this.patient = p;
      const newPid = this.resolvePid(p);
      if (newPid && newPid !== oldPid) {
        this.flushAutoSave();
        this.record = this.createEmptyRecord();
        this.applyPatientToRecord();
        this.loadTimeOptions();
      }
    });

    this.loadSignatureAccounts();
    this.applyPatientToRecord();
    if (this.record.pid) this.loadTimeOptions();
  }

  ngOnDestroy(): void {
    this.flushAutoSave();
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.destroy$.next(); this.destroy$.complete();
  }

  private beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (this.autoSaveState === 'dirty' || this.autoSaveState === 'saving' || this.saveInFlight) {
      e.preventDefault(); e.returnValue = '';
    }
  };

  /* ---- 权限 ---- */
  get profession(): string { return String(this.account?.profession ?? '').trim().toLowerCase(); }
  isDoctorRole(): boolean { return this.DOCTOR_PROFESSIONS.includes(this.profession); }
  isNurseRole(): boolean { return this.NURSE_PROFESSIONS.includes(this.profession); }
  isAdminRole(): boolean { return this.ADMIN_PROFESSIONS.includes(this.profession); }
  canEditDoctorField(): boolean { return this.isFormActive() && (this.isDoctorRole() || this.isAdminRole()); }
  canEditNurseField(): boolean { return this.isFormActive() && (this.isNurseRole() || this.isAdminRole()); }
  isFormActive(): boolean { return this.isDraft || !!this.record.id; }

  /* ---- 有序账号 ---- */
  get orderedDoctorAccounts(): AccountOption[] {
    const cid = this.currentAccountId();
    return [...this.doctorAccounts].sort((a, b) => { const ac = a.accountId === cid; const bc = b.accountId === cid; if (ac && !bc) return -1; if (!ac && bc) return 1; return a.accountName.localeCompare(b.accountName, 'zh-CN'); });
  }
  get orderedNurseAccounts(): AccountOption[] {
    const cid = this.currentAccountId();
    return [...this.nurseAccounts].sort((a, b) => { const ac = a.accountId === cid; const bc = b.accountId === cid; if (ac && !bc) return -1; if (!ac && bc) return 1; return a.accountName.localeCompare(b.accountName, 'zh-CN'); });
  }
  private currentAccountId(): string { return String(this.account?.id ?? this.account?._id ?? this.account?.accountId ?? '').trim(); }

  /* ---- 加载 ---- */
  loadTimeOptions(selectId?: string): void {
    if (!this.record.pid) return;
    this.loading = true; this.errorMessage = '';
    this.http.get<OrderTimeOption[]>(`${this.apiUrl}/patient/${encodeURIComponent(this.record.pid)}`)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; }))
      .subscribe({
        next: opts => {
          this.timeOptions = [...(opts ?? [])].sort((a, b) => new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime());
          this.hasRecords = this.timeOptions.length > 0;
          if (!this.hasRecords) { this.selectedRecordId = ''; this.isDraft = false; this.record = this.createEmptyRecord(); this.applyPatientToRecord(); this.message = '当前患者暂无 CRRT 医嘱单，请点击新增后填写。'; return; }
          const id = selectId || this.timeOptions[0].id;
          this.selectedRecordId = id; this.loadRecord(id);
        },
        error: e => { this.errorMessage = e?.error?.message || '加载失败'; },
      });
  }

  loadRecord(id: string): void {
    if (!id) return;
    this.loading = true; this.message = ''; this.errorMessage = '';
    this.http.get<CrrtOrderFormRecord>(`${this.apiUrl}/${id}`)
      .pipe(takeUntil(this.destroy$), finalize(() => this.loading = false))
      .subscribe({
        next: rec => {
          this.record = this.normalizeRecord(rec);
          this.selectedRecordId = rec.id || id;
          this.isDraft = false;
          this.autoSaveState = 'idle'; this.localRevision = 0; this.savedRevision = 0;
        },
        error: e => { this.errorMessage = e?.error?.message || '加载失败'; },
      });
  }

  onTimeChange(id: string): void {
    if (!id || id === this.record.id) return;
    if (this.autoSaveState === 'dirty' || this.saveInFlight) {
      this.flushAutoSave();
      setTimeout(() => this.loadRecord(id), 300);
      return;
    }
    this.loadRecord(id);
  }

  /* ---- 新增弹框 ---- */
  openCreateDialog(): void {
    if (!this.record.pid) { this.errorMessage = '缺少患者信息'; return; }
    this.createOrderTime = this.toLocalDateTimeValue(new Date());
    this.createError = '';
    this.createDialogOpen = true;
  }

  confirmCreate(): void {
    if (!this.createOrderTime) { this.createError = '请选择医嘱时间'; return; }
    const dup = this.timeOptions.find(o => o.orderTime && o.orderTime.substring(0, 16) === this.createOrderTime.substring(0, 16));
    if (dup) { this.createError = '该时间已有医嘱单，请选择其他时间'; return; }

    const rec = this.createEmptyRecord();
    this.applyPatientToRecord();
    rec.pid = this.record.pid;
    rec.patientName = this.record.patientName;
    rec.bedNo = this.record.bedNo;
    rec.age = this.record.age;
    rec.hospitalNo = this.record.hospitalNo;
    rec.diagnosis = this.record.diagnosis;
    rec.orderTime = this.createOrderTime;

    this.creating = true; this.createError = '';
    this.http.post<CrrtOrderFormRecord>(`${this.apiUrl}?operatorId=${encodeURIComponent(this.currentAccountId())}`, rec)
      .pipe(takeUntil(this.destroy$), finalize(() => this.creating = false))
      .subscribe({
        next: saved => {
          this.record = this.normalizeRecord(saved);
          this.isDraft = false;
          this.autoSaveState = 'saved'; this.localRevision = 0; this.savedRevision = 0;
          this.createDialogOpen = false;
          this.loadTimeOptions(saved.id);
        },
        error: e => {
          if (e?.status === 409) { this.createError = '该时间已有医嘱单'; return; }
          this.createError = e?.error?.message || '创建失败';
        },
      });
  }

  /* ---- 自动保存 ---- */
  onPageChanged(): void {
    if (!this.record.id) return;
    this.localRevision++;
    this.autoSaveState = 'dirty';
    if (this.saveInFlight) { this.saveAgainAfterCurrent = true; }
    if (this.saveTimer) { clearTimeout(this.saveTimer); }
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flushAutoSave(); }, 800);
  }

  onDiscreteChange(): void {
    if (!this.record.id) return;
    this.onPageChanged();
    this.flushAutoSave();
  }

  flushAutoSave(): void {
    if (!this.record.id || !this.autoSaveState.match(/dirty|error/)) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.saveInFlight) { this.saveAgainAfterCurrent = true; return; }

    const pid = this.record.pid;
    const reqRev = this.localRevision;
    const snap = JSON.parse(JSON.stringify(this.record));

    this.saveInFlight = true; this.saveAgainAfterCurrent = false; this.autoSaveState = 'saving';
    this.http.put<CrrtOrderFormRecord>(`${this.apiUrl}/${this.record.id}?operatorId=${encodeURIComponent(this.currentAccountId())}`, snap)
      .pipe(finalize(() => { this.saveInFlight = false; }), takeUntil(this.destroy$))
      .subscribe({
        next: saved => {
          if (pid !== this.record.pid) return;
          this.record = this.normalizeRecord(saved);
          if (reqRev === this.localRevision) { this.savedRevision = reqRev; this.autoSaveState = 'saved'; }
          else { this.autoSaveState = 'dirty'; this.saveAgainAfterCurrent = true; }
          if (this.saveAgainAfterCurrent) { setTimeout(() => this.flushAutoSave(), 100); }
        },
        error: (e: any) => {
          this.autoSaveState = 'error';
          if (e?.status === 409) this.errorMessage = '该医嘱单已被其他人员修改，请重新加载后再保存';
        },
      });
  }

  retryAutoSave(): void {
    this.autoSaveState = 'dirty';
    this.flushAutoSave();
  }

  /* ---- 数组操作 ---- */
  toggleArrayValue(values: string[], value: string, checked: boolean): void {
    if (checked) { if (!values.includes(value)) values.push(value); }
    else { const i = values.indexOf(value); if (i >= 0) values.splice(i, 1); }
  }

  isChecked(values: string[], value: string): boolean { return values.includes(value); }

  updateSignature(target: any, key: string, accountId: string, accounts: AccountOption[]): void {
    const acc = accounts.find(a => a.accountId === accountId);
    target[key] = acc ? { accountId: acc.accountId, accountName: acc.accountName, signedAt: new Date().toISOString() } : null;
  }

  addOrderItem(): void { this.record.orderItems.push(this.createEmptyOrderItem()); this.onPageChanged(); }
  removeOrderItem(index: number): void { if (this.record.orderItems.length <= 1) return; this.record.orderItems.splice(index, 1); this.onPageChanged(); }
  trackByIndex(index: number): number { return index; }

  displayTime(value: string): string {
    if (!value) return '';
    const d = new Date(value); if (Number.isNaN(d.getTime())) return value;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  fmtDateTime(value: string): string { return this.displayTime(value); }

  print(): void {
    if (this.autoSaveState === 'dirty' || this.saveInFlight) { this.flushAutoSave(); setTimeout(() => window.print(), 400); return; }
    window.print();
  }

  /* ---- 签名账号加载 ---- */
  private loadSignatureAccounts(): void {
    forkJoin({
      directors: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Director').pipe(catchError(() => of([] as AccountOption[]))),
      doctors: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Doctor').pipe(catchError(() => of([] as AccountOption[]))),
      nurses: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Nurse').pipe(catchError(() => of([] as AccountOption[]))),
      matrons: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Matron').pipe(catchError(() => of([] as AccountOption[]))),
    }).pipe(takeUntil(this.destroy$)).subscribe(r => {
      this.doctorAccounts = this.uniqueAcc([...r.directors, ...r.doctors]);
      this.nurseAccounts = this.uniqueAcc([...r.nurses, ...r.matrons]);
    });
  }

  private uniqueAcc(accounts: AccountOption[]): AccountOption[] {
    const m = new Map<string, AccountOption>();
    for (const a of accounts ?? []) { if (a?.accountId) m.set(a.accountId, a); }
    return [...m.values()].sort((a, b) => a.accountName.localeCompare(b.accountName, 'zh-CN'));
  }

  /* ---- 数据模型 ---- */
  private createEmptyRecord(): CrrtOrderFormRecord {
    return {
      pid: '', patientName: '', bedNo: '', age: '', hospitalNo: '', diagnosis: '', orderTime: '',
      vascularAccess: [], treatmentModes: [], machineConsumables: [],
      anticoagulation: { types: [], heparinFirstDose: null, heparinMaintenance: null, citrateMaintenance: null, calciumMaintenance: null, nafamostatFirstDose: null, nafamostatMaintenance: null },
      cbpDose: { preReplacement: null, postReplacement: null, dialysate: null, sodiumBicarbonate: null, plasmaSeparationSpeed: null, plasmaDiscardSpeed: null, plasmaReplacementSpeed: null, totalPlasmaExchange: null },
      replacementFormulaA: { baseSolution: 4000, potassiumChloride: null, sodiumChloride: null },
      dialysateFormulaA: { baseSolution: 4000, potassiumChloride: null, sodiumChloride: null },
      treatmentPlan: { bloodFlow: null, estimatedHours: null, ultrafiltrationRate: null },
      doctorSignature: null, machineNurseSignature: null, checkNurseSignature: null,
      replacementPrescriptions: this.createPrescriptions(['B','C','D','E','F','G','H','I']),
      dialysatePrescriptions: this.createPrescriptions(['b','c','d','e','f','g','h','i']),
      orderItems: Array.from({ length: 8 }, () => this.createEmptyOrderItem()),
    };
  }

  private createPrescriptions(codes: string[]): PrescriptionColumn[] {
    return codes.map(code => ({ code, dateTime: '', baseSolution: 4000, potassiumChloride: null, sodiumChloride: null, doctorSignature: null, executionTime: '', nurseSignature: null }));
  }

  private createEmptyOrderItem(): OrderItem { return { dateTime: '', content: '', doctorSignature: null, executionTime: '', nurseSignature: null }; }

  private normalizeRecord(rec: CrrtOrderFormRecord): CrrtOrderFormRecord {
    const empty = this.createEmptyRecord();
    return {
      ...empty, ...rec,
      anticoagulation: { ...empty.anticoagulation, ...(rec.anticoagulation ?? {}) },
      cbpDose: { ...empty.cbpDose, ...(rec.cbpDose ?? {}) },
      replacementFormulaA: { ...empty.replacementFormulaA, ...(rec.replacementFormulaA ?? {}) },
      dialysateFormulaA: { ...empty.dialysateFormulaA, ...(rec.dialysateFormulaA ?? {}) },
      treatmentPlan: { ...empty.treatmentPlan, ...(rec.treatmentPlan ?? {}) },
      vascularAccess: rec.vascularAccess ?? [], treatmentModes: rec.treatmentModes ?? [], machineConsumables: rec.machineConsumables ?? [],
      replacementPrescriptions: rec.replacementPrescriptions?.length ? rec.replacementPrescriptions : empty.replacementPrescriptions,
      dialysatePrescriptions: rec.dialysatePrescriptions?.length ? rec.dialysatePrescriptions : empty.dialysatePrescriptions,
      orderItems: rec.orderItems?.length ? rec.orderItems : empty.orderItems,
    };
  }

  private applyPatientToRecord(): void {
    const p = this.patient;
    this.record.pid = this.resolvePid(p);
    this.record.patientName = String(p?.name ?? p?.patientName ?? '');
    this.record.bedNo = String(p?.bedNo ?? p?.bedNumber ?? p?.bedName ?? '');
    this.record.age = String(p?.age ?? '');
    this.record.hospitalNo = String(p?.hospitalNo ?? p?.admissionNo ?? p?.visitId ?? '');
    this.record.diagnosis = String(p?.diagnosis ?? p?.diagnose ?? '');
  }

  private resolvePid(p: any): string { return String(p?.id ?? p?._id ?? p?.pid ?? p?.patientId ?? p?.patientID ?? '').trim(); }

  private toLocalDateTimeValue(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
