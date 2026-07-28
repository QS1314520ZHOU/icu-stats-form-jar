import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

type Profession = 'Director'|'Doctor'|'Nurse'|'Matron'|'SystemAdmin'|'Admin'|string;
type FieldOwner = 'doctor'|'nurse';

interface AccountOption { accountId: string; accountName: string; profession?: Profession; }
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
  loading = false; saving = false; isDraft = false; hasRecords = false; dirty = false;
  message = ''; errorMessage = '';

  readonly vascularAccessOptions = ['右侧股静脉','左侧股静脉','右侧颈内静脉','左侧颈内静脉','右侧锁骨下静脉','左侧锁骨下静脉','动静脉内瘘','ECMO'];
  readonly treatmentModeOptions = ['CVVH','CVVHD','CVVHDF','SCUF','HP','PE','DPMAS','DFPP','CPFA','ECCO2R'];
  readonly machineConsumableOptions = ['金宝','日机装','山外山','贝朗','M150','血液滤过管路（日机装）','TWT-CBP-02P（山外山）','一次性使用体外循环血路（贝朗）','AV600S','HA330','HA330-II','膜式血浆分离器','BS330','二级膜 EC-50W','ST150','OXIRIS'];
  readonly anticoagulationOptions = ['无肝素','肝素钠','低分子肝素','低分子肝素钠','4%枸橼酸钠','10%葡萄糖酸钙','甲磺酸萘莫司他'];

  constructor(private http: HttpClient, private hostPatientService: HostPatientService) {}

  ngOnInit(): void {
    this.patient = this.hostPatientService.getPatient();
    this.account = this.hostPatientService.getAccount();
    this.applyPatientToRecord();
    this.loadSignatureAccounts();

    this.hostPatientService.patient$.pipe(takeUntil(this.destroy$)).subscribe(patient => {
      if (!patient) return;
      const oldPid = this.record.pid;
      this.patient = patient;
      const newPid = this.resolvePid(patient);
      if (newPid && newPid !== oldPid) { this.record = this.createEmptyRecord(); this.applyPatientToRecord(); this.loadTimeOptions(); }
    });

    this.hostPatientService.account$.pipe(takeUntil(this.destroy$)).subscribe(a => { if (a) this.account = a; });

    if (this.record.pid) this.loadTimeOptions();
    else this.message = '尚未收到患者信息，正在等待 SmartCare 宿主传入。';
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  get profession(): string { return String(this.account?.profession ?? '').trim().toLowerCase(); }
  isDoctorRole(): boolean { return this.profession === 'director' || this.profession === 'doctor'; }
  isNurseRole(): boolean { return this.profession === 'nurse' || this.profession === 'matron'; }
  isAdminRole(): boolean { return this.profession === 'systemadmin' || this.profession === 'admin'; }
  canEditDoctorField(): boolean { return this.isFormActive() && (this.isDoctorRole() || this.isAdminRole()); }
  canEditNurseField(): boolean { return this.isFormActive() && (this.isNurseRole() || this.isAdminRole()); }
  canEditField(owner: FieldOwner): boolean { return owner === 'doctor' ? this.canEditDoctorField() : this.canEditNurseField(); }
  canSave(): boolean { return !this.saving && this.isFormActive() && (this.canEditDoctorField() || this.canEditNurseField()); }
  isFormActive(): boolean { return this.isDraft || !!this.record.id; }

  loadTimeOptions(selectId?: string): void {
    if (!this.record.pid) return;
    this.loading = true; this.errorMessage = '';
    this.http.get<OrderTimeOption[]>(`${this.apiUrl}/patient/${encodeURIComponent(this.record.pid)}`)
      .pipe(takeUntil(this.destroy$), finalize(() => this.loading = false))
      .subscribe({
        next: opts => {
          this.timeOptions = [...(opts ?? [])].sort((a, b) => new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime());
          this.hasRecords = this.timeOptions.length > 0;
          if (!this.hasRecords) { this.selectedRecordId = ''; this.isDraft = false; this.dirty = false; this.record = this.createEmptyRecord(); this.applyPatientToRecord(); this.message = '当前患者暂无 CRRT 医嘱单，请点击新增后填写。'; return; }
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
        next: rec => { this.record = this.normalizeRecord(rec); this.selectedRecordId = rec.id || id; this.isDraft = false; this.dirty = false; },
        error: e => { this.errorMessage = e?.error?.message || '加载失败'; },
      });
  }

  onTimeChange(id: string): void {
    if (!id || id === this.record.id) return;
    if (this.dirty && !window.confirm('当前内容尚未保存，是否放弃修改并切换时间点？')) { this.selectedRecordId = this.record.id || ''; return; }
    this.loadRecord(id);
  }

  createNew(): void {
    if (this.dirty && !window.confirm('当前内容尚未保存，是否放弃修改并新建医嘱单？')) return;
    this.record = this.createEmptyRecord(); this.applyPatientToRecord();
    this.record.orderTime = this.toLocalDateTimeValue(new Date());
    this.selectedRecordId = ''; this.isDraft = true; this.dirty = false;
    this.message = '已创建新医嘱草稿，请填写后保存。'; this.errorMessage = '';
  }

  save(): void {
    if (!this.canSave()) return;
    if (!this.record.pid) { this.errorMessage = '缺少患者 PID'; return; }
    if (!this.record.orderTime) { this.errorMessage = '请选择医嘱时间'; return; }
    this.saving = true; this.message = ''; this.errorMessage = '';
    const req$ = this.record.id
      ? this.http.put<CrrtOrderFormRecord>(`${this.apiUrl}/${this.record.id}?operatorId=${encodeURIComponent(this.currentAccountId())}`, this.record)
      : this.http.post<CrrtOrderFormRecord>(`${this.apiUrl}?operatorId=${encodeURIComponent(this.currentAccountId())}`, this.record);
    req$.pipe(takeUntil(this.destroy$), finalize(() => this.saving = false)).subscribe({
      next: saved => { this.record = this.normalizeRecord(saved); this.isDraft = false; this.dirty = false; this.message = '保存成功'; this.loadTimeOptions(saved.id); },
      error: e => {
        if (e?.status === 409) { this.errorMessage = '该医嘱单已被其他人员修改，请重新加载后再保存。'; return; }
        this.errorMessage = e?.error?.message || '保存失败';
      },
    });
  }

  print(): void { window.print(); }
  markDirty(): void { if (this.isFormActive()) this.dirty = true; }

  toggleArrayValue(values: string[], value: string, checked: boolean): void {
    if (checked) { if (!values.includes(value)) values.push(value); }
    else { const i = values.indexOf(value); if (i >= 0) values.splice(i, 1); }
    this.markDirty();
  }

  isChecked(values: string[], value: string): boolean { return values.includes(value); }

  updateSignature(target: any, key: string, accountId: string, accounts: AccountOption[]): void {
    const acc = accounts.find(a => a.accountId === accountId);
    target[key] = acc ? { accountId: acc.accountId, accountName: acc.accountName, signedAt: new Date().toISOString() } : null;
    this.markDirty();
  }

  addOrderItem(): void { if (!this.canEditDoctorField()) return; this.record.orderItems.push(this.createEmptyOrderItem()); this.markDirty(); }
  removeOrderItem(index: number): void { if (!this.canEditDoctorField() || this.record.orderItems.length <= 1) return; this.record.orderItems.splice(index, 1); this.markDirty(); }
  trackByIndex(index: number): number { return index; }

  displayTime(value: string): string {
    if (!value) return '';
    const d = new Date(value); if (Number.isNaN(d.getTime())) return value;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private currentAccountId(): string { return String(this.account?.id ?? this.account?._id ?? this.account?.accountId ?? '').trim(); }

  private loadSignatureAccounts(): void {
    forkJoin({
      directors: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Director'),
      doctors: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Doctor'),
      nurses: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Nurse'),
      matrons: this.http.get<AccountOption[]>('/api/v1/icu/accounts?profession=Matron'),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => { this.doctorAccounts = this.uniqueAcc([...r.directors, ...r.doctors]); this.nurseAccounts = this.uniqueAcc([...r.nurses, ...r.matrons]); },
      error: () => { this.errorMessage = '签名人员列表加载失败'; },
    });
  }

  private uniqueAcc(accounts: AccountOption[]): AccountOption[] {
    const m = new Map<string, AccountOption>();
    for (const a of accounts ?? []) { if (a?.accountId) m.set(a.accountId, a); }
    return [...m.values()].sort((a, b) => a.accountName.localeCompare(b.accountName, 'zh-CN'));
  }

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

  private createEmptyOrderItem(): OrderItem {
    return { dateTime: '', content: '', doctorSignature: null, executionTime: '', nurseSignature: null };
  }

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

  private resolvePid(p: any): string {
    return String(p?.id ?? p?._id ?? p?.pid ?? p?.patientId ?? p?.patientID ?? '').trim();
  }

  private toLocalDateTimeValue(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
