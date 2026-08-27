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

        log.info("[hljld] 开始计算出入量，统计周期: {} ~ {}", new Date(startMs), new Date(endMs));
        log.info("[hljld] 统计周期内药物记录数: {}", drugsInPeriod.size());

        // 入量：药品（静脉入量）
        // 使用 HljldUtils.calcContinuousDrugAmountMs 进行精确计算，支持 liquidAmount 封顶
        Map<String, Double> medicationAmounts = new LinkedHashMap<>();
        // 静脉入量细分：ivgtt、iv泵、iv
        double ivgttTotal = 0;
        double ivPumpTotal = 0;
        double ivTotal = 0;

        for (Document execution : drugsInPeriod) {
            String methodCode = str(execution, "methodCode");
            Document method = HljldUtils.findDrugMethod(methodCode, source.getDrugMethods());
            String drugName = HljldUtils.drugDisplayName(execution);
            String startTime = str(execution, "startTime");
            String endTime = str(execution, "endTime");
            double liquidAmount = HljldUtils.parseAmount(execution.get("liquidAmount"));
            double dose = HljldUtils.parseAmount(execution.get("dose"));

            log.info("[hljld] 药物记录: name={}, methodCode={}, startTime={}, endTime={}, liquidAmount={}, dose={}",
                drugName, methodCode, startTime, endTime, liquidAmount, dose);

            if (method == null) {
                log.warn("[hljld] 药物方法未找到: name={}, methodCode={}", drugName, methodCode);
                continue;
            }

            String group = str(method, "group");
            String inChannel = str(method, "inChannel");
            String methodName = str(method, "name");
            log.info("[hljld] 药物方法匹配: name={}, methodCode={}, methodName={}, group={}, inChannel={}",
                drugName, methodCode, methodName, group, inChannel);

            // 使用 inChannel 判断是否计入入量（与前端逻辑一致）
            if (!HljldUtils.COUNTED_IN_CHANNELS.contains(inChannel)) {
                log.info("[hljld] 药物跳过（非计入通道）: name={}, inChannel={}", drugName, inChannel);
                continue;
            }

            String name = HljldUtils.drugDisplayName(execution);
            if (name.isEmpty()) {
                log.warn("[hljld] 药物名称为空，跳过");
                continue;
            }

            // 判断是否为单次给药（isOnce=true 或 null）
            // 对于单次给药，直接使用 liquidAmount；对于持续泵注，使用精确计算
            double amt;
            Boolean isOnce = method.getBoolean("isOnce");
            if (isOnce == null || isOnce) {
                // 单次给药：检查 startTime 是否在统计区间内
                long drugStartMs = (long) HljldUtils.databaseTimeValue(str(execution, "startTime"));
                if (drugStartMs >= startMs && drugStartMs < effectiveEndMs) {
                    amt = liquidAmount > 0 ? liquidAmount : dose;
                    log.info("[hljld] 单次给药计入入量: name={}, amt={}", name, amt);
                } else {
                    amt = 0;
                    log.info("[hljld] 单次给药跳过（不在统计区间内）: name={}, drugStartMs={}", name, new Date(drugStartMs));
                }
            } else {
                // 持续泵注：使用精确的 action-driven 计算
                HljldUtils.DrugActualAmount result = HljldUtils.calcContinuousDrugAmountMs(
                    execution, startMs, endMs, true);
                amt = result.inRange;
                log.info("[hljld] 持续泵注计算结果: name={}, inRange={}", name, amt);
            }

            if (amt > 0) {
                medicationAmounts.merge(name, amt, Double::sum);
                log.info("[hljld] 药物计入入量: name={}, amt={}, 累计={}", name, amt, medicationAmounts.get(name));

                // 统计各途径的量（ivgtt、iv泵、iv）
                String route = HljldUtils.routeLabel(methodName);
                if ("ivgtt".equals(route)) {
                    ivgttTotal += amt;
                } else if ("iv泵".equals(route)) {
                    ivPumpTotal += amt;
                } else if ("iv".equals(route)) {
                    ivTotal += amt;
                }
            } else {
                log.info("[hljld] 药物未计入入量（amt=0）: name={}", name);
            }
        }

        log.info("[hljld] 静脉入量计算完成，共 {} 项药物，总量: {} ml", medicationAmounts.size(),
            medicationAmounts.values().stream().mapToDouble(Double::doubleValue).sum());

        // 入量：肠内营养
        log.info("[hljld] 开始计算肠内营养");
        Map<String, Double> enteralAmounts = new LinkedHashMap<>();
        for (Document execution : drugsInPeriod) {
            String methodCode = str(execution, "methodCode");
            Document method = HljldUtils.findDrugMethod(methodCode, source.getDrugMethods());
            String drugName = HljldUtils.drugDisplayName(execution);

            if (method == null) {
                log.info("[hljld] 肠内营养方法未找到: name={}, methodCode={}", drugName, methodCode);
                continue;
            }

            String inChannel = str(method, "inChannel");
            // 使用 inChannel 判断是否为胃肠入量（与前端逻辑一致）
            if (!"胃肠".equals(inChannel)) {
                log.info("[hljld] 药物跳过（非胃肠通道）: name={}, inChannel={}", drugName, inChannel);
                continue;
            }

            if (!HljldUtils.isTargetEnteral(drugName)) {
                log.info("[hljld] 药物跳过（非目标肠内营养）: name={}", drugName);
                continue;
            }

            String displayName = HljldUtils.enteralDisplayName(drugName);
            List<Map<String, Object>> actionList = getList(execution, "drugActionList");

            if (actionList == null || actionList.isEmpty()) {
                double dose = HljldUtils.parseAmount(execution.get("dose"));
                enteralAmounts.merge(displayName, dose, Double::sum);
                log.info("[hljld] 肠内营养计入（无actionList）: name={}, dose={}", displayName, dose);
            } else {
                double totalQuickAdd = 0;
                for (Map<String, Object> action : actionList) {
                    String act = str(action, "action").trim().toLowerCase();
                    if ("quickadd".equals(act)) {
                        double quickAddAmount = HljldUtils.parseAmount(action.get("quickAddAmount"));
                        totalQuickAdd += quickAddAmount;
                        log.info("[hljld] 肠内营养quickAdd: name={}, quickAddAmount={}", displayName, quickAddAmount);
                    }
                }
                if (totalQuickAdd > 0) {
                    enteralAmounts.merge(displayName, totalQuickAdd, Double::sum);
                    log.info("[hljld] 肠内营养计入（有actionList）: name={}, totalQuickAdd={}", displayName, totalQuickAdd);
                }
            }
        }

        log.info("[hljld] 肠内营养计算完成，共 {} 项，总量: {} ml", enteralAmounts.size(),
            enteralAmounts.values().stream().mapToDouble(Double::doubleValue).sum());

        // 出量
        log.info("[hljld] 开始计算出量，bedsideInPeriod记录数: {}", bedsideInPeriod.size());

        // 尿量和净超滤量必须直接按编码统计，不能先经过不包含这两个编码的OUTPUT_CODE_NAMES
        double urineTotal = sumBedsideByCode(bedsideInPeriod, HljldUtils.URINE_CODE);
        double ultrafiltrationTotal = sumBedsideByCode(bedsideInPeriod, HljldUtils.ULTRAFILTRATION_CODE);

        log.info("[hljld] 尿量: {} ml, 净超滤量: {} ml", urineTotal, ultrafiltrationTotal);

        // 其他出量（不含尿量和净超滤量）
        List<NameAmount> outAll = bedsideInPeriod.stream()
            .filter(item -> HljldUtils.OUTPUT_CODE_NAMES.containsKey(str(item, "code")))
            .filter(item -> !HljldUtils.URINE_CODE.equals(str(item, "code")) && !HljldUtils.ULTRAFILTRATION_CODE.equals(str(item, "code")))
            .map(item -> new NameAmount(
                HljldUtils.OUTPUT_CODE_NAMES.get(str(item, "code")),
                HljldUtils.displayAmount(item.get("strVal")),
                HljldUtils.parseAmount(item.get("strVal"))))
            .filter(NameAmount::hasAmountValue)
            .collect(Collectors.toList());

        Map<String, Double> urineMap = new LinkedHashMap<>();
        urineMap.put("尿量", urineTotal);

        Map<String, Double> ultrafiltrationMap = new LinkedHashMap<>();
        ultrafiltrationMap.put("净超滤量", ultrafiltrationTotal);

        List<NameAmount> otherOutAll = outAll;

        log.info("[hljld] 其他出量项目数: {}", otherOutAll.size());

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

        log.info("[hljld] 引流液项目数: {}", drainMap.size());

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
        summary.setAvailable(true);  // 标记小结可用
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
        double totalDrain = drainMap.values().stream().mapToDouble(Double::doubleValue).sum();
        double totalOtherOutput = otherOutAll.stream().mapToDouble(NameAmount::getNumericAmount).sum();
        double totalOutput = totalUrine + totalUltrafiltration + totalDrain + totalOtherOutput;

        log.info("[hljld] ========== 出入量汇总 ==========");
        log.info("[hljld] 入量明细:");
        log.info("[hljld]   药物治疗（静脉入量）: {} ml, 项目数: {}", totalMedication, medicationAmounts.size());
        medicationAmounts.forEach((name, amount) -> log.info("[hljld]     - {}: {} ml", name, amount));
        log.info("[hljld]   胃肠入量（肠内营养）: {} ml, 项目数: {}", totalEnteral, enteralAmounts.size());
        enteralAmounts.forEach((name, amount) -> log.info("[hljld]     - {}: {} ml", name, amount));
        log.info("[hljld]   总入量: {} ml", totalMedication + totalEnteral);

        log.info("[hljld] 出量明细:");
        log.info("[hljld]   尿量: {} ml", totalUrine);
        log.info("[hljld]   净超滤量: {} ml", totalUltrafiltration);
        log.info("[hljld]   引流液: {} ml", totalDrain);
        log.info("[hljld]   其他出量: {} ml", totalOtherOutput);
        log.info("[hljld]   总出量: {} ml", totalOutput);

        log.info("[hljld] 平衡量: {} ml (总入量 - 总出量)", totalMedication + totalEnteral - totalOutput);
        log.info("[hljld] ======================================");

        summary.setMedicationSum(HljldUtils.round1(totalMedication));
        summary.setEnteralSum(HljldUtils.round1(totalEnteral));
        summary.setInputSum(HljldUtils.round1(totalMedication + totalEnteral));
        summary.setUrineSum(HljldUtils.round1(totalUrine));
        summary.setUltrafiltrationSum(HljldUtils.round1(totalUltrafiltration));
        summary.setOutputSum(HljldUtils.round1(totalOutput));

        // 赋值前端对应字段
        // 药物治疗总量 = 静脉入量（medicationSum）
        summary.setDrugTreatmentTotal(HljldUtils.round1(totalMedication));
        // 胃肠入量总量 = 胃肠入量（enteralSum）
        summary.setGastrointestinalInputTotal(HljldUtils.round1(totalEnteral));
        // 总入量 = 药物治疗 + 胃肠入量
        summary.setTotalInput(HljldUtils.round1(totalMedication + totalEnteral));
        // 平衡量
        summary.setBalance(HljldUtils.round1(totalMedication + totalEnteral - totalOutput));

        // 详细项目
        List<SummaryItem> medicationItems = new ArrayList<>();
        medicationAmounts.forEach((name, amount) ->
            medicationItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setMedicationItems(medicationItems);

        List<SummaryItem> enteralItems = new ArrayList<>();
        enteralAmounts.forEach((name, amount) ->
            enteralItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setEnteralItems(enteralItems);

        // 静脉入量细分（ivgtt、iv泵、iv）
        List<SummaryItem> veinItems = new ArrayList<>();
        if (ivgttTotal > 0) {
            veinItems.add(new SummaryItem("ivgtt", "ivgtt", HljldUtils.round1(ivgttTotal)));
        }
        if (ivPumpTotal > 0) {
            veinItems.add(new SummaryItem("iv泵", "iv泵", HljldUtils.round1(ivPumpTotal)));
        }
        if (ivTotal > 0) {
            veinItems.add(new SummaryItem("iv", "iv", HljldUtils.round1(ivTotal)));
        }
        summary.setVeinItems(veinItems);

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

    /**
     * 按编码统计bedside记录的量
     */
    private double sumBedsideByCode(List<Document> records, String code) {
        return HljldUtils.round1(
            records.stream()
                .filter(item -> code.equals(str(item, "code")))
                .mapToDouble(item -> HljldUtils.parseAmount(item.get("strVal")))
                .sum()
        );
    }

    /**
     * 构建时间轴（使用 HljldPdfRequestContext 控制门禁）
     * 对应前端 buildTimeline
     */
    public List<HljldTimelineItem> buildTimeline(
        HljldPdfRequestContext context,
        List<HljldTimeGroup> displayGroups,
        List<HljldTimeGroup> continuationGroups,
        HljldSummary daySummary,
        HljldSummary fullDaySummary
    ) {
        List<HljldTimelineItem> timeline = new ArrayList<>();

        long referenceTime = context.getReferenceTimeMs();
        long daySummaryTime = context.getDaySummaryTimeMs();
        long nursingDayEnd = context.getNursingDayEndMs();

        // 当日07:00续用行
        if (continuationGroups != null) {
            for (HljldTimeGroup group : continuationGroups) {
                timeline.add(
                    createTimelineItem(
                        HljldTimelineItem.Kind.CONTINUATION,
                        "continuation-" + group.getKey(),
                        context.getNursingDayStartMs(),
                        group,
                        null
                    )
                );
            }
        }

        // 普通记录
        for (HljldTimeGroup group : displayGroups) {
            if (group.getTimestamp() > referenceTime ||
                group.getTimestamp() >= nursingDayEnd) {
                continue;
            }
            timeline.add(
                createTimelineItem(
                    HljldTimelineItem.Kind.TIME_GROUP,
                    group.getKey(),
                    group.getTimestamp(),
                    group,
                    null
                )
            );
        }

        // 日间小结
        if (context.shouldShowDaySummary() &&
            daySummary != null &&
            daySummary.isAvailable()) {
            daySummary.setTime(new Date(daySummaryTime));
            timeline.add(
                createTimelineItem(
                    HljldTimelineItem.Kind.DAY_SUMMARY,
                    "day-summary",
                    daySummaryTime,
                    null,
                    daySummary
                )
            );

            // 结算行只能在小结存在时生成
            HljldTimeGroup settlement = buildSettlementGroup(daySummary, daySummaryTime);
            if (settlement != null) {
                timeline.add(
                    createTimelineItem(
                        HljldTimelineItem.Kind.DAY_SETTLEMENT,
                        "day-settlement",
                        daySummaryTime,
                        settlement,
                        null
                    )
                );
            }
        }

        // 次日07:00总结
        if (context.shouldShowFullDaySummary() &&
            fullDaySummary != null &&
            fullDaySummary.isAvailable()) {
            fullDaySummary.setTime(new Date(nursingDayEnd));
            timeline.add(
                createTimelineItem(
                    HljldTimelineItem.Kind.FULL_DAY_SUMMARY,
                    "full-day-summary",
                    nursingDayEnd,
                    null,
                    fullDaySummary
                )
            );
        }

        // 按时间戳、排序等级、key排序
        timeline.sort(
            Comparator.comparingLong(HljldTimelineItem::getTimestamp)
                .thenComparingInt(HljldTimelineItem::getSortRank)
                .thenComparing(HljldTimelineItem::getKey)
        );

        // 打印排序后的 timeline
        java.text.SimpleDateFormat logTf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        logTf.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
        log.info("[HLJLD-TL] ===== buildTimeline 排序后共 {} 条 =====", timeline.size());
        for (int i = 0; i < timeline.size(); i++) {
            HljldTimelineItem t = timeline.get(i);
            int rows = (t.getGroup() != null) ? t.getGroup().getRows().size() : 0;
            log.info("[HLJLD-TL] timeline[{}] kind={}, time={}, key={}, rows={}, sortRank={}",
                i, t.getKind(), logTf.format(new Date(t.getTimestamp())), t.getKey(), rows, t.getSortRank());
        }

        return timeline;
    }

    private HljldTimelineItem createTimelineItem(
        HljldTimelineItem.Kind kind,
        String key,
        long timestamp,
        HljldTimeGroup group,
        HljldSummary summary
    ) {
        HljldTimelineItem item = new HljldTimelineItem();
        item.setKind(kind);
        item.setKey(key);
        item.setTimestamp(timestamp);
        item.setGroup(group);
        item.setSummary(summary);
        return item;
    }

    private HljldTimeGroup buildSettlementGroup(HljldSummary summary, long timestamp) {
        // 构建结算行（根据小结数据生成）
        if (summary == null || !summary.isAvailable()) {
            return null;
        }
        // 简化实现：返回一个包含结算信息的TimeGroup
        HljldTimeGroup group = new HljldTimeGroup();
        group.setKey("settlement-" + timestamp);
        group.setTimestamp(timestamp);
        return group;
    }
}
