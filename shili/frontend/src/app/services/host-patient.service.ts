import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Account } from '../models/account.model';
import { ConfigBed } from '../models/config-bed.model';
import { Department } from '../models/department.model';
import { Patient } from '../models/patient.model';
import { SmartCareHostMessage, isSmartCareHostMessage } from '../models/smartcare-host-message.model';
import PinyinMatch from 'pinyin-match';

export interface PatientDemographicsView {
  name: string;
  genderLabel: string;
  ageLabel: string;
  dept: string;
  bed: string;
  mrn: string;
  /** 临床诊断，来自 patient.clinicalDiagnosis */
  clinicalDiagnosis: string;
}

@Injectable({ providedIn: 'root' })
export class HostPatientService {
  private readonly patientSubject = new BehaviorSubject<Patient | null>(null);
  /** 当前病人变化时发出（用于各单重新拉取数据） */
  readonly patient$ = this.patientSubject.asObservable();
  private readonly beds$ = new BehaviorSubject<ConfigBed[]>([]);
  private readonly account$ = new BehaviorSubject<string | null>(null);
  private readonly departments$ = new BehaviorSubject<Department[]>([]);
  private readonly accountList$ = new BehaviorSubject<Account[]>([]);
  /** 所有账号列表，供护士/医生签名下拉框使用 */
  readonly accounts$: Observable<Account[]> = this.accountList$.asObservable();

