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
     * 构建小结。
     *
     * @param kind          小结类型
     * @param source        原始数据
     * @param nursingDayStart 当天护理日开始时间
     * @param nursingDayEnd   当天护理日结束时间
     * @param nursingDayStartOfYesterday 昨天护理日开始时间
     * @return HljldSummary
     */
    public HljldSummary buildSummary(HljldSummary.Kind kind, HljldSourceData source,
                                      Date nursingDayStart, Date nursingDayEnd,
                                      Date nursingDayStartOfYesterday) {
        long nowMs = System.currentTimeMillis();

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
        addTextSegments(daySegments, nightSegments, nurseDescTypes.stream().collect(Collectors.toMap(s -> s, s -> 1.0)), dayStartMs, dayEndMs, nightStartMs, nightEndMs, "nurse", startMs);
        addTextSegments(daySegments, nightSegments, equivalentNursingOps.stream().collect(Collectors.toMap(s -> s, s -> 1.0)), dayStartMs, dayEndMs, nightStartMs, nightEndMs, "nurse", startMs);
        addTextSegments(daySegments, nightSegments, excludeParamNames.stream().collect(Collectors.toMap(s -> s, s -> 1.0)), dayStartMs, dayEndMs, nightStartMs, nightEndMs, "nurse", startMs);

        // 构建 HljldSummary
        HljldSummary summary = new HljldSummary();
        summary.setKind(kind);
        summary.setTime(new Date(nursingDayStart.getTime()));
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

        return summary;
    }

    /**
     * 构建时间轴，对应前端 buildTimeline。
     * 将数据组和小结按时间轴交错排列。
     */
    public List<HljldTimelineItem> buildTimeline(List<HljldTimeGroup> displayGroups,
                                                  HljldSummary daySummary,
                                                  HljldSummary shiftSummary,
                                                  HljldSummary fullDaySummary,
                                                  HljldSummary dischargeSummary) {
        List<HljldTimelineItem> timeline = new ArrayList<>();

        // 添加数据组
        for (HljldTimeGroup group : displayGroups) {
            timeline.add(HljldTimelineItem.ofGroup(group));
        }

        // 添加小结
        if (daySummary != null) timeline.add(HljldTimelineItem.ofSummary(daySummary));
        if (shiftSummary != null) timeline.add(HljldTimelineItem.ofSummary(shiftSummary));
        if (fullDaySummary != null) timeline.add(HljldTimelineItem.ofSummary(fullDaySummary));
        if (dischargeSummary != null) timeline.add(HljldTimelineItem.ofSummary(dischargeSummary));

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
}
