package com.smartcare.backend.hljld;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 构建小结和时间轴，对应前端 buildSummary 和 buildTimeline。
 *
 * 核心逻辑：
 * 1. 为四个时间点（day/shift/fullDay/discharge）各生成一个 HljldSummary
 * 2. 计算各类别总量（出入量、药品、肠内营养、护理操作等）
 * 3. 根据护理记录类型过滤
 * 4. 按护理班段构建文本段落
 * 5. 将数据组和小结按时间轴交错排列
 */
@Service
public class HljldSummaryCalculator {

    private static final Logger log = LoggerFactory.getLogger(HljldSummaryCalculator.class);

    // 等效护理操作映射：检查/治疗/基础护理/健康教育 → 对应护理操作名称
    private static final Map<String, String> EQUIVALENT_NURSING_OPERATION = Map.of(
        "param_外出检查", "外出检查",
        "param_物理治疗", "物理治疗",
        "param_基础护理1", "基础护理",
        "param_健康教育", "健康教育"
    );

    @Autowired
    public HljldSummaryCalculator() {}

    /**
     * 构建小结（使用当前时间）。
     */
    public HljldSummary buildSummary(HljldSummary.Kind kind, HljldSourceData source,
                                      Date nursingDayStart, Date nursingDayEnd,
                                      Date nursingDayStartOfYesterday) {
        return buildSummary(kind, source, nursingDayStart, nursingDayEnd, nursingDayStartOfYesterday, System.currentTimeMillis());
    }