  readonly demographics$: Observable<PatientDemographicsView> = combineLatest([
    this.patientSubject,
    this.beds$,
  ]).pipe(
    map(([patient, beds]) => this.buildDemographics(patient, beds)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly hospitalName$: Observable<string> = combineLatest([
    this.patientSubject,
    this.departments$,
  ]).pipe(
    map(([patient, departments]) => this.resolveHospitalName(patient, departments)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor(private readonly http: HttpClient) {
    this.loadConfigBeds();
    this.loadDepartments();
    this.loadAccounts();
  }

  getPatientSnapshot(): Patient | null {
    return this.patientSubject.getValue();
  }

  /** 与各单记录 pid 字段一致：取 Patient 文档 id */
  getPid(): string | null {
    const p = this.patientSubject.getValue();
    if (!p?.id) {
      return null;
    }
    const s = String(p.id).trim();
    return s.length ? s : null;
  }

  getAccountSnapshot(): string | null {
    return this.account$.getValue();
  }

  getDeptCodeSnapshot(): string | null {
    const code = this.patientSubject.getValue()?.deptCode;
    return code != null && String(code).trim() !== '' ? String(code).trim() : null;
  }

  handleHostMessage(raw: unknown): void {
    if (!isSmartCareHostMessage(raw)) {
      return;
    }
    const data = raw as SmartCareHostMessage;
    if (data.patient != null) {
      this.patientSubject.next(data.patient as Patient);
    }
    if (data.account !== undefined && data.account !== null) {
      this.account$.next(String(data.account));
    }
  }

  private loadConfigBeds(): void {
    const url = `${environment.apiBaseUrl}/api/v1/icu/config-beds`;
    this.http.get<ConfigBed[]>(url).subscribe({
      next: (beds) => this.beds$.next(Array.isArray(beds) ? beds : []),
      error: () => this.beds$.next([]),
    });
  }

  private loadDepartments(): void {
    const url = `${environment.apiBaseUrl}/api/v1/icu/departments`;
    this.http.get<Department[]>(url).subscribe({
      next: (list) => this.departments$.next(Array.isArray(list) ? list : []),
      error: () => this.departments$.next([]),
    });
  }

  private loadAccounts(): void {
    const url = `${environment.apiBaseUrl}/api/v1/icu/accounts?profession=Nurse`;
    this.http.get<Account[]>(url).subscribe({
      next: (list) => this.accountList$.next(Array.isArray(list) ? list : []),
      error: () => {
        // 后端接口未写好时，请求失败(404)走这里，提供模拟数据供前端测试
        console.warn('[Mock] 后端 /api/v1/icu/accounts 接口未就绪，使用本地模拟账号数据');
        this.accountList$.next([
          { accountId: 'N001', accountName: '张护士' },
          { accountId: 'N002', accountName: '李护士' },
          { accountId: 'N003', accountName: '王护士' },
        ]);
      },
    });
  }

  getAccountsSnapshot(): Account[] {
    return this.accountList$.getValue();
  }

  resolveAccountName(accountId: string | null | undefined): string {
    if (!accountId) {
      return '';
    }
    const acc = this.accountList$.getValue().find((a) => a.accountId === accountId);
    return acc?.accountName ?? '';
  }

  /**
   * 通用的 nz-select 拼音检索过滤函数
   * 绑定到 nz-select 的 [nzFilterOption] 上使用
   */
  readonly pinyinFilterOption = (input: string, option: any): boolean => {
    if (!input) {
      return true;
    }
    const label = option?.nzLabel;
    if (!label) {
      return false;
    }
    return !!PinyinMatch.match(label, input);
  };

  private buildDemographics(patient: Patient | null, beds: ConfigBed[]): PatientDemographicsView {
    if (!patient) {
      return {
        name: '—',
        genderLabel: '—',
        ageLabel: '—',
        dept: '—',
        bed: '—',
        mrn: '—',
        clinicalDiagnosis: '—',
      };
    }
    return {
      name: this.nz(patient.name),
      genderLabel: this.formatGender(patient.gender),
      ageLabel: this.formatAge(patient.birthday),
      dept: this.nz(patient.dept),
      bed: this.resolveBedLabel(patient, beds),
      mrn: this.nz(patient.mrn),
      clinicalDiagnosis: this.nz(patient.clinicalDiagnosis),
    };
  }

  /** hisBed + deptCode 与 ConfigBed.showName、deptCode 匹配；展示优先 printName */
  private resolveBedLabel(patient: Patient, beds: ConfigBed[]): string {
    const his = patient.hisBed != null ? String(patient.hisBed).trim() : '';
    const dept = patient.deptCode != null ? String(patient.deptCode).trim() : '';
    if (!his) {
      return '—';
    }
    if (!dept || !beds.length) {
      return his;
    }
    const hit = beds.find(
      (b) =>
        String(b.deptCode ?? '').trim() === dept &&
        String(b.showName ?? '').trim() === his
    );
    if (hit) {
      const label = hit.printName || hit.showName || his;
      return String(label).trim() || his;
    }
    return his;
  }

  private resolveHospitalName(patient: Patient | null, departments: Department[]): string {
    if (!patient) {
      return '—';
    }
    const deptCode = patient.deptCode != null ? String(patient.deptCode).trim() : '';
    if (!deptCode || !departments.length) {
      return '—';
    }
    const hit = departments.find((d) => String(d.code ?? '').trim() === deptCode);
    const name = hit?.hospitalName != null ? String(hit.hospitalName).trim() : '';
    return name || '—';
  }

  private nz(v: unknown): string {
    if (v == null) {
      return '—';
    }
    const s = String(v).trim();
    return s.length ? s : '—';
  }

  private formatGender(g: unknown): string {
    if (g === 'Male') {
      return '男';
    }
    if (g === 'Female') {
      return '女';
    }
    if (g === 'UNKNOWN' || g == null || g === '') {
      return '未知';
    }
    return String(g);
  }

  private formatAge(birthday: unknown): string {
    if (birthday == null || birthday === '') {
      return '—';
    }
    const birth =
      typeof birthday === 'string' || typeof birthday === 'number'
        ? new Date(birthday)
        : birthday instanceof Date
          ? birthday
          : null;
    if (!birth || isNaN(birth.getTime())) {
      return '—';
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? `${age}岁` : '—';
  }
}
