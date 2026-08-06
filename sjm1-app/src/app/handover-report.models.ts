/** 班次类型 */
export type ShiftKind = 'night' | 'day' | 'evening';

/** 班次定义 */
export interface ShiftDefinition {
  kind: ShiftKind;
  label: string;
  startHour: number;
  endHour: number;
  settlementHour: number;
}

/** 在科状态 */
export type PatientStatus = 'active' | 'discharged' | 'transferred' | 'dead';

/** 明细事件类型 */
export type DetailEventType = 'discharge' | 'transfer' | 'death' | 'admission' | 'transferIn' | 'critical' | 'surgery';

/** 交班明细 */
export interface HandoverDetail {
  eventType: DetailEventType;
  time: string;
  timeText: string;
  bedNo: string;
  patientName: string;
  hospitalNo: string;
  diagnosis: string;
  description: string;
  statusColor: string;
}

/** 状态栏项目 */
export interface StatusItem {
  label: string;
  value: string;
  isRed: boolean;
}

/** 危重患者 */
export interface CriticalPatient {
  pid: string;
  bedNo: string;
  patientName: string;
  hospitalNo: string;
  diagnosis: string;
  admissionTime: string;
  duration?: string;
  vitalSigns?: string;
  io24h?: string;
}

/** 交班报告内容（JSON 结构） */
export interface HandoverReportContent {
  shiftKind: ShiftKind;
  shiftLabel: string;
  periodStart: string;
  periodEnd: string;
  settlementTime: string;

  totalPatients: number;
  admissionCount: number;
  dischargeCount: number;
  transferOutCount: number;
  deathCount: number;

  details: HandoverDetail[];
  statusItems: StatusItem[];
  criticalPatients: CriticalPatient[];

  nurseSignature: string;
  nurseSignatureAccountId?: string;
  remark: string;
}

/** 后端报告实体 */
export interface HandoverReport {
  id?: string;
  pid: string;
  department: string;
  reportDate: string;
  content: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** 数据源状态 */
export interface SourceStatus {
  source: string;
  status: 'success' | 'error';
  httpStatus?: number;
  count: number;
  error?: string;
}

/** 数据加载结果 */
export interface LoadResult {
  bedside: any[];
  tubeExecutions: any[];
  patientInfo: any;
  operations: any[];
  statuses: SourceStatus[];
}
