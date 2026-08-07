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
  id?: string;
  _id?: string;

  /**
   * 后端根据真实数据库关联关系生成。
   * 护理记录、床旁数据、血糖和管道查询统一使用该字段。
   */
  nurseRecordPid?: string;

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
  admissionPlan?: string;
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
  id?: string;
  _id?: string;
  pid: string;
  time: string;
  desc?: string;
  username?: string;
  trueName?: string;
  userId?: string;
  editUser?: string;
  valid?: boolean;
}

export interface NurseRecordOption {
  id: string;
  pid: string;
  time: string;
  desc: string;
  recorder: string;
  valid: boolean;
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

  /**
   * 用于草稿、危重患者选择等交班报告内部关联。
   */
  patientId: string;

  /**
   * 用于护理记录和临床数据查询。
   */
  nurseRecordPid: string;

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

export type MetricMode = 'manual' | 'auto';

export type MetricValueType = 'text' | 'number' | 'beds';

export interface MetricRow {
  key: string;
  label: string;
  mode: MetricMode;
  valueType: MetricValueType;
  values: Record<ShiftKey, string>;

  /**
   * 数据源不可用或规则尚未确认时显示。
   */
  warning?: string;
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
