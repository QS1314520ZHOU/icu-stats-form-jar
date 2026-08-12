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
  timeText: string;
  medication?: NameAmountRoute;
  enteral?: NameAmountRoute;
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
  outputItems: HljldSummaryItem[];
  drainItems: HljldSummaryItem[];
  balance: number;
  drugTreatmentTotal: number;
  drugTreatmentItems: HljldSummaryItem[];
  gastrointestinalInputTotal: number;
  gastrointestinalInputItems: HljldSummaryItem[];
  excretionTotal: number;
  drainTotal: number;
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