    /**
     * 构建小结。
     *
     * @param kind          小结类型
     * @param source        原始数据
     * @param nursingDayStart 当天护理日开始时间
     * @param nursingDayEnd   当天护理日结束时间
     * @param nursingDayStartOfYesterday 昨天护理日开始时间
     * @param nowMs         当前时刻毫秒（一次获取，向下传递）
     * @return HljldSummary
     */
    public HljldSummary buildSummary(HljldSummary.Kind kind, HljldSourceData source,
                                      Date nursingDayStart, Date nursingDayEnd,
                                      Date nursingDayStartOfYesterday, long nowMs) {

        // 确定段落
        List<HljldUtils.NursingSegment> segments = HljldUtils.resolveNursingSegments(nursingDayStart);

        HljldUtils.NursingSegment daySegment = segments.get(0);
        HljldUtils.NursingSegment nightSegment = segments.get(1);

        long dayStartMs = daySegment.start.getTime();
        long dayEndMs = daySegment.end.getTime();
        long nightStartMs = nightSegment.start.getTime();
        long nightEndMs = nightSegment.end.getTime();

        long startMs = nursingDayStart.getTime();
        long endMs = nursingDayEnd.getTime();

        // 日间小结在17:00截断
        final long effectiveEndMs = (kind == HljldSummary.Kind.DAY) ? dayEndMs : endMs;

        long effectiveNow = nowMs < effectiveEndMs ? nowMs : effectiveEndMs;

        // 按类别筛选
        List<Document> bedsideInPeriod = source.getBedside().stream()
            .filter(HljldUtils::isRenderableBedsideRecord)
            .filter(item -> {
                long t = (long) HljldUtils.databaseTimeValue(str(item, "time"));
                return t >= startMs && t < effectiveEndMs;
            })
            .collect(Collectors.toList());

        List<Document> drugsInPeriod = source.getDrugExecutions().stream()
            .filter(HljldUtils::isRenderableDrugExecution)
            .filter(item -> {
                long t = (long) HljldUtils.databaseTimeValue(str(item, "startTime"));
                return t >= startMs && t < effectiveEndMs;
            })
            .collect(Collectors.toList());

        List<Document> nurseInPeriod = source.getNurseRecords().stream()
            .filter(HljldUtils::isValidBusinessRecord)
            .filter(item -> !HljldUtils.str(item, "desc").isEmpty())
            .filter(item -> {
                long t = (long) HljldUtils.databaseTimeValue(str(item, "time"));
                return t >= startMs && t < effectiveEndMs;
            })
            .collect(Collectors.toList());

        // ══════════════════════════════════════════════════════════
        //  出入量
        // ══════════════════════════════════════════════════════════

        // 入量：药品
        Map<String, Double> medicationAmounts = new LinkedHashMap<>();
        for (Document execution : drugsInPeriod) {
            Document method = HljldUtils.findDrugMethod(str(execution, "methodCode"), source.getDrugMethods());
            if (method == null) continue;
            if (Boolean.TRUE.equals(method.get("isOnce"))) continue;

            String name = HljldUtils.drugDisplayName(execution);
            if (name.isEmpty()) continue;

            List<Map<String, Object>> actionList = getList(execution, "drugActionList");
            if (actionList == null || actionList.isEmpty()) {
                medicationAmounts.merge(name, HljldUtils.parseAmount(execution.get("dose")), Double::sum);
            } else {
                double amt = 0;
                for (Map<String, Object> action : actionList) {
                    String act = str(action, "action").trim();
                    switch (act) {
                        case "start":
                        case "recovery": {
                            long startMsAct = (long) HljldUtils.databaseTimeValue(str(action, "time"));
                            long endMsAct = effectiveNow;
                            for (Map<String, Object> nextAction : actionList) {
                                String nextAct = str(nextAction, "action").trim();
                                if (!Arrays.asList("pause", "stop", "add", "minus", "quickAdd").contains(nextAct))
                                    continue;
                                long nextMs = (long) HljldUtils.databaseTimeValue(str(nextAction, "time"));
                                if (nextMs > startMsAct && nextMs < effectiveNow) {
                                    endMsAct = nextMs;
                                    break;
                                }
                            }
                            if (endMsAct <= startMsAct) break;
                            double speed = HljldUtils.parseAmount(action.get("speed"));
                            String speedUnit = str(action, "speedUnit");
                            if ("ml/min".equals(speedUnit)) speed = speed * 60;
                            amt += HljldUtils.calcContinuousDrugAmount(speed, startMsAct, endMsAct);
                            break;
                        }
                        case "add": {
                            long actMs = (long) HljldUtils.databaseTimeValue(str(action, "time"));
                            amt += HljldUtils.parseAmount(action.get("quickAddAmount"));
                            long nextMs = effectiveNow;
                            for (Map<String, Object> nextAction : actionList) {
                                String nextAct = str(nextAction, "action").trim();
                                if (!Arrays.asList("pause", "stop").contains(nextAct)) continue;
                                long nextMsAct = (long) HljldUtils.databaseTimeValue(str(nextAction, "time"));
                                if (nextMsAct > actMs && nextMsAct < effectiveNow) {
                                    nextMs = nextMsAct;
                                    break;
                                }
                            }
                            if (nextMs > actMs) {
                                double speed = HljldUtils.parseAmount(action.get("speed"));
                                String speedUnit = str(action, "speedUnit");
                                if ("ml/min".equals(speedUnit)) speed = speed * 60;
                                amt += HljldUtils.calcContinuousDrugAmount(speed, actMs, nextMs);
                            }
                            break;
                        }
                        case "minus":
                        case "quickAdd": {
                            long actMs = (long) HljldUtils.databaseTimeValue(str(action, "time"));
                            amt += HljldUtils.parseAmount(action.get("quickAddAmount"));
                            long nextMs = effectiveNow;
                            for (Map<String, Object> nextAction : actionList) {
                                String nextAct = str(nextAction, "action").trim();
                                if (!Arrays.asList("pause", "stop").contains(nextAct)) continue;
                                long nextMsAct = (long) HljldUtils.databaseTimeValue(str(nextAction, "time"));
                                if (nextMsAct > actMs && nextMsAct < effectiveNow) {
                                    nextMs = nextMsAct;
                                    break;
                                }
                            }
                            if (nextMs > actMs) {
                                double speed = HljldUtils.parseAmount(action.get("speed"));
                                String speedUnit = str(action, "speedUnit");
                                if ("ml/min".equals(speedUnit)) speed = speed * 60;
                                amt += HljldUtils.calcContinuousDrugAmount(speed, actMs, nextMs);
                            }
                            break;
                        }
                        case "pause": {
                            long startMsAct = (long) HljldUtils.databaseTimeValue(str(action, "time"));
                            long endMsAct = effectiveNow;
                            for (Map<String, Object> nextAction : actionList) {
                                String nextAct = str(nextAction, "action").trim();
                                if (!Arrays.asList("start", "recovery", "add", "minus", "quickAdd").contains(nextAct))
                                    continue;
                                long nextMs = (long) HljldUtils.databaseTimeValue(str(nextAction, "time"));
                                if (nextMs > startMsAct && nextMs < effectiveNow) {
                                    endMsAct = nextMs;
                                    break;
                                }
                            }
                            if (endMsAct > startMsAct) {
                                double speed = HljldUtils.parseAmount(action.get("speed"));
                                String speedUnit = str(action, "speedUnit");
                                if ("ml/min".equals(speedUnit)) speed = speed * 60;
                                amt += HljldUtils.calcContinuousDrugAmount(speed, startMsAct, endMsAct);
                            }
                            break;
                        }
                        case "stop":
                            break;
                        default:
                            break;
                    }
                }
                medicationAmounts.merge(name, HljldUtils.round1(amt), Double::sum);
            }
        }

        // 入量：肠内营养
        Map<String, Double> enteralAmounts = new LinkedHashMap<>();
        for (Document execution : drugsInPeriod) {
            Document method = HljldUtils.findDrugMethod(str(execution, "methodCode"), source.getDrugMethods());
            if (method == null || !"胃肠".equals(str(method, "group"))) continue;

            String drugName = HljldUtils.drugDisplayName(execution);
            if (!HljldUtils.isTargetEnteral(drugName)) continue;

            String displayName = HljldUtils.enteralDisplayName(drugName);
            List<Map<String, Object>> actionList = getList(execution, "drugActionList");

            if (actionList == null || actionList.isEmpty()) {
                enteralAmounts.merge(displayName, HljldUtils.parseAmount(execution.get("dose")), Double::sum);
            } else {
                double totalQuickAdd = 0;
                for (Map<String, Object> action : actionList) {
                    String act = str(action, "action").trim().toLowerCase();
                    if ("quickadd".equals(act)) {
                        totalQuickAdd += HljldUtils.parseAmount(action.get("quickAddAmount"));
                    }
                }
                if (totalQuickAdd > 0) {
                    enteralAmounts.merge(displayName, totalQuickAdd, Double::sum);
                }
            }
        }

        // 出量
        List<NameAmount> outAll = bedsideInPeriod.stream()
            .filter(item -> HljldUtils.OUTPUT_CODE_NAMES.containsKey(str(item, "code")))
            .map(item -> new NameAmount(
                HljldUtils.OUTPUT_CODE_NAMES.get(str(item, "code")),
                HljldUtils.displayAmount(item.get("strVal")),
                HljldUtils.parseAmount(item.get("strVal"))))
            .filter(NameAmount::hasAmountValue)
            .collect(Collectors.toList());

        Map<String, Double> urineMap = outAll.stream()
            .filter(item -> "尿量".equals(item.getName()))
            .collect(Collectors.groupingBy(NameAmount::getName, Collectors.summingDouble(NameAmount::getNumericAmount)));

        Map<String, Double> ultrafiltrationMap = outAll.stream()
            .filter(item -> "净超滤量".equals(item.getName()))
            .collect(Collectors.groupingBy(NameAmount::getName, Collectors.summingDouble(NameAmount::getNumericAmount)));

        List<NameAmount> otherOutAll = outAll.stream()
            .filter(item -> !"尿量".equals(item.getName()) && !"净超滤量".equals(item.getName()))
            .collect(Collectors.toList());

        // 引流液
        List<NameAmount> drainAll = bedsideInPeriod.stream()
            .filter(item -> HljldUtils.isDrainCode(str(item, "code")))
            .map(item -> new NameAmount(
                HljldUtils.drainName(str(item, "code")),
                HljldUtils.displayAmount(item.get("strVal")),
                HljldUtils.parseAmount(item.get("strVal"))))
            .filter(NameAmount::hasAmountValue)
            .collect(Collectors.toList());

        Map<String, Double> drainMap = new LinkedHashMap<>();
        for (NameAmount d : drainAll) {
            drainMap.merge(d.getName(), d.getNumericAmount(), Double::sum);
        }

        // 合并尿量和净超滤量
        Map<String, Double> outputMap = new LinkedHashMap<>();
        outputMap.putAll(urineMap);
        outputMap.putAll(ultrafiltrationMap);

        // ══════════════════════════════════════════════════════════
        //  护理操作
        // ══════════════════════════════════════════════════════════

        // 护理记录类型
        List<String> nurseDescTypes = nurseInPeriod.stream()
            .map(item -> str(item, "desc"))
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toList());

