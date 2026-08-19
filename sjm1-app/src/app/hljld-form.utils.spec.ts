/**
 * hljld-form.utils 班段口径回归测试
 *
 * 场景：exec startTime=2026-08-17 20:21, endTime=2026-08-18 16:21
 *       speed=2.5 ml/h, cap=50ml
 * 预期：
 *   - 08-17 night段(07:00-17:00): 实用量26.6, 剩余量23.4
 *   - 08-18 day段(07:00-17:00): 实用量23.4, 剩余量0, 已停药不显示剩余量
 *   - 两段之和 = 50.0 = cap
 *   - 08-18表首行不出现26.6
 */
import { calcDrugUsageUpTo, calcSegmentUsage, resolveNursingSegments, buildSegmentSettlements, formatSegmentAmountText, resolveLiquidCap } from './hljld-form.utils';

// ---------- helpers ----------

function d(s: string): Date {
  // 解析 "YYYY-MM-DD HH:mm" 为本地北京时间
  const [datePart, timePart] = s.split(' ');
  const [y, m, day] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  return new Date(y, m - 1, day, h, min, 0, 0);
}

/** 构造一个 DrugExecution-like 对象 */
function makeExec(opts: {
  id?: string;
  methodCode?: string;
  startTime: string;  // "YYYY-MM-DD HH:mm"
  endTime?: string;
  liquidAmount?: number;
  drugList?: Array<{ name: string; dosage?: string }>;
  drugAction?: Array<{ time: string; action: string; speed?: string; speedUnit?: string }>;
}) {
  return {
    id: opts.id ?? 'exec-1',
    methodCode: opts.methodCode ?? 'IV-pump',
    startTime: opts.startTime,
    endTime: opts.endTime ?? null,
    liquidAmount: opts.liquidAmount ?? 50,
    drugList: opts.drugList ?? [{ name: 'TestDrug', dosage: '50ml' }],
    drugAction: opts.drugAction ?? [],
  } as any;
}

/** 构造 DrugMethodConfig */
function makeMethod(code = 'IV-pump', isOnce = false) {
  return {
    code,
    name: 'IV泵',
    inChannel: '静脉',
    isOnce,
  } as any;
}

// ---------- tests ----------

