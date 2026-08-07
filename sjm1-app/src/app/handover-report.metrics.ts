import {
  DepartmentDailySnapshot,
  DepartmentPatient,
  MetricRow,
  OrderRecord,
  ShiftKey,
  ShiftRange,
  TubeExecution,
} from './handover-report.models';

const SHIFT_KEYS: ShiftKey[] = ['day', 'evening', 'night'];

const MANUAL_METRICS: Array<{
  key: string;
  label: string;
  valueType: 'text' | 'number';
}> = [
  { key: 'responsibleNurseCount', label: '管床责任护士人数', valueType: 'number' },
  { key: 'arrearsPatients', label: '欠费患者', valueType: 'text' },
  { key: 'medicalDisputeRisk', label: '医疗纠纷隐患', valueType: 'text' },
  { key: 'equipmentSafety', label: '仪器、设备安全', valueType: 'text' },
  { key: 'fireFacilitySafety', label: '消防、设施安全', valueType: 'text' },
  { key: 'unplannedExtubation', label: '非计划拔管', valueType: 'text' },
  { key: 'deepVeinCatheterBlockage', label: '深静脉导管堵塞', valueType: 'text' },
  { key: 'gradeThreePhlebitis', label: '液体外渗发生三级静脉炎', valueType: 'text' },
  { key: 'pressureInjuryOccurred', label: '发生压力性损伤', valueType: 'text' },
  { key: 'vteOccurred', label: '发生VTE', valueType: 'text' },
  { key: 'aspirationOccurred', label: '误吸', valueType: 'text' },
  { key: 'thrombosisHighRisk', label: '血栓高风险', valueType: 'text' },
  { key: 'occupationalExposure', label: '职业暴露', valueType: 'text' },
  { key: 'criticalValue', label: '危急值（含特殊感染疾病）', valueType: 'text' },
  { key: 'diarrhea', label: '腹泻', valueType: 'text' },
  { key: 'newMultidrugResistantInfection', label: '新增多重耐药菌感染', valueType: 'text' },
  { key: 'noDefecationThreeDays', label: '3天未解大便', valueType: 'text' },
];

function timestamp(value?: string): number {
  if (!value) { return Number.NaN; }
  return new Date(value).getTime();
}

function inRange(value: string | undefined, range: ShiftRange): boolean {
  const time = timestamp(value);
  return Number.isFinite(time) && time >= range.start.getTime() && time < range.end.getTime();
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  const result = Number(text(value));
  return Number.isFinite(result) ? result : Number.NaN;
}

function patientId(patient: DepartmentPatient): string {
  return text(patient.nurseRecordPid ?? patient.id ?? patient._id);
}

function patientBed(patient: DepartmentPatient): string {
  const raw = text(patient.hisBed ?? patient.bedNo);
  if (!raw) { return ''; }
  return raw.endsWith('床') ? raw : `${raw}床`;
}