        // 等效护理操作
        List<String> equivalentNursingOps = bedsideInPeriod.stream()
            .filter(item -> EQUIVALENT_NURSING_OPERATION.containsKey(str(item, "code")))
            .map(item -> EQUIVALENT_NURSING_OPERATION.get(str(item, "code")))
            .distinct()
            .collect(Collectors.toList());

        // 检查/治疗/基础护理/健康教育名称
        List<String> paramNames = bedsideInPeriod.stream()
            .filter(item -> HljldUtils.isExaminationTreatmentBasicCareOrHealthEducation(str(item, "code")))
            .map(item -> HljldUtils.displayName(str(item, "code")))
            .filter(s -> !s.isEmpty())
            .distinct()
            .collect(Collectors.toList());

        // 排除护理记录名称：从 paramNames 中移除已有护理操作记录类型
        List<String> excludeParamNames = paramNames.stream()
            .filter(name -> !nurseDescTypes.contains(name))
            .collect(Collectors.toList());

        // ══════════════════════════════════════════════════════════
        //  文本段落
        // ══════════════════════════════════════════════════════════

        List<HljldUtils.TextSegment> daySegments = new ArrayList<>();
        List<HljldUtils.TextSegment> nightSegments = new ArrayList<>();

        // 将列表数据转换为文本段落
        addTextSegments(daySegments, nightSegments, medicationAmounts, dayStartMs, dayEndMs, nightStartMs, nightEndMs, "drug", startMs);
        addTextSegments(daySegments, nightSegments, enteralAmounts, dayStartMs, dayEndMs, nightStartMs, nightEndMs, "enteral", startMs);
        addTextSegments(daySegments, nightSegments, outputMap, dayStartMs, dayEndMs, nightStartMs, nightEndMs, "output", startMs);
        addTextSegments(daySegments, nightSegments, drainMap, dayStartMs, dayEndMs, nightStartMs, nightEndMs, "drain", startMs);
        // 使用 LinkedHashMap 并提供 mergeFunction 处理重复键，保留所有记录
        addTextSegments(daySegments, nightSegments, nurseDescTypes.stream().collect(Collectors.toMap(s -> s, s -> 1.0, Double::sum, LinkedHashMap::new)), dayStartMs, dayEndMs, nightStartMs, nightEndMs, "nurse", startMs);
        addTextSegments(daySegments, nightSegments, equivalentNursingOps.stream().collect(Collectors.toMap(s -> s, s -> 1.0, Double::sum, LinkedHashMap::new)), dayStartMs, dayEndMs, nightStartMs, nightEndMs, "nurse", startMs);
        addTextSegments(daySegments, nightSegments, excludeParamNames.stream().collect(Collectors.toMap(s -> s, s -> 1.0, Double::sum, LinkedHashMap::new)), dayStartMs, dayEndMs, nightStartMs, nightEndMs, "nurse", startMs);

