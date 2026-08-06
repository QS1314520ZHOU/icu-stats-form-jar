export type ShiftKey = 'night' | 'day' | 'evening';

export interface DepartmentContext {
  departmentName: string;
  departmentCode: string;
  queryValue: string;
  source: 'patient.dept' | 'patient.deptCode' | 'account.departmentCode';
}

export type HandoverStatus = '出院' | '转出' | '死亡' | '转入' | '入院' | '病危' | '手术';

export interface ShiftRange {
  key: ShiftKey;
  label: string;
  start: Date;
  end: Date;
  settlementTime: Date;
}

export interface DepartmentPatient {
  id: string;
  _id?: string;
  departmentId?: string;
  mrn?: string;
  name?: string;
  hisBed?: string;
  bedNo?: string;
  clinicalDiagnosis?: string;
  diagnosis?: string;
  icuAdmissionTime?: string;
  icuDischargeTime?: string;
  admissionType?: string;
  dischargedType?: string;
  dischargedDepartment?: string;
  patientOperations?: Array<{
    id?: string;
    name?: string;
    startTime?: string;
    endTime?: string;
    valid?: boolean;
  }>;
}

export interface BedsideRecord {
  id?: string;
  pid: string;
  time: string;
  code: string;
  strVal?: string | number;
  valid?: boolean;
}

export interface BloodSugarRecord {
  id?: string;
  pid: string;
  time: string;
  result: string | number;
  valid?: boolean;
}

export interface OrderRecord {
  orderID?: string;
  mrn?: string;
  orderName?: string;
  orderType?: string;
  orderTime?: string;
  stopTime?: string;
  status?: string;
}

export interface TubeExecution {
  id?: string;
  _id?: string;
  pid: string;
  type?: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  valid?: boolean;
}

export interface NurseRecord {
  id: string;
  pid: string;
  time: string;
  desc: string;
  username?: string;
  trueName?: string;
  valid?: boolean;
}

export interface NurseAccount {
  id: string;
  trueName: string;
  profession: string;
}

export interface CriticalPatientSelection {
  patientId: string;
  selectedAt: string;
  selectedBy: string;
}

export interface HandoverDraft {
  departmentId: string;
  reportDate: string;
  version: number;
  departmentName?: string;
  headNurseSignature?: string;
  criticalPatients: CriticalPatientSelection[];
  patientTextOverrides: Record<string, string>;
  manualMetrics: Record<string, string>;
  shiftSignatures: Partial<Record<ShiftKey, string>>;
}

export interface DepartmentDailySnapshot {
  departmentId: string;
  departmentName: string;
  reportDate: string;
  patients: DepartmentPatient[];
  bedsideRecords: BedsideRecord[];
  bloodSugarRecords: BloodSugarRecord[];
  orders: OrderRecord[];
  tubeExecutions: TubeExecution[];
  nurseRecords: NurseRecord[];
  nurseAccounts: NurseAccount[];
  draft: HandoverDraft;
}

export interface HandoverPatientRow {
  key: string;
  patientId: string;
  bedNo: string;
  name: string;
  mrn: string;
  diagnosis: string;
  status: HandoverStatus;
  eventTime: number;
  eventShift: ShiftKey;
  editableShifts: ShiftKey[];
  shiftTexts: Partial<Record<ShiftKey, string>>;
}

export interface ShiftStatistics {
  total: number;
  discharged: number;
  transferredOut: number;
  death: number;
  transferredIn: number;
  admission: number;
  operation: number;
  critical: number;
  specialCare: number;
}

export interface MetricRow {
  group: string;
  key: string;
  label: string;
  mode: 'auto' | 'manual';
  values: Record<ShiftKey, string>;
}

export interface HandoverReportViewModel {
  ranges: Record<ShiftKey, ShiftRange>;
  rows: HandoverPatientRow[];
  statistics: Record<ShiftKey, ShiftStatistics>;
  metrics: MetricRow[];
}

export class DraftConflictError extends Error {
  constructor(public latestDraft: HandoverDraft) {
    super('报告已被其他用户更新');
  }
}
