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

/**
 * 清理遗留的 '—' 占位符，统一替换为空字符串。
 */
export function normalizeMetricDisplayValue(value: string | undefined | null): string {
  if (value == null) { return ''; }
  const trimmed = String(value).trim();
  return trimmed === '—' ? '' : trimmed;
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
  return beds.join('、');
}

/**
 * 出科排除（出科当天整日排除）：icuDischargeTime 早于报表窗口结束（报表日次日08:00）
 * 的患者，本报表三个班次均不再统计；出科时间在窗口结束之后（含窗口内未出科）的正常统计。
 * 快照为重返ICU比对会回溯48h带出已出科患者，需按此口径剔除。
 */
function dischargedFromReport(patient: DepartmentPatient, reportEnd: number): boolean {
  const discharge = timestamp(patient.icuDischargeTime);
  return Number.isFinite(discharge) && discharge < reportEnd;
}

function patientMap(snapshot: DepartmentDailySnapshot, reportEnd: number): Map<string, DepartmentPatient> {
  const result = new Map<string, DepartmentPatient>();
  for (const patient of snapshot.patients) {
    if (dischargedFromReport(patient, reportEnd)) { continue; }
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

/**
 * 体温≥38℃：取数口径为班次内体温 ≥38℃。
 * 展示：1床(39.1℃—37.6℃)，前值为班次内 ≥38℃ 的最高体温，后值为班次内最新一次体温；
 * 两者数值相同时只展示一次：1床(39.1℃)。
 */
function temperatureBeds(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  range: ShiftRange,
): string {
  const THRESHOLD = 38;

  interface TempReading {
    value: number;
    display: string;
    time: number;
  }

  const readingsByPid = new Map<string, TempReading[]>();
  for (const record of snapshot.bedsideRecords) {
    if (record.valid === false) { continue; }
    if (record.code !== 'param_T') { continue; }
    if (!inRange(record.time, range)) { continue; }
    const value = numberValue(record.strVal);
    if (!Number.isFinite(value)) { continue; }
    const list = readingsByPid.get(record.pid) ?? [];
    list.push({ value, display: text(record.strVal), time: timestamp(record.time) });
    readingsByPid.set(record.pid, list);
  }

  const entries: Array<{ bed: string; display: string }> = [];
  for (const [pid, readings] of readingsByPid) {
    const feverReadings = readings.filter(item => item.value >= THRESHOLD);
    if (feverReadings.length === 0) { continue; }
    const patient = patients.get(text(pid));
    if (!patient) { continue; }
    const bed = patientBed(patient);
    if (!bed) { continue; }

    const peak = feverReadings.reduce((max, item) => (item.value > max.value ? item : max));
    const latest = readings.reduce((last, item) => (item.time >= last.time ? item : last));
    const peakText = `${peak.display}℃`;
    const latestText = `${latest.display}℃`;
    entries.push({
      bed,
      display: `${bed}(${peak.value === latest.value ? peakText : `${peakText}—${latestText}`})`,
    });
  }

  entries.sort((left, right) => {
    const numberDiff = bedNumber(left.bed) - bedNumber(right.bed);
    return numberDiff !== 0 ? numberDiff : left.bed.localeCompare(right.bed, 'zh-CN');
  });
  return entries.map(entry => entry.display).join('、');
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

/**
 * 膀胱冲洗：按 orderType（临时/长期）、zyyz 频次（freq）与停止时间决定每个班次是否展示。
 * - 出科排除：已出科患者（出科时间早于报表窗口结束）不再统计，见 dischargedFromReport；
 * - 临时医嘱：仅在开立时间所在的班次展示，不看频次与停止时间；
 * - 长期医嘱（orderType 缺失按长期处理）：
 *   - freq "1"=仅白班，"2"=白班+中班，"3"=三个班；缺失/非法值按 3 处理；
 *   - 医嘱名称含"持续膀胱冲洗"的忽略频次，只要未停止每个班次都展示；
 *   - 开立时间需早于班次结束（开立时间包含查询时间）；
 *   - 有停止时间的，停止时间所在班次及其之后的班次不再展示。
 */
function bladderIrrigationBeds(
  snapshot: DepartmentDailySnapshot,
  range: ShiftRange,
  reportEnd: number,
): string {
  const patientByMrn = new Map<string, DepartmentPatient>();
  for (const patient of snapshot.patients) {
    if (dischargedFromReport(patient, reportEnd)) { continue; }
    const mrn = text(patient.mrn);
    if (mrn) { patientByMrn.set(mrn, patient); }
  }

  const shiftIndex: Record<ShiftKey, number> = { day: 0, evening: 1, night: 2 };
  const currentShiftIndex = shiftIndex[range.key];
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();

  const beds: string[] = [];
  for (const order of snapshot.orders) {
    const name = text(order.orderName);
    if (!name.includes('膀胱冲洗')) { continue; }
    const start = timestamp(order.orderTime);
    if (!Number.isFinite(start)) { continue; }
    const patient = patientByMrn.get(text(order.mrn));
    if (!patient) { continue; }
    if (text(order.orderType).includes('临时')) {
      // 临时医嘱：开立时间落在本班次内才展示
      if (start < rangeStart || start >= rangeEnd) { continue; }
    } else {
      // 长期医嘱：开立早于班次结束 + 停止时间 + 频次
      if (start >= rangeEnd) { continue; }
      if (order.stopTime) {
        const stop = timestamp(order.stopTime);
        if (Number.isFinite(stop) && stop < rangeEnd) { continue; }
      }
      if (!name.includes('持续膀胱冲洗')) {
        const freq = Number.parseInt(text(order.freq), 10);
        const freqShifts = Number.isFinite(freq) && freq >= 1 && freq <= 3 ? freq : 3;
        if (currentShiftIndex >= freqShifts) { continue; }
      }
    }
    beds.push(patientBed(patient));
  }
  return formatBeds(beds);
}

/**
 * 多重耐药菌床旁隔离医嘱：医嘱名称包含"接触隔离"。
 * 开始时间（orderTime）→ 新增多重耐药菌感染；结束时间（stopTime）→ 解除多重耐药菌床旁隔离。
 */
function isolationOrderBeds(
  snapshot: DepartmentDailySnapshot,
  patients: Map<string, DepartmentPatient>,
  range: ShiftRange,
  timeField: 'orderTime' | 'stopTime',
  reportEnd: number,
): string {
  const patientByMrn = new Map<string, DepartmentPatient>();
  for (const patient of snapshot.patients) {
    if (dischargedFromReport(patient, reportEnd)) { continue; }
    const mrn = text(patient.mrn);
    if (mrn) { patientByMrn.set(mrn, patient); }
  }

  const beds: string[] = [];
  for (const order of snapshot.orders) {
    if (!text(order.orderName).includes('接触隔离')) { continue; }
    const eventTime = timeField === 'orderTime' ? order.orderTime : order.stopTime;
    if (!inRange(eventTime, range)) { continue; }
    const patient = patientByMrn.get(text(order.mrn));
    if (patient) { beds.push(patientBed(patient)); }
  }
  return formatBeds(beds);
}

function nonPlannedAdmissionBeds(
  snapshot: DepartmentDailySnapshot,
  range: ShiftRange,
  reportEnd: number,
): string {
  return formatBeds(
    snapshot.patients
      .filter(patient => text(patient.admissionPlan) === '非计划转入')
      .filter(patient => inRange(patient.icuAdmissionTime, range))
      .filter(patient => !dischargedFromReport(patient, reportEnd))
      .map(patient => patientBed(patient)),
  );
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * 转出后重返ICU：同一患者（mrn）多次入科，patient 里会有多条记录。
 * 当次入科时间 − 上一次出科时间 的间隔：
 *   24小时重返 → 间隔 0～24h（含）
 *   48小时重返 → 间隔 24h～48h（含 48h，不含 24h，避免与 24h 档重复）
 * 当次入科时间落在班次内则计入当班。status 为 invalid 的记录排除。
 * 出科排除只作用于展示的当次记录（上一次出科记录仅用于间隔计算，须保留分组）。
 */
function returnIcuBeds(
  snapshot: DepartmentDailySnapshot,
  range: ShiftRange,
  bandMinHours: number,
  bandMaxHours: number,
  reportEnd: number,
): string {
  const grouped = new Map<string, DepartmentPatient[]>();
  for (const patient of snapshot.patients) {
    if (text(patient.status).toLowerCase() === 'invalid') { continue; }
    const mrn = text(patient.mrn);
    if (!mrn) { continue; }
    const list = grouped.get(mrn) ?? [];
    list.push(patient);
    grouped.set(mrn, list);
  }

  const minGap = bandMinHours * HOUR_MS;
  const maxGap = bandMaxHours * HOUR_MS;

  const beds: string[] = [];
  for (const list of grouped.values()) {
    if (list.length < 2) { continue; }
    list.sort((left, right) => timestamp(left.icuAdmissionTime) - timestamp(right.icuAdmissionTime));
    for (let index = 1; index < list.length; index++) {
      const previous = list[index - 1];
      const current = list[index];
      const previousOut = timestamp(previous.icuDischargeTime);
      const currentIn = timestamp(current.icuAdmissionTime);
      if (!Number.isFinite(previousOut) || !Number.isFinite(currentIn)) { continue; }
      const gap = currentIn - previousOut;
      // 0～24h 档含下界；24～48h 档不含 24h、含 48h
      const inBand = bandMinHours === 0
        ? gap >= 0 && gap <= maxGap
        : gap > minGap && gap <= maxGap;
      if (!inBand) { continue; }
      if (!inRange(current.icuAdmissionTime, range)) { continue; }
      if (dischargedFromReport(current, reportEnd)) { continue; }
      const bed = patientBed(current);
      if (bed) { beds.push(bed); }
    }
  }
  return formatBeds(beds);
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
  reportEnd: number,
): Record<ShiftKey, string> | null {
  const buildValues = (calculate: (range: ShiftRange) => string) =>
    buildAutoMetricValues(snapshot, patients, ranges, (range) => calculate(range));

  switch (key) {
    case 'temperatureAbove38':
      return buildValues(range => temperatureBeds(snapshot, patients, range));
    case 'hypoglycemia':
      return buildValues(range => bloodSugarBeds(snapshot, patients, range));
    case 'bladderIrrigation':
      return buildValues(range => bladderIrrigationBeds(snapshot, range, reportEnd));
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
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_CCI', value => value.length > 0));
    case 'ecmoTreatment':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_ECMOMoShi', value => value.length > 0));
    case 'newMultidrugResistantInfection':
      return buildValues(range => isolationOrderBeds(snapshot, patients, range, 'orderTime', reportEnd));
    case 'removeIsolation':
      return buildValues(range => isolationOrderBeds(snapshot, patients, range, 'stopTime', reportEnd));
    case 'pressureInjuryHighRisk':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_yaChuang_score', value => value.includes('高')));
    case 'fallHighRisk':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_patientFallDangerFactorV2', value => value.includes('高')));
    case 'unplannedExtubationHighRisk':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_unPlannedCGZYY', value => value.includes('高')));
    case 'suicideHighRisk':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_commitSuicideScore', value => value.includes('高')));
    case 'incontinenceDermatitis':
      return buildValues(range => bedsideBeds(snapshot, patients, range, 'param_score_incontinenceScore', value => value.includes('高度危险')));
    case 'unplannedPostoperativeAdmission':
      return buildValues(range => nonPlannedAdmissionBeds(snapshot, range, reportEnd));
    case 'returnIcuWithin24Hours':
      return buildValues(range => returnIcuBeds(snapshot, range, 0, 24, reportEnd));
    case 'returnIcuWithin48Hours':
      return buildValues(range => returnIcuBeds(snapshot, range, 24, 48, reportEnd));
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
  // 报表窗口结束时刻（报表日次日08:00，即夜班 end）：出科早于此时刻的患者整日排除
  const reportEnd = ranges.night.end.getTime();
  const patients = patientMap(snapshot, reportEnd);

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
        reportEnd,
      );
      values = calculatedValues ?? { day: '', evening: '', night: '' };
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