        // 构建 HljldSummary
        HljldSummary summary = new HljldSummary();
        summary.setKind(kind);
        // 根据类型设置正确的时间锚点
        switch (kind) {
            case DAY:
                // 日间小结：时间锚点为当天17:00
                summary.setTime(new Date(dayEndMs));
                break;
            case FULL_DAY:
                // 24小时总结：时间锚点为次日07:00
                summary.setTime(new Date(nursingDayEnd.getTime()));
                break;
            default:
                // 其他类型使用护理日开始时间
                summary.setTime(new Date(nursingDayStart.getTime()));
                break;
        }
        summary.setDayText(buildDayText(daySegments));
        summary.setNightText(buildNightText(nightSegments));

        // 汇总数据
        double totalMedication = medicationAmounts.values().stream().mapToDouble(Double::doubleValue).sum();
        double totalEnteral = enteralAmounts.values().stream().mapToDouble(Double::doubleValue).sum();
        double totalUrine = urineMap.values().stream().mapToDouble(Double::doubleValue).sum();
        double totalUltrafiltration = ultrafiltrationMap.values().stream().mapToDouble(Double::doubleValue).sum();
        double totalOutput = otherOutAll.stream().mapToDouble(NameAmount::getNumericAmount).sum();

        summary.setMedicationSum(HljldUtils.round1(totalMedication));
        summary.setEnteralSum(HljldUtils.round1(totalEnteral));
        summary.setInputSum(HljldUtils.round1(totalMedication + totalEnteral));
        summary.setUrineSum(HljldUtils.round1(totalUrine));
        summary.setUltrafiltrationSum(HljldUtils.round1(totalUltrafiltration));
        summary.setOutputSum(HljldUtils.round1(totalUrine + totalUltrafiltration + totalOutput));