function bedNumber(value: string): number {
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function formatBeds(values: Iterable<string>): string {
  const beds = Array.from(new Set(Array.from(values).map(text).filter(Boolean)));
  beds.sort((left, right) => {
    const numberDiff = bedNumber(left) - bedNumber(right);
    return numberDiff !== 0 ? numberDiff : left.localeCompare(right, 'zh-CN');
  });
  return beds.length > 0 ? beds.join('、') : '—';
}

function patientMap(snapshot: DepartmentDailySnapshot): Map<string, DepartmentPatient> {
  const result = new Map<string, DepartmentPatient>();
  for (const patient of snapshot.patients) {
    const id = patientId(patient);
    if (id) { result.set(id, patient); }
  }
  return result;
}

function bedsFromPids(pids: Iterable<string>, patients: Map<string, DepartmentPatient>): string {
  const beds: string[] = [];
  for (const pid of pids) {
    const patient = patients.get(text(pid));
    if (!patient) { continue; }
    const bed = patientBed(patient);
    if (bed) { beds.push(bed); }
  }
  return formatBeds(beds);
}

function bedsideBeds(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  range: ShiftRange,
  code: string,
  predicate: (value: string) => boolean,
): string {
  const pids = snapshot.bedsideRecords
    .filter(record => record.valid !== false)
    .filter(record => record.code === code)
    .filter(record => inRange(record.time, range))
    .filter(record => predicate(text(record.strVal)))
    .map(record => record.pid);
  return bedsFromPids(pids, patients);
}

function bloodSugarBeds(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  range: ShiftRange,
): string {
  const pids = snapshot.bloodSugarRecords
    .filter(record => record.valid !== false)
    .filter(record => inRange(record.time, range))
    .filter(record => {
      const result = numberValue(record.result);
      return Number.isFinite(result) && result < 3.9;
    })
    .map(record => record.pid);
  return bedsFromPids(pids, patients);
}

function tubeBeds(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  range: ShiftRange,
  type: string,
): string {
  const pids = snapshot.tubeExecutions
    .filter(item => item.valid !== false)
    .filter(item => text(item.type) === type)
    .filter(item => inRange(item.startTime, range))
    .map(item => item.pid);
  return bedsFromPids(pids, patients);
}

function ventilatorWeaningBeds(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  range: ShiftRange,
): string {
  const currentRecords = snapshot.bedsideRecords
    .filter(record => record.valid !== false)
    .filter(record => record.code === 'param_XiYangTuJing')
    .filter(record => inRange(record.time, range))
    .filter(record => text(record.strVal) === '气管套管内吸氧');

  const result: string[] = [];
  for (const current of currentRecords) {
    const currentTime = timestamp(current.time);
    const hadInvasiveBefore = snapshot.bedsideRecords.some(record =>
      record.valid !== false &&
      record.pid === current.pid &&
      record.code === 'param_XiYangTuJing' &&
      text(record.strVal) === '有创' &&
      timestamp(record.time) < currentTime
    );
    if (hadInvasiveBefore) { result.push(current.pid); }
  }
  return bedsFromPids(result, patients);
}

function reintubationBeds(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  range: ShiftRange,
): string {
  const grouped = new Map<string, TubeExecution[]>();
  for (const item of snapshot.tubeExecutions) {
    if (item.valid === false || text(item.type) !== '气管插管') { continue; }
    const list = grouped.get(item.pid) ?? [];
    list.push(item);
    grouped.set(item.pid, list);
  }

  const matchedPids: string[] = [];
  const maxInterval = 48 * 60 * 60 * 1000;

  for (const [pid, items] of grouped) {
    items.sort((left, right) => timestamp(left.startTime) - timestamp(right.startTime));
    for (let index = 1; index < items.length; index++) {
      const previous = items[index - 1];
      const current = items[index];
      const previousEnd = timestamp(previous.endTime);
      const currentStart = timestamp(current.startTime);
      if (!Number.isFinite(previousEnd) || !Number.isFinite(currentStart)) { continue; }
      const interval = currentStart - previousEnd;
      if (interval >= 0 && interval <= maxInterval && inRange(current.startTime, range)) {
        matchedPids.push(pid);
        break;
      }
    }
  }
  return bedsFromPids(matchedPids, patients);
}

function temporaryOrderInRange(order: OrderRecord, range: ShiftRange): boolean {
  return inRange(order.orderTime, range);
}

function longOrderOverlapsRange(order: OrderRecord, range: ShiftRange): boolean {
  const start = timestamp(order.orderTime);
  const stop = order.stopTime ? timestamp(order.stopTime) : Number.POSITIVE_INFINITY;
  return Number.isFinite(start) && start < range.end.getTime() && stop >= range.start.getTime();
}

function orderBeds(
  snapshot: DepartmentDailySnapshot,
  range: ShiftRange,
  keyword: string,
): string {
  const patientByMrn = new Map<string, DepartmentPatient>();
  for (const patient of snapshot.patients) {
    const mrn = text(patient.mrn);
    if (mrn) { patientByMrn.set(mrn, patient); }
  }

  const beds: string[] = [];
  for (const order of snapshot.orders) {
    if (!text(order.orderName).includes(keyword)) { continue; }
    const orderType = text(order.orderType);
    const matched = orderType.includes('长期')
      ? longOrderOverlapsRange(order, range)
      : temporaryOrderInRange(order, range);
    if (!matched) { continue; }
    const patient = patientByMrn.get(text(order.mrn));
    if (patient) { beds.push(patientBed(patient)); }
  }
  return formatBeds(beds);
}

function nonPlannedAdmissionBeds(
  snapshot: DepartmentDailySnapshot,
  range: ShiftRange,
): string {
  return formatBeds(
    snapshot.patients
      .filter(patient => text(patient.admissionPlan) === '非计划转入')
      .filter(patient => inRange(patient.icuAdmissionTime, range))
      .map(patient => patientBed(patient)),
  );
}

function manualMetricRows(snapshot: DepartmentDailySnapshot): MetricRow[] {
  return MANUAL_METRICS.map(definition => ({
    key: definition.key,
    label: definition.label,
    mode: 'manual' as const,
    valueType: definition.valueType as 'text' | 'number',
    values: {
      day: snapshot.draft.manualMetrics[`${definition.key}.day`] ?? '',
      evening: snapshot.draft.manualMetrics[`${definition.key}.evening`] ?? '',
      night: snapshot.draft.manualMetrics[`${definition.key}.night`] ?? '',
    },
  }));
}

export function buildSafetyMetrics(
  snapshot: DepartmentDailySnapshot,
  ranges: Record<ShiftKey, ShiftRange>,
): MetricRow[] {
  const patients = patientMap(snapshot);

  const buildValues = (
    calculate: (range: ShiftRange, shift: ShiftKey) => string,
  ): Record<ShiftKey, string> => ({
    day: calculate(ranges.day, 'day'),
    evening: calculate(ranges.evening, 'evening'),
    night: calculate(ranges.night, 'night'),
  });

  const autoRows: MetricRow[] = [
    {
      key: 'temperatureAbove38',
      label: '体温≥38℃',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_T', value => {
        const temperature = numberValue(value);
        return Number.isFinite(temperature) && temperature >= 38;
      })),
    },
    {
      key: 'hypoglycemia',
      label: '低血糖',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bloodSugarBeds(snapshot, patients, range)),
    },
    {
      key: 'bladderIrrigation',
      label: '膀胱冲洗',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => orderBeds(snapshot, range, '膀胱冲洗')),
      warning: snapshot.orders.length === 0 ? '医嘱数据源暂无数据' : undefined,
    },
    {
      key: 'invasiveVentilation',
      label: '有创机械通气',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_XiYangTuJing', value => value === '有创')),
    },
    {
      key: 'newNasoentericTube',
      label: '新增鼻肠营养管',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => tubeBeds(snapshot, patients, range, '鼻肠管')),
    },
    {
      key: 'newTrachealIntubation',
      label: '新增气管插管',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => tubeBeds(snapshot, patients, range, '气管插管')),
    },
    {
      key: 'newTracheotomy',
      label: '新增气管切开',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => tubeBeds(snapshot, patients, range, '气切导管')),
    },
    {
      key: 'ventilatorWeaning',
      label: '呼吸机脱机',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => ventilatorWeaningBeds(snapshot, patients, range)),
    },
    {
      key: 'reintubationWithin48Hours',
      label: '拔管后48h再插管',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => reintubationBeds(snapshot, patients, range)),
    },
    {
      key: 'invasiveBloodPressure',
      label: '有创血压监测',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_ibp_d', value => value.length > 0)),
    },
    {
      key: 'crrtTreatment',
      label: 'CRRT治疗',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_CBP_Mode', value => value.length > 0)),
    },
    {
      key: 'proneVentilation',
      label: '俯卧位通气',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_TiWei', value => value === '俯卧位')),
    },
    {
      key: 'iabpTreatment',
      label: 'IABP治疗',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_iabp心率', value => value.length > 0)),
    },
    {
      key: 'piccoMonitoring',
      label: 'PICCO监测',
      mode: 'auto',
      valueType: 'beds',
      values: { day: '—', evening: '—', night: '—' },
      warning: '需要确认PICCO真实bedside code',
    },
    {
      key: 'ecmoTreatment',
      label: 'ECMO治疗',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_ECMOMoShi', value => value.length > 0)),
    },
    {
      key: 'removeIsolation',
      label: '解除多重耐药菌床旁隔离',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => orderBeds(snapshot, range, '解除隔离')),
      warning: snapshot.orders.length === 0 ? '医嘱数据源暂无数据' : undefined,
    },
    {
      key: 'pressureInjuryHighRisk',
      label: '压力性损伤高风险',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_yaChuang_score', value => value.includes('高度危险'))),
    },
    {
      key: 'fallHighRisk',
      label: '跌倒/坠床高风险',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_patientFallDangerFactorV2', value => value.includes('高度危险'))),
    },
    {
      key: 'unplannedExtubationHighRisk',
      label: '意外拔管高风险',
      mode: 'auto',
      valueType: 'beds',
      values: { day: '—', evening: '—', night: '—' },
      warning: '需要确认意外拔管评分真实code',
    },
    {
      key: 'suicideHighRisk',
      label: '自杀高风险',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_commitSuicideScore', value => value.includes('高度危险'))),
    },
    {
      key: 'incontinenceDermatitis',
      label: '发生失禁性皮炎',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_incontinenceScore', value => value.includes('高度危险'))),
    },
    {
      key: 'unplannedPostoperativeAdmission',
      label: '术后患者非计划转入ICU',
      mode: 'auto',
      valueType: 'beds',
      values: buildValues(range => nonPlannedAdmissionBeds(snapshot, range)),
    },
  ];

  return [...manualMetricRows(snapshot), ...autoRows];
}
