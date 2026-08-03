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
}

export interface DrugItem {
  name: string;
  liquidAmount?: number | string;
}

export interface DrugExecution {
  _id?: string;
  pid: string;
  startTime: string;
  status: string;
  methodCode?: string;
  drugList?: DrugItem[];
}

export interface DrugMethodConfig {
  code: string;
  name: string;
  group?: string;
  valid?: boolean;
}

export interface BedsideRecord {
  _id?: string;
  pid: string;
  time: string;
  code: string;
  remark?: string;
  strVal?: string | number;
  username?: string;
  trueName?: string;
}

export interface NurseRecord {
  _id?: string;
  pid: string;
  time: string;
  desc?: string;
  valid?: boolean;
  username?: string;
  trueName?: string;
}

export interface SignatureRecord {
  time: string;
  signature?: string;
  username?: string;
  trueName?: string;
}

export interface HljldSourceData {
  bedside: BedsideRecord[];
  drugExecutions: DrugExecution[];
  drugMethods: DrugMethodConfig[];
  nurseRecords: NurseRecord[];
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

export interface HljldSummary {
  kind: 'day' | '24h';
  label: string;
  periodText: string;
  totalInput: number;
  infusion: number;
  diet: number;
  totalOutput: number;
  balance: number;
  urine: number;
  otherOutput: number;
}

export interface HljldViewModel {
  patient: PatientContext;
  selectedDate: Date;
  rangeStart: Date;
  rangeEnd: Date;
  rows: HljldTimeRow[];
  daySummary?: HljldSummary;
  fullDaySummary?: HljldSummary;
  remark: string;
}
