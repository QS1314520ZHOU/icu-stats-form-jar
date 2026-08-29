package com.smartcare.backend.hljld;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

        // 记录小结类型和时间范围（便于排查）
        log.info("[hljld] 构建小结: kind={}, startMs={}, endMs={}, effectiveEndMs={}, dayEndMs={}",
            kind, new Date(startMs), new Date(endMs), new Date(effectiveEndMs), new Date(dayEndMs));

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
                long t = (long) HljldUtils.toTimestampMs(item.get("startTime"));
                return t >= startMs && t < effectiveEndMs;
            })
            .collect(Collectors.toList());

        // 续用药物：startTime 在护理日之前，但 endTime 在护理日之内或之后（仍在执行的持续泵注）
        List<Document> carryOverDrugs = source.getDrugExecutions().stream()
            .filter(HljldUtils::isRenderableDrugExecution)
            .filter(item -> {
                long t = (long) HljldUtils.toTimestampMs(item.get("startTime"));
                return t < startMs; // startTime 在护理日之前
            })
            .filter(item -> {
                Document method = HljldUtils.findDrugMethod(str(item, "methodCode"), source.getDrugMethods());
                return method != null && Boolean.FALSE.equals(method.get("isOnce")); // 仅持续泵注
            })
            .filter(item -> {
                // endTime 在护理日之内或之后（或未结束）
                double endRaw = HljldUtils.toTimestampMs(item.get("endTime"));
                if (!Double.isFinite(endRaw)) return true; // 未结束
                // endTime 必须在统计开始时间之后，且在统计结束时间之前（确保在统计范围内）
                return endRaw > startMs && endRaw <= effectiveEndMs;
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

        // 带入药量（bedside 记录，code = param_带入药量）
        double broughtMedication = sumBedsideByCode(bedsideInPeriod, "param_带入药量");
        if (broughtMedication > 0) {
            log.info("[hljld] 入量-带入药量={} ml", HljldUtils.round1(broughtMedication));
        }

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
            double liquidAmount = HljldUtils.parseAmount(execution.get("liquidAmount"));
            double dose = HljldUtils.parseAmount(execution.get("dose"));

            if (method == null) {
                log.warn("[hljld] 药物方法未找到: name={}, methodCode={}", drugName, methodCode);
                continue;
            }

            String inChannel = str(method, "inChannel");
            String methodName = str(method, "name");

            // 药物治疗只统计静脉/输血，胃肠入量在下面单独统计
            if (!"静脉".equals(inChannel) && !"输血".equals(inChannel)) {
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
                long drugStartMs = (long) HljldUtils.toTimestampMs(execution.get("startTime"));
                if (drugStartMs >= startMs && drugStartMs < effectiveEndMs) {
                    amt = liquidAmount > 0 ? liquidAmount : dose;
                } else {
                    amt = 0;
                }
            } else {
                // 持续泵注：使用差值法（与结算行一致），确保总结 = 日间小结 + 夜班小结
                // 注意：使用 effectiveEndMs 而不是 endMs，确保日间小结只统计到17:00
                amt = HljldUtils.calcSegmentUsage(execution,
                    new Date(startMs), new Date(effectiveEndMs));
                log.debug("[hljld] 持续药物计算: name={}, startMs={}, effectiveEndMs={}, amt={} ml",
                    name, new Date(startMs), new Date(effectiveEndMs), amt);
            }

            if (amt > 0) {
                // 每组药物计算完后四舍五入，再累加到总入量
                double roundedAmt = HljldUtils.round1(amt);
                medicationAmounts.merge(name, roundedAmt, Double::sum);
                log.info("[hljld] 入量-药物: name={}, methodCode={}, inChannel={}, route={}, amt={} ml (rounded={})",
                    name, methodCode, inChannel, HljldUtils.routeLabel(methodName), amt, roundedAmt);

                // 统计各途径的量（ivgtt、iv泵、iv）
                String route = HljldUtils.routeLabel(methodName);
                if ("ivgtt".equals(route)) {
                    ivgttTotal += roundedAmt;
                } else if ("iv泵".equals(route)) {
                    ivPumpTotal += roundedAmt;
                } else if ("iv".equals(route)) {
                    ivTotal += roundedAmt;
                }
            }
        }

        // ═══ 续用药物统计（startTime 在护理日之前，但护理日内仍在执行的持续泵注） ═══
        for (Document execution : carryOverDrugs) {
            String methodCode = str(execution, "methodCode");
            Document method = HljldUtils.findDrugMethod(methodCode, source.getDrugMethods());
            String drugName = HljldUtils.drugDisplayName(execution);

            if (method == null) continue;

            String inChannel = str(method, "inChannel");
            String methodName = str(method, "name");

            // 仅统计静脉/输血类续用药物
            if (!"静脉".equals(inChannel) && !"输血".equals(inChannel)) {
                continue;
            }

            String name = HljldUtils.drugDisplayName(execution);
            if (name.isEmpty()) continue;

            // 续用药物在当前护理日内的用量：使用差值法
            // 注意：使用 effectiveEndMs 而不是 endMs，确保日间小结只统计到17:00
            double amt = HljldUtils.calcSegmentUsage(execution,
                new Date(startMs), new Date(effectiveEndMs));
            log.debug("[hljld] 续用药物计算: name={}, startMs={}, effectiveEndMs={}, amt={} ml",
                name, new Date(startMs), new Date(effectiveEndMs), amt);

            if (amt > 0) {
                // 每组药物计算完后四舍五入，再累加到总入量
                double roundedAmt = HljldUtils.round1(amt);
                medicationAmounts.merge(name, roundedAmt, Double::sum);
                log.info("[hljld] 入量-续用药物: name={}, methodCode={}, inChannel={}, route={}, amt={} ml (startTime在护理日前, rounded={})",
                    name, methodCode, inChannel, HljldUtils.routeLabel(methodName), amt, roundedAmt);

                String route = HljldUtils.routeLabel(methodName);
                if ("ivgtt".equals(route)) {
                    ivgttTotal += roundedAmt;
                } else if ("iv泵".equals(route)) {
                    ivPumpTotal += roundedAmt;
                } else if ("iv".equals(route)) {
                    ivTotal += roundedAmt;
                }
            } else {
                log.info("[hljld] 入量-续用药物跳过: name={}, methodCode={}, amt=0 (护理日内无用量)",
                    name, methodCode);
            }
        }

        // 入量：肠内营养（药物执行 + bedside 口服/鼻饲）
        Map<String, Double> enteralAmounts = new LinkedHashMap<>();
        for (Document execution : drugsInPeriod) {
            String methodCode = str(execution, "methodCode");
            Document method = HljldUtils.findDrugMethod(methodCode, source.getDrugMethods());
            String drugName = HljldUtils.drugDisplayName(execution);

            if (method == null) {
                log.info("[hljld] 入量-肠内跳过: name={}, methodCode={}, 原因=方法未找到", drugName, methodCode);
                continue;
            }

            String inChannel = str(method, "inChannel");
            if (!"胃肠".equals(inChannel)) {
                continue;
            }

            String displayName = HljldUtils.enteralDisplayName(drugName);
            List<Map<String, Object>> actionList = getList(execution, "drugActionList");

            // 判断是否为单次给药（与药物循环一致，从 method 读取）
            Boolean isOnce = method.getBoolean("isOnce");
            boolean once = isOnce == null || isOnce;

            double amt = 0;
            if (once) {
                // 单次给药：优先取 quickadd，否则用 liquidAmount
                double totalQuickAdd = 0;
                if (actionList != null) {
                    for (Map<String, Object> action : actionList) {
                        String act = str(action, "action").trim().toLowerCase();
                        if ("quickadd".equals(act)) {
                            totalQuickAdd += HljldUtils.parseAmount(action.get("quickAddAmount"));
                        }
                    }
                }
                if (totalQuickAdd > 0) {
                    amt = totalQuickAdd;
                } else {
                    amt = HljldUtils.parseAmount(execution.get("liquidAmount"));
                    if (amt <= 0) {
                        amt = HljldUtils.parseAmount(execution.get("dose"));
                    }
                }
            } else {
                // 持续泵注：使用差值法计算实际用量（与ivgtt药物一致）
                amt = HljldUtils.calcSegmentUsage(execution,
                    new Date(startMs), new Date(effectiveEndMs));
                log.debug("[hljld] 肠内持续药物计算: name={}, methodCode={}, startMs={}, effectiveEndMs={}, amt={} ml",
                    drugName, methodCode, new Date(startMs), new Date(effectiveEndMs), amt);
            }
            if (amt > 0) {
                // 每组药物计算完后四舍五入，再累加到总入量
                double roundedAmt = HljldUtils.round1(amt);
                enteralAmounts.merge(displayName, roundedAmt, Double::sum);
                log.info("[hljld] 入量-肠内: name={}, methodCode={}, amt={} ml (rounded={})", displayName, methodCode, amt, roundedAmt);
            } else {
                log.info("[hljld] 入量-肠内跳过: name={}, methodCode={}, isOnce={}, actionList={}, liquidAmount={}, dose={}",
                    drugName, methodCode, method.getBoolean("isOnce"),
                    execution.get("drugActionList") != null ? execution.get("drugActionList").toString().substring(0, Math.min(80, execution.get("drugActionList").toString().length())) : "null",
                    execution.get("liquidAmount"), execution.get("dose"));
            }
        }

        // ═══ 续用肠内营养药物统计 ═══
        for (Document execution : carryOverDrugs) {
            String methodCode = str(execution, "methodCode");
            Document method = HljldUtils.findDrugMethod(methodCode, source.getDrugMethods());
            if (method == null) continue;

            String inChannel = str(method, "inChannel");
            if (!"胃肠".equals(inChannel)) continue;

            String drugName = HljldUtils.drugDisplayName(execution);
            String displayName = HljldUtils.enteralDisplayName(drugName);

            // 判断是否为单次给药
            Boolean isOnce = method.getBoolean("isOnce");
            boolean once = isOnce == null || isOnce;

            double amt = 0;
            if (once) {
                // 单次给药：优先取当前护理日内的 quickAdd 量
                List<Map<String, Object>> actionList = getList(execution, "drugActionList");
                if (actionList != null) {
                    for (Map<String, Object> action : actionList) {
                        String act = str(action, "action").trim().toLowerCase();
                        if ("quickadd".equals(act)) {
                            long actionTime = (long) HljldUtils.databaseTimeValue(str(action, "time"));
                            if (actionTime >= startMs && actionTime < effectiveEndMs) {
                                amt += HljldUtils.parseAmount(action.get("quickAddAmount"));
                            }
                        }
                    }
                }
                // 无 quickAdd 则用 liquidAmount
                if (amt <= 0) {
                    amt = HljldUtils.parseAmount(execution.get("liquidAmount"));
                    if (amt <= 0) amt = HljldUtils.parseAmount(execution.get("dose"));
                }
            } else {
                // 持续泵注：使用差值法计算实际用量（与ivgtt药物一致）
                amt = HljldUtils.calcSegmentUsage(execution,
                    new Date(startMs), new Date(effectiveEndMs));
                log.debug("[hljld] 续用肠内持续药物计算: name={}, methodCode={}, startMs={}, effectiveEndMs={}, amt={} ml",
                    drugName, methodCode, new Date(startMs), new Date(effectiveEndMs), amt);
            }
            if (amt > 0) {
                // 每组药物计算完后四舍五入，再累加到总入量
                double roundedAmt = HljldUtils.round1(amt);
                enteralAmounts.merge(displayName, roundedAmt, Double::sum);
                log.info("[hljld] 入量-续用肠内: name={}, methodCode={}, amt={} ml (startTime在护理日前, rounded={})",
                    displayName, methodCode, amt, roundedAmt);
            }
        }

        // 肠内营养：bedside 口服量和鼻饲量单独统计（不合并到肠内药物）
        double oralTotal = sumBedsideByCode(bedsideInPeriod, "param_kouFu");
        double tubeFeedingManual = sumBedsideByCode(bedsideInPeriod, "param_biSi");
        if (oralTotal > 0) {
            log.info("[hljld] 入量-bedside口服: {} ml", HljldUtils.round1(oralTotal));
        }
        if (tubeFeedingManual > 0) {
            log.info("[hljld] 入量-bedside鼻饲: {} ml", HljldUtils.round1(tubeFeedingManual));
        }

        // 出量

        // 尿量和净超滤量必须直接按编码统计，不能先经过不包含这两个编码的OUTPUT_CODE_NAMES
        double urineTotal = sumBedsideByCode(bedsideInPeriod, HljldUtils.URINE_CODE);
        double ultrafiltrationTotal = sumBedsideByCode(bedsideInPeriod, HljldUtils.ULTRAFILTRATION_CODE);

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

        // 药物治疗 = 静脉/输血药物 + 带入药量
        double drugTreatment = broughtMedication + totalMedication;
        // 胃肠摄入 = 胃肠药物 + 口服量 + 鼻饲量
        double gastrointestinalInput = totalEnteral + oralTotal + tubeFeedingManual;
        // 总入量 = 药物治疗 + 胃肠摄入
        double totalInput = drugTreatment + gastrointestinalInput;

        log.info("[hljld] 出入量汇总: 总入量={} ml (药物治疗={}, 带入药量={}, 静脉/输血={}, 胃肠摄入={} (药物={}, 口服={}, 鼻饲={})), 总出量={} ml (尿={}, 超滤={}, 引流={}, 其他={}), 平衡={} ml",
            HljldUtils.round1(totalInput), HljldUtils.round1(drugTreatment), HljldUtils.round1(broughtMedication), HljldUtils.round1(totalMedication), HljldUtils.round1(gastrointestinalInput),
            HljldUtils.round1(totalEnteral), HljldUtils.round1(oralTotal), HljldUtils.round1(tubeFeedingManual),
            HljldUtils.round1(totalOutput), HljldUtils.round1(totalUrine), HljldUtils.round1(totalUltrafiltration), HljldUtils.round1(totalDrain), HljldUtils.round1(totalOtherOutput),
            HljldUtils.round1(totalInput - totalOutput));

        // 详细药物明细日志（便于排查出入量）
        log.info("[hljld] 静脉药物明细: drugsInPeriod={}, carryOverDrugs={}", drugsInPeriod.size(), carryOverDrugs.size());
        for (Map.Entry<String, Double> entry : medicationAmounts.entrySet()) {
            log.info("[hljld]   静脉药物: {} = {} ml", entry.getKey(), HljldUtils.round1(entry.getValue()));
        }
        for (Map.Entry<String, Double> entry : enteralAmounts.entrySet()) {
            log.info("[hljld]   肠内药物: {} = {} ml", entry.getKey(), HljldUtils.round1(entry.getValue()));
        }
        // ivgtt和iv泵详细汇总
        log.info("[hljld] 静脉入量细分: ivgtt={} ml, iv泵={} ml, iv={} ml, 带入药量={} ml",
            HljldUtils.round1(ivgttTotal), HljldUtils.round1(ivPumpTotal), HljldUtils.round1(ivTotal), HljldUtils.round1(broughtMedication));

        summary.setMedicationSum(HljldUtils.round1(drugTreatment));
        summary.setEnteralSum(HljldUtils.round1(gastrointestinalInput));
        summary.setInputSum(HljldUtils.round1(totalInput));
        summary.setUrineSum(HljldUtils.round1(totalUrine));
        summary.setUltrafiltrationSum(HljldUtils.round1(totalUltrafiltration));
        summary.setOutputSum(HljldUtils.round1(totalOutput));

        // 赋值前端对应字段
        // 药物治疗总量 = 带入药量 + 静脉/输血药物
        summary.setDrugTreatmentTotal(HljldUtils.round1(drugTreatment));
        // 胃肠摄入总量 = 胃肠药物 + 口服量 + 鼻饲量
        summary.setGastrointestinalInputTotal(HljldUtils.round1(gastrointestinalInput));
        // 总入量
        summary.setTotalInput(HljldUtils.round1(totalInput));
        // 平衡量
        summary.setBalance(HljldUtils.round1(totalInput - totalOutput));

        // 详细项目
        List<SummaryItem> medicationItems = new ArrayList<>();
        medicationAmounts.forEach((name, amount) ->
            medicationItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setMedicationItems(medicationItems);

        List<SummaryItem> enteralItems = new ArrayList<>();
        enteralAmounts.forEach((name, amount) ->
            enteralItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
        summary.setEnteralItems(enteralItems);

        // 静脉入量细分（带入药量、ivgtt、iv泵、iv）
        List<SummaryItem> veinItems = new ArrayList<>();
        if (broughtMedication > 0) {
            veinItems.add(new SummaryItem("带入药量", "带入药量", HljldUtils.round1(broughtMedication)));
        }
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

        // 排出物按名称汇总
        Map<String, Double> outputMapAggregated = new LinkedHashMap<>();
        otherOutAll.forEach(na -> outputMapAggregated.merge(na.getName(), na.getNumericAmount(), Double::sum));
        List<SummaryItem> outputItems = new ArrayList<>();
        outputMapAggregated.forEach((name, amount) ->
            outputItems.add(new SummaryItem(name, name, HljldUtils.round1(amount))));
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
                return name + " " + String.format("%.0f", amount) + "ml";
            case "enteral":
                return name + " " + String.format("%.0f", amount) + "ml";
            case "output":
                return name + " " + String.format("%.0f", amount) + "ml";
            case "drain":
                return name + " " + String.format("%.0f", amount) + "ml";
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
                tokens.add(new SummaryTextToken(String.format("%.0f", amount), true, false));
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
