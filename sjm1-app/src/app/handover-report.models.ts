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

/**
 * 嵌套结构的手工指标，避免MongoDB点号路径问题。
 * 例如：manualMetrics.arrearsPatients.day
 */
export interface ManualMetricsNested {
  [metricKey: string]: {
    day?: string;
    evening?: string;
    night?: string;
  };
}

/**
 * 嵌套结构的患者交班文本，避免MongoDB点号路径问题。
 * 例如：patientTexts.rowKey.day
 */
export interface PatientTextsNested {
  [rowKey: string]: {
    day?: string;
    evening?: string;
    night?: string;
  };
}

/**
 * 字段版本号，用于并发控制。
 * 例如：fieldVersions.manualMetrics.arrearsPatients.day = 2
 */
export interface FieldVersions {
  [fieldPath: string]: number;
}

export interface HandoverDraft {
  departmentId: string;
  reportDate: string;
  version: number;
  departmentName?: string;
  headNurseSignature?: string;
  criticalPatients: CriticalPatientSelection[];

  /**
   * 嵌套结构的患者交班文本，避免MongoDB点号路径问题。
   */
  patientTexts: PatientTextsNested;

  /**
   * 嵌套结构的手工指标，避免MongoDB点号路径问题。
   */
  manualMetrics: ManualMetricsNested;

  shiftSignatures: Partial<Record<ShiftKey, string>>;

  /**
   * 备注信息。
   */
  remarks?: Partial<Record<ShiftKey, string>>;

  /**
   * "其它"内容。
   */
  otherTexts?: Partial<Record<ShiftKey, string>>;

  /**
   * 字段版本号，用于并发控制。
   */
  fieldVersions?: FieldVersions;
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

/**
 * 安全指标定义，维护固定顺序和分类。
 */
export interface SafetyMetricDefinition {
  key: string;
  category: string;
  label: string;
  mode: MetricMode;
  valueType: MetricValueType;
  emphasize?: boolean;
}

/**
 * 安全指标行，包含分类和rowspan信息。
 */
export interface MetricRow extends SafetyMetricDefinition {
  categoryRowSpan: number;
  showCategory: boolean;
  values: Record<ShiftKey, string>;