describe('hljld-form.utils 班段口径', () => {

  describe('calcSegmentUsage', () => {
    it('08-17 night段: 实用量≈26.6, 剩余量≈23.4', () => {
      const exec = makeExec({
        startTime: '2026-08-17 20:21',
        endTime: '2026-08-18 16:21',
        liquidAmount: 50,
        drugAction: [
          { time: '2026-08-17 20:21', action: '开始', speed: '2.5', speedUnit: 'ml/h' },
          { time: '2026-08-18 16:21', action: '停止' },
        ],
      });

      const segments = resolveNursingSegments(d('2026-08-17'));
      const night = segments[1]; // 17:00-次日07:00

      const used = calcSegmentUsage(exec, night.start, night.end);
      // 20:21 → 次日07:00 = 10h39min ≈ 10.65h × 2.5 = 26.6ml
      expect(used).toBeCloseTo(26.6, 0);
    });

    it('08-18 day段: 实用量≈23.4', () => {
      const exec = makeExec({
        startTime: '2026-08-17 20:21',
        endTime: '2026-08-18 16:21',
        liquidAmount: 50,
        drugAction: [
          { time: '2026-08-17 20:21', action: '开始', speed: '2.5', speedUnit: 'ml/h' },
          { time: '2026-08-18 16:21', action: '停止' },
        ],
      });

      const segments = resolveNursingSegments(d('2026-08-18'));
      const day = segments[0]; // 07:00-17:00

      // 段初=08-18 07:00, 段末=min(17:00, endTime=16:21) = 16:21
      const used = calcSegmentUsage(exec, day.start, day.end);
      // 07:00 → 16:21 = 9h21min ≈ 9.35h × 2.5 = 23.4ml
      expect(used).toBeCloseTo(23.4, 0);
    });

    it('两段之和 = cap = 50.0', () => {
      const exec = makeExec({
        startTime: '2026-08-17 20:21',
        endTime: '2026-08-18 16:21',
        liquidAmount: 50,
        drugAction: [
          { time: '2026-08-17 20:21', action: '开始', speed: '2.5', speedUnit: 'ml/h' },
          { time: '2026-08-18 16:21', action: '停止' },
        ],
      });

      const segs17 = resolveNursingSegments(d('2026-08-17'));
      const segs18 = resolveNursingSegments(d('2026-08-18'));

      const used17Night = calcSegmentUsage(exec, segs17[1].start, segs17[1].end);
      const used18Day = calcSegmentUsage(exec, segs18[0].start, segs18[0].end);
      const total = Math.round((used17Night + used18Day) * 10) / 10;

      expect(total).toBe(50.0);
    });
  });

  describe('resolveNursingSegments', () => {
    it('返回 day 和 night 两个段', () => {
      const segs = resolveNursingSegments(d('2026-08-18'));
      expect(segs.length).toBe(2);
      expect(segs[0].key).toBe('day');
      expect(segs[0].label).toBe('07:00-17:00');
      expect(segs[1].key).toBe('night');
      expect(segs[1].label).toBe('17:00-次日07:00');
    });

    it('day段 start = 07:00, end = 17:00', () => {
      const segs = resolveNursingSegments(d('2026-08-18'));
      expect(segs[0].start.getHours()).toBe(7);
      expect(segs[0].start.getMinutes()).toBe(0);
      expect(segs[0].end.getHours()).toBe(17);
      expect(segs[0].end.getMinutes()).toBe(0);
    });

    it('night段 start = 17:00, end = 次日07:00', () => {
      const segs = resolveNursingSegments(d('2026-08-18'));
      expect(segs[1].start.getHours()).toBe(17);
      expect(segs[1].start.getMinutes()).toBe(0);
      expect(segs[1].end.getDate()).toBe(19); // 次日
      expect(segs[1].end.getHours()).toBe(7);
      expect(segs[1].end.getMinutes()).toBe(0);
    });
  });

  describe('buildSegmentSettlements', () => {
    it('已停药不显示剩余量', () => {
      const exec = makeExec({
        startTime: '2026-08-17 20:21',
        endTime: '2026-08-18 16:21',
        liquidAmount: 50,
        drugAction: [
          { time: '2026-08-17 20:21', action: '开始', speed: '2.5', speedUnit: 'ml/h' },
          { time: '2026-08-18 16:21', action: '停止' },
        ],
      });
      const methods = [makeMethod()];

      const segs18 = resolveNursingSegments(d('2026-08-18'));
      const daySeg = segs18[0];

      // nowMs 设为段末之后，确保药物已停
      const nowMs = daySeg.end.getTime() + 60000;
      const settlements = buildSegmentSettlements([exec], methods, daySeg, nowMs);
      expect(settlements.length).toBe(1);
      expect(settlements[0].ongoing).toBe(false);
      // 已停药：formatSegmentAmountText 只显示实用量
      const text = formatSegmentAmountText(settlements[0]);
      expect(text).toContain('实用量');
      expect(text).not.toContain('剩余量');
    });

    it('仍在执行中显示剩余量', () => {
      const exec = makeExec({
        startTime: '2026-08-17 20:21',
        endTime: undefined, // 未结束
        liquidAmount: 50,
        drugAction: [
          { time: '2026-08-17 20:21', action: '开始', speed: '2.5', speedUnit: 'ml/h' },
        ],
      });
      const methods = [makeMethod()];

      const segs17 = resolveNursingSegments(d('2026-08-17'));
      const nightSeg = segs17[1];

      const nowMs = d('2026-08-18 02:00').getTime();
      const settlements = buildSegmentSettlements([exec], methods, nightSeg, nowMs);
      expect(settlements.length).toBe(1);
      expect(settlements[0].ongoing).toBe(true);
      const text = formatSegmentAmountText(settlements[0]);
      expect(text).toContain('实用量');
      expect(text).toContain('剩余量');
    });

    it('08-18表首行不出现08-17 night段的26.6', () => {
      const exec = makeExec({
        startTime: '2026-08-17 20:21',
        endTime: '2026-08-18 16:21',
        liquidAmount: 50,
        drugAction: [
          { time: '2026-08-17 20:21', action: '开始', speed: '2.5', speedUnit: 'ml/h' },
          { time: '2026-08-18 16:21', action: '停止' },
        ],
      });
      const methods = [makeMethod()];

      const segs18 = resolveNursingSegments(d('2026-08-18'));
      const daySeg = segs18[0];

      // 08-18 day段 settlement 不应包含跨天前的 night段用量
      const nowMs = daySeg.end.getTime() + 60000;
      const settlements = buildSegmentSettlements([exec], methods, daySeg, nowMs);
      expect(settlements.length).toBe(1);
      // day段实用量应为 ~23.4，不是 26.6
      expect(settlements[0].segmentUsed).toBeCloseTo(23.4, 0);
    });
  });

  describe('calcDrugUsageUpTo 累计量一致性', () => {
    it('cap = cumulativeUsed + remainder (容差 0.05)', () => {
      const exec = makeExec({
        startTime: '2026-08-17 20:21',
        endTime: '2026-08-18 16:21',
        liquidAmount: 50,
        drugAction: [
          { time: '2026-08-17 20:21', action: '开始', speed: '2.5', speedUnit: 'ml/h' },
          { time: '2026-08-18 16:21', action: '停止' },
        ],
      });

      const cap = resolveLiquidCap(exec);
      const cutoff = d('2026-08-18 12:00');
      const cumulativeUsed = calcDrugUsageUpTo(exec, cutoff);
      const remainder = cap - cumulativeUsed;

      expect(Math.abs(cumulativeUsed + remainder - cap)).toBeLessThan(0.05);
    });
  });
});
