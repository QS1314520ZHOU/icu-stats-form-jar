import {
  DepartmentDailySnapshot,
  DepartmentPatient,
  MetricRow,
  OrderRecord,
  SAFETY_REPORT_SCHEMA,
  ShiftKey,
  ShiftRange,
  TubeExecution,
} from './handover-report.models';

const SHIFT_KEYS: ShiftKey[] = ['day', 'evening', 'night'];

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

/**
 * 计算手工指标的值（使用嵌套结构）。
 */
function getManualMetricValue(
  snapshot: DepartmentDailySnapshot,
  metricKey: string,
  shift: ShiftKey,
): string {
  const nested = snapshot.draft.manualMetrics[metricKey];
  if (!nested) { return ''; }
  return nested[shift] ?? '';
}

/**
 * 构建单个自动指标的值。
 */
function buildAutoMetricValues(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  ranges: Record<ShiftKey, ShiftRange>,
  calculate: (range: ShiftRange, shift: ShiftKey) => string,
): Record<ShiftKey, string> {
  return {
    day: calculate(ranges.day, 'day'),
    evening: calculate(ranges.evening, 'evening'),
    night: calculate(ranges.night, 'night'),
  };
}

/**
 * 根据SAFETY_REPORT_SCHEMA计算自动指标的值。
 */
function calculateAutoMetricValues(
  key: string,
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  ranges: Record<ShiftKey, ShiftRange>,
): Record<ShiftKey, string> | null {
  const buildValues = (calculate: (range: ShiftRange) => string) =>
    buildAutoMetricValues(snapshot, patients, ranges, (range) => calculate(range));

  switch (key) {
    case 'temperatureAbove38':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_T', value => {
        const temperature = numberValue(value);
        return Number.isFinite(temperature) && temperature >= 38;
      }));
    case 'hypoglycemia':
      return buildValues(range => bloodSugarBeds(snapshot, patients, range));
    case 'bladderIrrigation':
      return buildValues(range => orderBeds(snapshot, range, '膀胱冲洗'));
    case 'invasiveVentilation':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_XiYangTuJing', value => value === '有创'));
    case 'newNasoentericTube':
      return buildValues(range => tubeBeds(snapshot, patients, range, '鼻肠管'));
    case 'newTrachealIntubation':
      return buildValues(range => tubeBeds(snapshot, patients, range, '气管插管'));
    case 'newTracheotomy':
      return buildValues(range => tubeBeds(snapshot, patients, range, '气切导管'));
    case 'ventilatorWeaning':
      return buildValues(range => ventilatorWeaningBeds(snapshot, patients, range));
    case 'trachealTubeRemoval':
      return buildValues(range => tubeBeds(snapshot, patients, range, '气管插管'));
    case 'reintubationWithin48Hours':
      return buildValues(range => reintubationBeds(snapshot, patients, range));
    case 'invasiveBloodPressure':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_ibp_d', value => value.length > 0));
    case 'crrtTreatment':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_CBP_Mode', value => value.length > 0));
    case 'proneVentilation':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_TiWei', value => value === '俯卧位'));
    case 'iabpTreatment':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_iabp心率', value => value.length > 0));
    case 'piccoMonitoring':
      return { day: '—', evening: '—', night: '—' };
    case 'ecmoTreatment':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_ECMOMoShi', value => value.length > 0));
    case 'removeIsolation':
      return buildValues(range => orderBeds(snapshot, range, '解除隔离'));
    case 'pressureInjuryHighRisk':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_yaChuang_score', value => value.includes('高度危险')));
    case 'fallHighRisk':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_patientFallDangerFactorV2', value => value.includes('高度危险')));
    case 'unplannedExtubationHighRisk':
      return { day: '—', evening: '—', night: '—' };
    case 'suicideHighRisk':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_commitSuicideScore', value => value.includes('高度危险')));
    case 'incontinenceDermatitis':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_incontinenceScore', value => value.includes('高度危险')));
    case 'unplannedPostoperativeAdmission':
      return buildValues(range => nonPlannedAdmissionBeds(snapshot, range));
    case 'returnIcuWithin24Hours':
      return { day: '—', evening: '—', night: '—' };
    case 'returnIcuWithin48Hours':
      return { day: '—', evening: '—', night: '—' };
    default:
      return null;
  }
}

/**
 * 生成rowspan信息，按连续分类计算。
 */
function computeCategoryRowSpans(metrics: MetricRow[]): MetricRow[] {
  let currentCategory = '';
  let categoryStartIndex = -1;

  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i];
    if (metric.category !== currentCategory) {
      // 新分类开始
      if (currentCategory !== '' && categoryStartIndex >= 0) {
        // 设置前一个分类的rowspan
        const rowSpan = i - categoryStartIndex;
        for (let j = categoryStartIndex; j < i; j++) {
          metrics[j].categoryRowSpan = rowSpan;
        }
      }
      currentCategory = metric.category;
      categoryStartIndex = i;
      metric.showCategory = true;
    } else {
      metric.showCategory = false;
    }
  }

  // 处理最后一个分类
  if (currentCategory !== '' && categoryStartIndex >= 0) {
    const rowSpan = metrics.length - categoryStartIndex;
    for (let j = categoryStartIndex; j < metrics.length; j++) {
      metrics[j].categoryRowSpan = rowSpan;
    }
  }

  return metrics;
}

/**
 * 根据SAFETY_REPORT_SCHEMA构建安全指标，严格按照固定顺序和分类。
 */
export function buildSafetyMetrics(
  snapshot: DepartmentDailySnapshot,
  ranges: Record<ShiftKey, ShiftRange>,
): MetricRow[] {
  const patients = patientMap(snapshot);

  const metrics: MetricRow[] = SAFETY_REPORT_SCHEMA.map(definition => {
    let values: Record<ShiftKey, string>;

    if (definition.mode === 'manual') {
      // 手工指标从嵌套结构读取
      values = {
        day: getManualMetricValue(snapshot, definition.key, 'day'),
        evening: getManualMetricValue(snapshot, definition.key, 'evening'),
        night: getManualMetricValue(snapshot, definition.key, 'night'),
      };
    } else {
      // 自动指标计算
      const calculatedValues = calculateAutoMetricValues(
        definition.key,
        snapshot,
        patients,
        ranges,
      );
      values = calculatedValues ?? { day: '—', evening: '—', night: '—' };
    }

    return {
      ...definition,
      categoryRowSpan: 1,
      showCategory: false,
      values,
    };
  });

  // 计算分类rowspan
  return computeCategoryRowSpans(metrics);
}
