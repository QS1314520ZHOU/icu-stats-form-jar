export interface PatientContext {
  pid: string;
  mrn?: string;
  name?: string;
  sex?: string;
  age?: string | number;
  bedNo?: string;
  diagnosis?: string;
  admissionTime?: string;
  dischargeTime?: string;
  isDischarged?: boolean;
}

export interface DrugItem {
  name: string;
  liquidAmount?: number | string;
}

export interface DrugActionItem {
  time?: string;
  accountId?: string;
  action?: string;
}

export interface DrugExecution {
  _id?: string;
  pid: string;
  startTime: string;
  status: string;
  methodCode?: string;
  drugList?: DrugItem[];
  drugActionList?: DrugActionItem[];
  orderUser?: string;
}

export interface DrugMethodConfig {
  code: string;
  name: string;
  group?: string;
  valid?: boolean;
}

export interface BedsideRecord {
  _id?: string;
  id?: string;
  pid: string;
  time: string;
  code: string;
  remark?: string;
  strVal?: string | number;
  valid?: boolean;
  editUser?: string;
  username?: string;
  trueName?: string;
}

export interface NurseRecord {
  _id?: string;
  pid: string;
  time: string;
  desc?: string;
  valid?: boolean;
  userId?: string;
  editUser?: string;
  username?: string;
  trueName?: string;
}

export interface SignatureRecord {
  time: string;
  signature?: string;
  username?: string;
  trueName?: string;
}

export interface TubeFieldConfig {
  name?: string;
  field?: string;
  valid?: boolean;
  status?: string;
  componentType?: string;
  isMultipleChoice?: boolean;
}

export interface TubeRecord {
  _id?: string | number;
  id?: string | number;
  time?: string;
  recordUser?: string;
  recordUserName?: string;
  valid?: boolean;
  status?: string;
  [field: string]: unknown;
}

export interface TubeExecution {
  _id?: string;
  id?: string;
  pid: string;
  name?: string;
  type?: string;
  startTime?: string;
  endTime?: string;
  valid?: boolean;
  status?: string;
  tubeRecordList?: TubeRecord[];
  [field: string]: unknown;
}

export interface ConfigTubeView {
  _id?: string;
  id?: string;
  tubeType?: string;
  valid?: boolean;
  status?: string;
  tubeFieldConfigList?: TubeFieldConfig[];
  tubeRecordFieldConfigList?: TubeFieldConfig[];
}

export interface HljldSourceData {
  bedside: BedsideRecord[];
  drugExecutions: DrugExecution[];
  drugMethods: DrugMethodConfig[];
  nurseRecords: NurseRecord[];
  tubeExecutions: TubeExecution[];
  tubeViews: ConfigTubeView[];
  signatures: SignatureRecord[];
}

export interface NameAmountRoute {
  name: string;
  amount: string;
  route: string;
  numericAmount: number;
}

export interface NameAmount {
  name: string;
  amount: string;
  numericAmount: number;
}

export interface HljldTimeRow {
  key: string;
  time: Date;
  timeText: string;
  medications: NameAmountRoute[];
  enteral: NameAmountRoute[];
  /** 尿量：独立列，只有量 */
  urines: string[];
  /** 净超滤量：独立列，只有量 */
  ultrafiltrations: string[];
  outputs: NameAmount[];
  drains: NameAmount[];
  examination: string[];
  treatment: string[];
  basicCare: string[];
  healthEducation: string[];
  nursingRecords: string[];
  signature: string;
}

export interface HljldDisplayRow {
  key: string;
  groupKey: string;
  timestamp: number;
  lineIndex: number;
  firstLine: boolean;
  /** 是否为该时间点的最后一行，签名只在此行展示 */
  lastLine: boolean;
  timeText: string;
  medication?: NameAmountRoute;
  enteral?: NameAmountRoute;
  /** 尿量列（合并列，仅量） */
  urine: string;
  /** 净超滤量列（合并列，仅量） */
  ultrafiltration: string;
  output?: NameAmount;
  drain?: NameAmount;
  examination: string;
  treatment: string;
  basicCare: string;
  healthEducation: string;
  nursingRecord: string;
  signature: string;
}

export interface HljldTimeGroup {
  key: string;
  timestamp: number;
  rows: HljldDisplayRow[];
}

export type HljldSummaryKind = 'day' | 'shift' | '24h' | 'discharge';

export interface HljldSummaryItem {
  key: string;
  label: string;
  amount: number;
  unit: 'ml';
  /** 途径级明细，例如静脉入量下的 iv / ivgtt / iv泵 */
  children?: HljldSummaryItem[];
}

/** 小结文本片段，strong 表示需要加粗的数值 */
export interface SummaryTextToken {
  text: string;
  strong?: boolean;
}

export interface HljldSummary {
  kind: HljldSummaryKind;
  label: string;
  periodText: string;
  plannedStart: number;
  plannedEnd: number;
  periodStart: number;
  periodEnd: number;
  admissionClipped: boolean;
  dischargeClipped: boolean;
  available: boolean;
  totalInput: number;
  inputItems: HljldSummaryItem[];
  totalOutput: number;
  /** 排出物明细，不再包含尿量与净超滤量 */
  outputItems: HljldSummaryItem[];
  drainItems: HljldSummaryItem[];
  balance: number;
  drugTreatmentTotal: number;
  drugTreatmentItems: HljldSummaryItem[];
  gastrointestinalInputTotal: number;
  gastrointestinalInputItems: HljldSummaryItem[];
  /** 排出物合计，不含尿量与净超滤量 */
  excretionTotal: number;
  drainTotal: number;
  /** 尿量合计，单独展示 */
  urineTotal: number;
  /** 净超滤量合计，单独展示 */
  ultrafiltrationTotal: number;
  /** 预生成的小结文本行，页面与打印共用 */
  detailLines: SummaryTextToken[][];
}

export type HljldTimelineItem =
  | { kind: 'time-group'; key: string; timestamp: number; group: HljldTimeGroup }
  | { kind: 'day-summary'; key: string; timestamp: number; summary: HljldSummary }
  | { kind: 'shift-summary'; key: string; timestamp: number; summary: HljldSummary }
  | { kind: 'full-day-summary'; key: string; timestamp: number; summary: HljldSummary }
  | { kind: 'discharge-summary'; key: string; timestamp: number; summary: HljldSummary };

export type HljldPageState =
  | 'waiting-patient'
  | 'loading'
  | 'ready'
  | 'before-admission'
  | 'after-discharge'
  | 'error';

export interface ActiveStayRange {
  nursingDayStart: Date;
  nursingDayEnd: Date;
  effectiveStart: Date;
  effectiveEnd: Date;
  admissionClipped: boolean;
  dischargeClipped: boolean;
  beforeAdmission: boolean;
  afterDischarge: boolean;
  hasValidRange: boolean;
  /** true = 区间为 (start, end]；入科截断时为 false，即 [入科时刻, end] */
  startExclusive: boolean;
}

export interface HljldViewModel {
  patient: PatientContext;
  selectedDate: Date;
  rangeStart: Date;
  rangeEnd: Date;
  rows: HljldTimeRow[];
  displayRows: HljldDisplayRow[];
  timeGroups: HljldTimeGroup[];
  timeline: HljldTimelineItem[];
  daySummary: HljldSummary;
  shiftSummary: HljldSummary;
  fullDaySummary: HljldSummary;
  dischargeSummary?: HljldSummary;
  remark: string;
}