        // 详细项目
        List<SummaryItem> medicationItems = new ArrayList<>();
        medicationAmounts.forEach((name, amount) ->
            medicationItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setMedicationItems(medicationItems);

        List<SummaryItem> enteralItems = new ArrayList<>();
        enteralAmounts.forEach((name, amount) ->
            enteralItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setEnteralItems(enteralItems);

        List<SummaryItem> urineItems = new ArrayList<>();
        urineMap.forEach((name, amount) ->
            urineItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setUrineItems(urineItems);

        List<SummaryItem> ultrafiltrationItems = new ArrayList<>();
        ultrafiltrationMap.forEach((name, amount) ->
            ultrafiltrationItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setUltrafiltrationItems(ultrafiltrationItems);

        List<SummaryItem> outputItems = new ArrayList<>();
        otherOutAll.forEach(na ->
            outputItems.add(new SummaryItem(na.getName(), na.getName(), na.getNumericAmount())));
        summary.setOutputItems(outputItems);

        List<SummaryItem> drainItems = new ArrayList<>();
        drainMap.forEach((name, amount) ->
            drainItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setDrainItems(drainItems);

        List<SummaryItem> nurseItems = new ArrayList<>();
        nurseDescTypes.forEach(name ->
            nurseItems.add(new SummaryItem(name, name, 1)));
        equivalentNursingOps.forEach(name ->
            nurseItems.add(new SummaryItem(name, name, 1)));
        excludeParamNames.forEach(name ->
            nurseItems.add(new SummaryItem(name, name, 1)));
        summary.setNurseItems(nurseItems);

        // ══════════════════════════════════════════════════════════
        //  构建 detailLines（与前端 buildInputLine/buildOutputLine 保持一致）
        // ══════════════════════════════════════════════════════════
        List<List<SummaryTextToken>> detailLines = new ArrayList<>();

        // 第一行：入量行
        detailLines.add(buildInputLineTokens(
            summary.getInputSum(),
            summary.getMedicationSum(),
            summary.getMedicationItems(),
            summary.getEnteralSum(),
            summary.getEnteralItems()
        ));

        // 第二行：出量行
        detailLines.add(buildOutputLineTokens(
            summary.getOutputSum(),
            summary.getUrineSum(),
            summary.getUltrafiltrationSum(),
            summary.getOutputSum() - summary.getUrineSum() - summary.getUltrafiltrationSum(),
            summary.getOutputItems(),
            summary.getDrainItems()
        ));

        // 第三行：平衡量
        List<SummaryTextToken> balanceLine = new ArrayList<>();
        balanceLine.add(new SummaryTextToken("平衡量：", false, false));
        balanceLine.add(new SummaryTextToken(String.format("%.1f", summary.getBalance()) + " ml", true, false));
        detailLines.add(balanceLine);

        summary.setDetailLines(detailLines);

        return summary;
    }

    /**
     * 构建时间轴，对应前端 buildTimeline。
     * 将数据组和小结按时间轴交错排列。
     *
     * @param nowMs 当前时刻毫秒（用于判断小结是否应显示）
     */
    public List<HljldTimelineItem> buildTimeline(List<HljldTimeGroup> displayGroups,
                                                  HljldSummary daySummary,
                                                  HljldSummary shiftSummary,
                                                  HljldSummary fullDaySummary,
                                                  HljldSummary dischargeSummary,
                                                  long nowMs) {
        List<HljldTimelineItem> timeline = new ArrayList<>();

        // 添加数据组
        for (HljldTimeGroup group : displayGroups) {
            timeline.add(HljldTimelineItem.ofGroup(group));
        }

        // ── 时间过滤逻辑（与前端 buildTimeline 保持一致） ──
        // 计算时间边界（使用 Asia/Shanghai 时区）
        java.time.ZoneId shanghaiZone = java.time.ZoneId.of("Asia/Shanghai");
        java.time.LocalDateTime nowDateTime = java.time.Instant.ofEpochMilli(nowMs).atZone(shanghaiZone).toLocalDateTime();

        // 当天17:00边界
        java.time.LocalDateTime day1700 = nowDateTime.withHour(17).withMinute(0).withSecond(0).withNano(0);
        long dayBoundaryMs = day1700.atZone(shanghaiZone).toInstant().toEpochMilli();

        // 次日07:00边界
        java.time.LocalDateTime nextMorning0700 = nowDateTime.plusDays(1).withHour(7).withMinute(0).withSecond(0).withNano(0);
        long nextMorningBoundaryMs = nextMorning0700.atZone(shanghaiZone).toInstant().toEpochMilli();

        // 日间小结显示条件：必须有效且时间段大于0分钟，且当前时间已到达17:00
        boolean showDaySummary =
            daySummary != null
            && daySummary.getTime() != null
            && daySummary.getTime().getTime() > 0
            && nowMs >= dayBoundaryMs;

        // 24小时总结和班段小结显示条件：当前时间已到达次日07:00
        boolean showShiftSummary =
            shiftSummary != null
            && shiftSummary.getTime() != null
            && shiftSummary.getTime().getTime() > 0
            && nowMs >= nextMorningBoundaryMs;

        boolean showFullDaySummary =
            fullDaySummary != null
            && fullDaySummary.getTime() != null
            && fullDaySummary.getTime().getTime() > 0
            && nowMs >= nextMorningBoundaryMs;

        // 出科总结：始终显示（如果存在）
        boolean showDischargeSummary = dischargeSummary != null && dischargeSummary.getTime() != null;

        // 按时间顺序插入小结（与前端逻辑对齐）
        // 日间小结：在17:00位置插入
        if (showDaySummary) {
            HljldTimelineItem dayItem = HljldTimelineItem.ofSummary(daySummary);
            dayItem.setTimestamp(dayBoundaryMs);
            dayItem.setSortRank(1); // 日间小结排序优先级
            timeline.add(dayItem);
        }

        // 24小时总结：在次日07:00位置插入
        if (showFullDaySummary) {
            HljldTimelineItem fullDayItem = HljldTimelineItem.ofSummary(fullDaySummary);
            fullDayItem.setTimestamp(nextMorningBoundaryMs);
            fullDayItem.setSortRank(3); // 24小时总结排序优先级
            timeline.add(fullDayItem);
        }

        // 班段小结：在次日07:00位置插入
        if (showShiftSummary) {
            HljldTimelineItem shiftItem = HljldTimelineItem.ofSummary(shiftSummary);
            shiftItem.setTimestamp(nextMorningBoundaryMs);
            timeline.add(shiftItem);
        }

        // 出科总结：在出科时间位置插入
        if (showDischargeSummary) {
            timeline.add(HljldTimelineItem.ofSummary(dischargeSummary));
        }

        // 按时间排序（数据组在前，小结在后）
        timeline.sort(Comparator.comparingLong(HljldTimelineItem::getTimestamp)
            .thenComparingInt(item -> item.getKind() == HljldTimelineItem.Kind.TIME_GROUP ? 0 : 1));

        return timeline;
    }

    // ══════════════════════════════════════════════════════════
    //  私有辅助方法
    // ══════════════════════════════════════════════════════════

    private void addTextSegments(List<HljldUtils.TextSegment> daySegments, List<HljldUtils.TextSegment> nightSegments,
                                  Map<String, Double> amounts, long dayStartMs, long dayEndMs,
                                  long nightStartMs, long nightEndMs, String category, long nursingDayStartMs) {
        for (Map.Entry<String, Double> entry : amounts.entrySet()) {
            HljldUtils.TextSegment seg = new HljldUtils.TextSegment();
            seg.setCategory(category);
            seg.setCategoryDisplay(category);
            seg.setSegment("day");
            seg.setSegmentStartMs(dayStartMs);
            seg.setSegmentEndMs(dayEndMs);
            seg.setStartMs(nursingDayStartMs);
            seg.setEndMs(dayEndMs);
            seg.setText(buildTextSegment(entry.getKey(), entry.getValue(), category));
            seg.setTokens(buildTextTokens(entry.getKey(), entry.getValue(), category));
            daySegments.add(seg);

            HljldUtils.TextSegment nightSeg = new HljldUtils.TextSegment();
            nightSeg.setCategory(category);
            nightSeg.setCategoryDisplay(category);
            nightSeg.setSegment("night");
            nightSeg.setSegmentStartMs(nightStartMs);
            nightSeg.setSegmentEndMs(nightEndMs);
            nightSeg.setStartMs(nursingDayStartMs);
            nightSeg.setEndMs(nightEndMs);
            nightSeg.setText(buildTextSegment(entry.getKey(), entry.getValue(), category));
            nightSeg.setTokens(buildTextTokens(entry.getKey(), entry.getValue(), category));
            nightSegments.add(nightSeg);
        }
    }

    private String buildTextSegment(String name, double amount, String category) {
        switch (category) {
            case "drug":
                return name + " " + String.format("%.1f", amount) + "ml";
            case "enteral":
                return name + " " + String.format("%.1f", amount) + "ml";
            case "output":
                return name + " " + String.format("%.1f", amount) + "ml";
            case "drain":
                return name + " " + String.format("%.1f", amount) + "ml";
            default:
                return name;
        }
    }

    private List<SummaryTextToken> buildTextTokens(String name, double amount, String category) {
        List<SummaryTextToken> tokens = new ArrayList<>();
        switch (category) {
            case "drug":
            case "enteral":
            case "output":
            case "drain":
                tokens.add(new SummaryTextToken(name, false, false));
                tokens.add(new SummaryTextToken(" ", false, true));
                tokens.add(new SummaryTextToken(String.format("%.1f", amount), true, false));
                tokens.add(new SummaryTextToken("ml", false, false));
                break;
            default:
                tokens.add(new SummaryTextToken(name, false, false));
                break;
        }
        return tokens;
    }

    private String buildDayText(List<HljldUtils.TextSegment> daySegments) {
        return daySegments.stream()
            .map(HljldUtils.TextSegment::getText)
            .collect(Collectors.joining("；"));
    }

    private String buildNightText(List<HljldUtils.TextSegment> nightSegments) {
        return nightSegments.stream()
            .map(HljldUtils.TextSegment::getText)
            .collect(Collectors.joining("；"));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getList(Document doc, String key) {
        Object v = doc.get(key);
        if (v instanceof List) return (List<Map<String, Object>>) v;
        return null;
    }

    private static String str(Document doc, String key) {
        Object v = doc.get(key);
        return v != null ? v.toString().trim() : "";
    }

    private static String str(Map<?, ?> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString().trim() : "";
    }

    // ══════════════════════════════════════════════════════════
    //  detailLines 构建方法（与前端 buildInputLine/buildOutputLine 保持一致）
    // ══════════════════════════════════════════════════════════

    /**
     * 构建入量行 tokens。
     * 格式：总入量：xx ml；药物治疗：xx ml（带入药量、静脉入量（输血入量、iv、ivgtt…））；胃肠摄入：xx ml（鼻饲量（鼻饲、鼻饲泵入）、胃肠入量（po））
     */
    private List<SummaryTextToken> buildInputLineTokens(
            double totalInput,
            double drugTreatmentTotal,
            List<SummaryItem> drugTreatmentItems,
            double gastrointestinalInputTotal,
            List<SummaryItem> gastrointestinalInputItems) {

        List<SummaryTextToken> tokens = new ArrayList<>();
        pushAmount(tokens, "总入量", totalInput);

        // 药物治疗
        List<SummaryItem> nonZeroDrugItems = drugTreatmentItems.stream()
            .filter(item -> HljldUtils.round1(item.getAmount()) != 0)
            .collect(Collectors.toList());
        if (HljldUtils.round1(drugTreatmentTotal) != 0 || !nonZeroDrugItems.isEmpty()) {
            tokens.add(new SummaryTextToken("；", false, true));
            pushGroupTokens(tokens, "药物治疗", drugTreatmentTotal, nonZeroDrugItems);
        }

        // 胃肠摄入
        List<SummaryItem> nonZeroGastroItems = gastrointestinalInputItems.stream()
            .filter(item -> HljldUtils.round1(item.getAmount()) != 0)
            .collect(Collectors.toList());
        if (HljldUtils.round1(gastrointestinalInputTotal) != 0 || !nonZeroGastroItems.isEmpty()) {
            tokens.add(new SummaryTextToken("；", false, true));
            pushGroupTokens(tokens, "胃肠摄入", gastrointestinalInputTotal, nonZeroGastroItems);
        }

        return tokens;
    }

    /**
     * 构建出量行 tokens。
     * 格式：总出量：xx ml；尿量：xx ml；净超滤量：xx ml；排出物：xx ml（…）；引流液：xx ml（…）
     */
    private List<SummaryTextToken> buildOutputLineTokens(
            double totalOutput,
            double urineTotal,
            double ultrafiltrationTotal,
            double excretionTotal,
            List<SummaryItem> outputItems,
            List<SummaryItem> drainItems) {

        List<SummaryTextToken> tokens = new ArrayList<>();
        pushAmount(tokens, "总出量", totalOutput);

        // 尿量
        if (HljldUtils.round1(urineTotal) != 0) {
            tokens.add(new SummaryTextToken("；", false, true));
            pushAmount(tokens, "尿量", urineTotal);
        }

        // 净超滤量
        if (HljldUtils.round1(ultrafiltrationTotal) != 0) {
            tokens.add(new SummaryTextToken("；", false, true));
            pushAmount(tokens, "净超滤量", ultrafiltrationTotal);
        }

        // 排出物
        List<SummaryItem> nonZeroOutputItems = outputItems.stream()
            .filter(item -> HljldUtils.round1(item.getAmount()) != 0)
            .collect(Collectors.toList());
        if (HljldUtils.round1(excretionTotal) != 0 || !nonZeroOutputItems.isEmpty()) {
            tokens.add(new SummaryTextToken("；", false, true));
            pushGroupTokens(tokens, "排出物", excretionTotal, nonZeroOutputItems);
        }

        // 引流液
        double drainTotal = drainItems.stream().mapToDouble(SummaryItem::getAmount).sum();
        List<SummaryItem> nonZeroDrainItems = drainItems.stream()
            .filter(item -> HljldUtils.round1(item.getAmount()) != 0)
            .collect(Collectors.toList());
        if (HljldUtils.round1(drainTotal) != 0 || !nonZeroDrainItems.isEmpty()) {
            tokens.add(new SummaryTextToken("；", false, true));
            pushGroupTokens(tokens, "引流液", drainTotal, nonZeroDrainItems);
        }

        return tokens;
    }

    /**
     * 推入「标签：xx ml」格式的 tokens。
     */
    private void pushAmount(List<SummaryTextToken> tokens, String label, double amount) {
        tokens.add(new SummaryTextToken(label + "：", false, false));
        tokens.add(new SummaryTextToken(String.format("%.1f", amount) + " ml", true, false));
    }

    /**
     * 推入带子项的分组 tokens。
     * 格式：标签：xx ml（子项1：xx ml、子项2：xx ml）
     */
    private void pushGroupTokens(List<SummaryTextToken> tokens, String label, double total, List<SummaryItem> items) {
        pushAmount(tokens, label, total);
        if (!items.isEmpty()) {
            tokens.add(new SummaryTextToken("（", false, false));
            for (int i = 0; i < items.size(); i++) {
                if (i > 0) {
                    tokens.add(new SummaryTextToken("、", false, false));
                }
                pushAmount(tokens, items.get(i).getLabel(), items.get(i).getAmount());
                // 如果有子项，递归处理
                if (items.get(i).getChildren() != null && !items.get(i).getChildren().isEmpty()) {
                    tokens.add(new SummaryTextToken("（", false, false));
                    pushItemsTokens(tokens, items.get(i).getChildren());
                    tokens.add(new SummaryTextToken("）", false, false));
                }
            }
            tokens.add(new SummaryTextToken("）", false, false));
        }
    }

    /**
     * 递归推入明细项 tokens。
     */
    private void pushItemsTokens(List<SummaryTextToken> tokens, List<SummaryItem> items) {
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) {
                tokens.add(new SummaryTextToken("、", false, false));
            }
            pushAmount(tokens, items.get(i).getLabel(), items.get(i).getAmount());
            if (items.get(i).getChildren() != null && !items.get(i).getChildren().isEmpty()) {
                tokens.add(new SummaryTextToken("（", false, false));
                pushItemsTokens(tokens, items.get(i).getChildren());
                tokens.add(new SummaryTextToken("）", false, false));
            }
        }
    }
}