  /**
   * 数据源不可用或规则尚未确认时显示。
   */
  warning?: string;
}

/**
 * 安全交班报告的固定Schema，严格按照用户截图的分类和顺序。
 */
export const SAFETY_REPORT_SCHEMA: SafetyMetricDefinition[] = [
  // 一、表头前独立项目
  {
    key: 'responsibleNurseCount',
    category: '',
    label: '管床责任护士人数',
    mode: 'manual',
    valueType: 'number',
  },

  // 二、患者安全
  {
    key: 'temperatureAbove38',
    category: '患者安全',
    label: '体温≥38℃',
    mode: 'auto',
    valueType: 'beds',
    emphasize: true,
  },
  {
    key: 'hypoglycemia',
    category: '患者安全',
    label: '低血糖',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'diarrhea',
    category: '患者安全',
    label: '腹泻',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'noDefecationThreeDays',
    category: '患者安全',
    label: '3天未解大便',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'bladderIrrigation',
    category: '患者安全',
    label: '膀胱冲洗',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'invasiveVentilation',
    category: '患者安全',
    label: '有创机械通气人数',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'newNasoentericTube',
    category: '患者安全',
    label: '新增鼻肠营养管',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'newTrachealIntubation',
    category: '患者安全',
    label: '新增气管插管',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'newTracheotomy',
    category: '患者安全',
    label: '新增气管切开',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'ventilatorWeaning',
    category: '患者安全',
    label: '呼吸机脱机',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'trachealTubeRemoval',
    category: '患者安全',
    label: '气管导管拔管',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'reintubationWithin48Hours',
    category: '患者安全',
    label: '拔管后48h再插管',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'invasiveBloodPressure',
    category: '患者安全',
    label: '有创血压监测',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'crrtTreatment',
    category: '患者安全',
    label: 'CRRT治疗',
    mode: 'auto',
    valueType: 'beds',
    emphasize: true,
  },
  {
    key: 'proneVentilation',
    category: '患者安全',
    label: '俯卧位通气',
    mode: 'auto',
    valueType: 'beds',
    emphasize: true,
  },
  {
    key: 'iabpTreatment',
    category: '患者安全',
    label: 'IABP治疗',
    mode: 'auto',
    valueType: 'beds',
    emphasize: true,
  },
  {
    key: 'piccoMonitoring',
    category: '患者安全',
    label: 'PICCO监测',
    mode: 'auto',
    valueType: 'beds',
    emphasize: true,
  },
  {
    key: 'ecmoTreatment',
    category: '患者安全',
    label: 'ECMO治疗',
    mode: 'auto',
    valueType: 'beds',
    emphasize: true,
  },
  {
    key: 'newMultidrugResistantInfection',
    category: '患者安全',
    label: '新增多重耐药菌感染',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'removeIsolation',
    category: '患者安全',
    label: '解除多重耐药菌床旁隔离',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'pressureInjuryHighRisk',
    category: '患者安全',
    label: '压力性损伤高风险',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'fallHighRisk',
    category: '患者安全',
    label: '跌倒/坠床高风险',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'unplannedExtubationHighRisk',
    category: '患者安全',
    label: '意外拔管高风险',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'suicideHighRisk',
    category: '患者安全',
    label: '自杀高风险',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'thrombosisHighRisk',
    category: '患者安全',
    label: '血栓高风险',
    mode: 'manual',
    valueType: 'text',
    emphasize: true,
  },
  {
    key: 'criticalValue',
    category: '患者安全',
    label: '危急值（含特殊感染疾病）',
    mode: 'manual',
    valueType: 'text',
  },

  // 三、转出后重返ICU
  {
    key: 'returnIcuWithin24Hours',
    category: '转出后重返ICU',
    label: '24小时重返ICU',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'returnIcuWithin48Hours',
    category: '转出后重返ICU',
    label: '48小时重返ICU',
    mode: 'auto',
    valueType: 'beds',
  },

  // 四、病区安全
  {
    key: 'arrearsPatients',
    category: '病区安全',
    label: '欠费患者',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'medicalDisputeRisk',
    category: '病区安全',
    label: '医疗纠纷隐患',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'equipmentSafety',
    category: '病区安全',
    label: '仪器、设备安全',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'fireFacilitySafety',
    category: '病区安全',
    label: '消防、设施安全',
    mode: 'manual',
    valueType: 'text',
  },

  // 五、不良事件
  {
    key: 'unplannedExtubation',
    category: '不良事件',
    label: '非计划拔管',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'deepVeinCatheterBlockage',
    category: '不良事件',
    label: '深静脉导管堵塞',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'gradeThreePhlebitis',
    category: '不良事件',
    label: '液体外渗发生三级静脉炎',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'pressureInjuryOccurred',
    category: '不良事件',
    label: '发生压力性损伤',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'vteOccurred',
    category: '不良事件',
    label: '发生VTE',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'aspirationOccurred',
    category: '不良事件',
    label: '误吸',
    mode: 'manual',
    valueType: 'text',
  },
  {
    key: 'incontinenceDermatitis',
    category: '不良事件',
    label: '发生失禁性皮炎',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'occupationalExposure',
    category: '不良事件',
    label: '职业暴露',
    mode: 'manual',
    valueType: 'text',
  },

  // 六、独立项目
  {
    key: 'unplannedPostoperativeAdmission',
    category: '',
    label: '术后患者非计划转入ICU',
    mode: 'auto',
    valueType: 'beds',
  },
  {
    key: 'otherText',
    category: '',
    label: '其它',
    mode: 'manual',
    valueType: 'text',
  },
];

export interface HandoverReportViewModel {
  ranges: Record<ShiftKey, ShiftRange>;
  rows: HandoverPatientRow[];
  statistics: Record<ShiftKey, ShiftStatistics>;
  metrics: MetricRow[];
}

// ==================== 并发补丁相关类型 ====================

export type DraftChange =
  | {
      type: 'replaceCriticalPatients';
      patientIds: string[];
      selectedBy: string;
    }
  | {
      type: 'setPatientText';
      rowKey: string;
      shift: ShiftKey;
      value: string;
      expectedFieldVersion?: number;
    }
  | {
      type: 'setManualMetric';
      metricKey: string;
      shift: ShiftKey;
      value: string;
      expectedFieldVersion?: number;
    }
  | {
      type: 'setShiftSignature';
      shift: ShiftKey;
      accountId: string;
      expectedFieldVersion?: number;
    }
  | {
      type: 'setHeadNurseSignature';
      accountId: string;
      expectedFieldVersion?: number;
    }
  | {
      type: 'setRemark';
      shift: ShiftKey;
      value: string;
      expectedFieldVersion?: number;
    }
  | {
      type: 'setOtherText';
      shift: ShiftKey;
      value: string;
      expectedFieldVersion?: number;
    };

export interface DraftPatchRequest {
  departmentId: string;
  reportDate: string;
  baseVersion: number;
  changes: DraftChange[];
}

export class DraftConflictError extends Error {
  constructor(public latestDraft: HandoverDraft) {
    super('报告已被其他用户更新');
  }
}
