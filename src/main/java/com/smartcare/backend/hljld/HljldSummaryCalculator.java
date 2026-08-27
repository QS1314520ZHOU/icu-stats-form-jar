package com.smartcare.backend.hljld;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 构建小结和时间轴，完全移植前端 buildSummary + buildTimeline。
 *
 * 统计口径与前端 hljld-form.utils.ts 完全一致：
 * - 药物按通道分类：transfusion / vein / gastro / enteral
 * - 尿量和净超滤量直接按编码统计，不从OUTPUT_CODE_NAMES过滤
 * - 引流量纳入总出量
 * - detailLines格式与前端buildInputLine/buildOutputLine一致
 */
@Service
public class HljldSummaryCalculator {

    private static final Logger log = LoggerFactory.getLogger(HljldSummaryCalculator.class);

    /** 参与出入量统计的入量通道 */
    private static final Set<String> COUNTED_IN_CHANNELS = Set.of("胃肠", "静脉", "输血");

    /** 肠内营养名称匹配 */
    private static final java.util.regex.Pattern ENTERAL_NUTRITION_PATTERN =
        java.util.regex.Pattern.compile("肠内营养");

    @SuppressWarnings("unchecked")
    public HljldSummary buildSummary(HljldSummary.Kind kind, HljldSourceData source,
                                      Date nursingDayStart, Date nursingDayEnd,
                                      Date nursingDayStartOfYesterday, long nowMs) {

        // 1. 确定统计区间
        HljldUtils.ActiveStayRange stay = HljldUtils.resolveActiveStayRange(
            source.getPatient(), nursingDayStart, nursingDayEnd, true);
        Date actualStart = stay.effectiveStart;
        Date actualEnd = stay.effectiveEnd;
        long startTs = actualStart.getTime();
        long endTs = actualEnd.getTime();

        // 日间小结在17:00截断
        java.time.ZoneId zone = HljldUtils.ZONE_SHANGHAI;
        java.time.LocalDateTime day1700 = java.time.LocalDateTime.ofInstant(
            nursingDayStart.toInstant(), zone).withHour(17).withMinute(0);
        long dayBoundaryMs = day1700.atZone(zone).toInstant().toEpochMilli();

        final long effectiveEndMs = (kind == HljldSummary.Kind.DAY) ? dayBoundaryMs : endTs;
        final long effectiveNow = nowMs < effectiveEndMs ? nowMs : effectiveEndMs;

        // 2. 筛选区间内数据
        List<Document> bedsideInPeriod = source.getBedside().stream()
            .filter(HljldUtils::isValidBusinessRecord)
            .filter(item -> {
                long t = (long) HljldUtils.databaseTimeValue(HljldUtils.str(item, "time"));
                return t >= startTs && t < effectiveEndMs;
            })
            .collect(Collectors.toList());

        List<Document> drugsInPeriod = source.getDrugExecutions().stream()
            .filter(HljldUtils::isRenderableDrugExecution)
            .filter(item -> {
                long t = (long) HljldUtils.databaseTimeValue(HljldUtils.str(item, "startTime"));
                return t >= startTs && t < effectiveEndMs;
            })
            .collect(Collectors.toList());

        // 3. 生成小结标题
        String defaultLabel;
        switch (kind) {
            case DAY: defaultLabel = "日间小结"; break;
            case SHIFT: defaultLabel = "班段小结"; break;
            case FULL_DAY: defaultLabel = "24小时总结"; break;
            case DISCHARGE: defaultLabel = "出科总结"; break;
            default: defaultLabel = "小结"; break;
        }
        String kindKey;
        switch (kind) {
            case SHIFT: kindKey = "shift"; break;
            case FULL_DAY: kindKey = "24h"; break;
            case DISCHARGE: kindKey = "discharge"; break;
            default: kindKey = "day"; break;
        }
        String summaryLabel = HljldUtils.buildSummaryLabel(
            defaultLabel, kindKey, actualStart, actualEnd,
            stay.admissionClipped, stay.dischargeClipped);

        // 4. 药物按通道聚合
        DrugChannelTotals drugTotals = sumDrugAmountsByChannel(
            source, drugsInPeriod, actualStart, effectiveNow, effectiveEndMs, stay.startExclusive);

        // 5. 手工录入项
        double broughtTotal = sumBedsideByCode(bedsideInPeriod, HljldUtils.CODE_BROUGHT);
        double oralManual = sumBedsideByCode(bedsideInPeriod, HljldUtils.CODE_ORAL);
        double tubeFeedingManual = sumBedsideByCode(bedsideInPeriod, HljldUtils.CODE_TUBE_FEEDING);

        // 6. 入量计算（与前端完全一致）
        // 静脉入量 = 输血 + 各静脉途径实算量
        List<SummaryItem> intravenousChildren = new ArrayList<>();
        intravenousChildren.add(new SummaryItem("transfusion", "输血入量", HljldUtils.round1(drugTotals.transfusion)));
        for (Map.Entry<String, Double> entry : drugTotals.vein.entrySet()) {
            intravenousChildren.add(new SummaryItem("vein-" + entry.getKey(), entry.getKey(), HljldUtils.round1(entry.getValue())));
        }
        double intravenousTotal = HljldUtils.round1(
            intravenousChildren.stream().mapToDouble(SummaryItem::getAmount).sum());

        // 药物治疗 = 带入药量 + 静脉入量
        List<SummaryItem> drugTreatmentItems = new ArrayList<>();
        drugTreatmentItems.add(new SummaryItem("brought-medication", "带入药量", HljldUtils.round1(broughtTotal)));
        drugTreatmentItems.add(new SummaryItem("intravenous", "静脉入量", intravenousTotal, intravenousChildren));
        double drugTreatmentTotal = HljldUtils.round1(broughtTotal + intravenousTotal);

        // 鼻饲量 = 手工鼻饲 + 肠内营养泵入
        List<SummaryItem> tubeFeedingChildren = new ArrayList<>();
        tubeFeedingChildren.add(new SummaryItem("tube-feeding-manual", "鼻饲", HljldUtils.round1(tubeFeedingManual)));
        tubeFeedingChildren.add(new SummaryItem("tube-feeding-enteral", "鼻饲泵入", HljldUtils.round1(drugTotals.enteral)));
        double tubeFeedingTotal = HljldUtils.round1(tubeFeedingManual + drugTotals.enteral);

        // 胃肠入量 = 口服（手工 + po执行）+ 其他胃肠途径
        double gastroPo = oralManual + drugTotals.gastro.getOrDefault("po", 0D);
        List<SummaryItem> gastroChildren = new ArrayList<>();
        gastroChildren.add(new SummaryItem("gastro-po", "po", HljldUtils.round1(gastroPo)));
        for (Map.Entry<String, Double> entry : drugTotals.gastro.entrySet()) {
            if (!"po".equals(entry.getKey())) {
                gastroChildren.add(new SummaryItem("gastro-" + entry.getKey(), entry.getKey(), HljldUtils.round1(entry.getValue())));
            }
        }
        double gastroTotal = HljldUtils.round1(
            gastroChildren.stream().mapToDouble(SummaryItem::getAmount).sum());

        // 胃肠摄入 = 鼻饲量 + 胃肠入量
        List<SummaryItem> gastrointestinalInputItems = new ArrayList<>();
        gastrointestinalInputItems.add(new SummaryItem("tube-feeding", "鼻饲量", tubeFeedingTotal, tubeFeedingChildren));
        gastrointestinalInputItems.add(new SummaryItem("gastrointestinal", "胃肠入量", gastroTotal, gastroChildren));
        double gastrointestinalInputTotal = HljldUtils.round1(tubeFeedingTotal + gastroTotal);

        // 总入量 = 药物治疗 + 胃肠摄入
        double totalInput = HljldUtils.round1(drugTreatmentTotal + gastrointestinalInputTotal);

        // 7. 出量计算
        // 尿量和净超滤量直接按编码统计（不从OUTPUT_CODE_NAMES过滤）
        double urineTotal = HljldUtils.round1(
            bedsideInPeriod.stream()
                .filter(item -> HljldUtils.URINE_CODE.equals(HljldUtils.str(item, "code")))
                .mapToDouble(item -> HljldUtils.parseAmount(item.get("strVal")))
                .sum());
        double ultrafiltrationTotal = HljldUtils.round1(
            bedsideInPeriod.stream()
                .filter(item -> HljldUtils.ULTRAFILTRATION_CODE.equals(HljldUtils.str(item, "code")))
                .mapToDouble(item -> HljldUtils.parseAmount(item.get("strVal")))
                .sum());

        // 排出物
        List<SummaryItem> outputItems = new ArrayList<>();
        for (Map<String, String> def : HljldUtils.EXCRETION_SUMMARY_DEFINITIONS) {
            String code = def.get("code");
            String label = def.get("label");
            double amount = HljldUtils.round1(
                bedsideInPeriod.stream()
                    .filter(item -> code.equals(HljldUtils.str(item, "code")))
                    .mapToDouble(item -> HljldUtils.parseAmount(item.get("strVal")))
                    .sum());
            outputItems.add(new SummaryItem(def.get("key"), label, amount));
        }
        double excretionTotal = HljldUtils.round1(
            outputItems.stream().mapToDouble(SummaryItem::getAmount).sum());

        // 引流液
        List<SummaryItem> drainItems = new ArrayList<>();
        Map<String, Double> drainMap = new LinkedHashMap<>();
        for (Document item : bedsideInPeriod) {
            String code = HljldUtils.str(item, "code");
            if (!HljldUtils.isDrainCode(code)) continue;
            String name = HljldUtils.drainName(code);
            double amount = HljldUtils.parseAmount(item.get("strVal"));
            drainMap.merge(name, amount, Double::sum);
        }
        drainMap.forEach((name, amount) ->
            drainItems.add(new SummaryItem("drain-" + name, name, HljldUtils.round1(amount))));
        double drainTotal = HljldUtils.round1(
            drainItems.stream().mapToDouble(SummaryItem::getAmount).sum());

        // 总出量 = 尿量 + 净超滤量 + 排出物 + 引流液
        double totalOutput = HljldUtils.round1(urineTotal + ultrafiltrationTotal + excretionTotal + drainTotal);

        // 平衡量 = 总入量 - 总出量
        double balance = HljldUtils.round1(totalInput - totalOutput);

        // 8. 构建 HljldSummary
        HljldSummary summary = new HljldSummary();
        summary.setKind(kind);
        summary.setLabel(summaryLabel);
        summary.setPeriodText(HljldUtils.formatTime(startTs) + "—" + HljldUtils.formatTime(endTs));
        summary.setPlannedStart(nursingDayStart.getTime());
        summary.setPlannedEnd(nursingDayEnd.getTime());
        summary.setPeriodStart(startTs);
        summary.setPeriodEnd(effectiveEndMs);
        summary.setAdmissionClipped(stay.admissionClipped);
        summary.setDischargeClipped(stay.dischargeClipped);
        summary.setAvailable(stay.hasValidRange);
        summary.setTime(resolveSummaryTime(kind, dayBoundaryMs,
            nursingDayEnd.getTime(), effectiveEndMs));

        summary.setTotalInput(totalInput);
        summary.setDrugTreatmentTotal(drugTreatmentTotal);
        summary.setDrugTreatmentItems(drugTreatmentItems);
        summary.setGastrointestinalInputTotal(gastrointestinalInputTotal);
        summary.setGastrointestinalInputItems(gastrointestinalInputItems);

        summary.setTotalOutput(totalOutput);
        summary.setUrineTotal(urineTotal);
        summary.setUltrafiltrationTotal(ultrafiltrationTotal);
        summary.setExcretionTotal(excretionTotal);
        summary.setOutputItems(outputItems);
        summary.setDrainTotal(drainTotal);
        summary.setDrainItems(drainItems);

        summary.setBalance(balance);

        // 9. 构建 detailLines（与前端 buildInputLine / buildOutputLine 一致）
        summary.setDetailLines(Arrays.asList(
            buildInputLine(summary),
            buildOutputLine(summary),
            buildBalanceLine(summary)
        ));

        return summary;
    }

    // ══════════════════════════════════════════════════════════
    //  时间轴构建（完全移植前端 buildTimeline）
    // ══════════════════════════════════════════════════════════

    public List<HljldTimelineItem> buildTimeline(List<HljldTimeGroup> displayGroups,
                                                  HljldSummary daySummary,
                                                  HljldSummary shiftSummary,
                                                  HljldSummary fullDaySummary,
                                                  HljldSummary dischargeSummary,
                                                  long referenceTimeMs) {
        List<HljldTimelineItem> timeline = new ArrayList<>();

        // 计算时间边界 —— 必须根据nursingDate计算，不能根据referenceTime所在日期计算
        java.time.ZoneId zone = HljldUtils.ZONE_SHANGHAI;
        java.time.LocalDateTime nursingDate;
        if (daySummary != null && daySummary.getPlannedStart() > 0) {
            nursingDate = java.time.Instant.ofEpochMilli(daySummary.getPlannedStart()).atZone(zone).toLocalDateTime();
        } else if (shiftSummary != null && shiftSummary.getPlannedStart() > 0) {
            nursingDate = java.time.Instant.ofEpochMilli(shiftSummary.getPlannedStart()).atZone(zone).toLocalDateTime();
        } else if (fullDaySummary != null && fullDaySummary.getPlannedStart() > 0) {
            nursingDate = java.time.Instant.ofEpochMilli(fullDaySummary.getPlannedStart()).atZone(zone).toLocalDateTime();
        } else {
            // 回退：从referenceTime推断护理日
            nursingDate = java.time.Instant.ofEpochMilli(referenceTimeMs).atZone(zone).toLocalDateTime();
        }
        // 使用护理日日期（不含时间部分）计算17:00和次日07:00
        java.time.LocalDate nursingDateOnly = nursingDate.toLocalDate();
        long dayBoundaryMs = nursingDateOnly.atTime(17, 0).atZone(zone).toInstant().toEpochMilli();
        long nextMorningBoundaryMs = nursingDateOnly.plusDays(1).atTime(7, 0).atZone(zone).toInstant().toEpochMilli();

        // 显示条件（与前端完全一致）
        boolean showDaySummary =
            daySummary != null
            && daySummary.isAvailable()
            && daySummary.getPeriodEnd() > daySummary.getPeriodStart()
            && referenceTimeMs >= dayBoundaryMs;

        boolean showShiftSummary =
            shiftSummary != null
            && shiftSummary.isAvailable()
            && shiftSummary.getPeriodEnd() > shiftSummary.getPeriodStart()
            && referenceTimeMs >= nextMorningBoundaryMs;

        boolean showFullDaySummary =
            fullDaySummary != null
            && fullDaySummary.isAvailable()
            && fullDaySummary.getPeriodEnd() > fullDaySummary.getPeriodStart()
            && referenceTimeMs >= nextMorningBoundaryMs;

        // 出科逻辑
        long dischargeMs = (dischargeSummary != null && dischargeSummary.isAvailable())
            ? dischargeSummary.getPeriodEnd() : 0;
        boolean hasDischarge = dischargeMs > 0;
        boolean dischargeBeforeDay = hasDischarge && dischargeMs < dayBoundaryMs;
        boolean dischargeAtDay = hasDischarge && dischargeMs == dayBoundaryMs;
        boolean dischargeBetween = hasDischarge && dischargeMs > dayBoundaryMs && dischargeMs < nextMorningBoundaryMs;
        boolean dischargeAtOrAfterMorning = hasDischarge && dischargeMs >= nextMorningBoundaryMs;

        boolean dayInserted = false;
        boolean dischargeInserted = false;

        // 添加数据组
        List<HljldTimeGroup> sortedGroups = displayGroups.stream()
            .sorted(Comparator.comparingLong(HljldTimeGroup::getTimestamp))
            .collect(Collectors.toList());

        for (HljldTimeGroup group : sortedGroups) {
            if (group.getTimestamp() > referenceTimeMs) continue;
            if (group.getTimestamp() > nextMorningBoundaryMs) continue;

            // 已到17:00但当前组晚于17:00时，先插入日间小结 + 结算行
            if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay
                && group.getTimestamp() > dayBoundaryMs) {
                timeline.add(HljldTimelineItem.ofSummary(daySummary));
                dayInserted = true;
                // 日间小结后插入结算行
                timeline.add(HljldTimelineItem.ofSettlement(
                    "day-settlement-" + dayBoundaryMs, dayBoundaryMs, daySummary));
            }

            // 出科时间在明细之间
            if (hasDischarge && !dischargeInserted && dischargeBetween
                && group.getTimestamp() >= dischargeMs
                && !dischargeBeforeDay && !dischargeAtDay) {
                if (showDaySummary && !dayInserted) {
                    timeline.add(HljldTimelineItem.ofSummary(daySummary));
                    dayInserted = true;
                }
                HljldTimelineItem dischargeItem = HljldTimelineItem.ofSummary(dischargeSummary);
                dischargeItem.setTimestamp(dischargeMs);
                timeline.add(dischargeItem);
                dischargeInserted = true;
            }

            timeline.add(HljldTimelineItem.ofGroup(group));

            // 正好17:00：先展示组，再展示日间小结 + 结算行
            if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay
                && group.getTimestamp() == dayBoundaryMs) {
                timeline.add(HljldTimelineItem.ofSummary(daySummary));
                dayInserted = true;
                // 日间小结后插入结算行
                timeline.add(HljldTimelineItem.ofSettlement(
                    "day-settlement-" + dayBoundaryMs, dayBoundaryMs, daySummary));
            }

            // 正好出科时间
            if (hasDischarge && !dischargeInserted && group.getTimestamp() == dischargeMs) {
                if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay
                    && dischargeMs > dayBoundaryMs) {
                    timeline.add(HljldTimelineItem.ofSummary(daySummary));
                    dayInserted = true;
                }
                HljldTimelineItem dischargeItem = HljldTimelineItem.ofSummary(dischargeSummary);
                dischargeItem.setTimestamp(dischargeMs);
                timeline.add(dischargeItem);
                dischargeInserted = true;
            }
        }

        // 已到17:00但之后没有明细
        if (showDaySummary && !dayInserted && !dischargeBeforeDay && !dischargeAtDay) {
            timeline.add(HljldTimelineItem.ofSummary(daySummary));
            dayInserted = true;
            // 日间小结后插入结算行
            timeline.add(HljldTimelineItem.ofSettlement(
                "day-settlement-" + dayBoundaryMs, dayBoundaryMs, daySummary));
        }

        // 出科在17:00之前
        if (hasDischarge && !dischargeInserted && dischargeBeforeDay) {
            HljldTimelineItem dischargeItem = HljldTimelineItem.ofSummary(dischargeSummary);
            dischargeItem.setTimestamp(dischargeMs);
            timeline.add(dischargeItem);
            dischargeInserted = true;
        }

        // 出科等于17:00
        if (hasDischarge && !dischargeInserted && dischargeAtDay) {
            HljldTimelineItem dischargeItem = HljldTimelineItem.ofSummary(dischargeSummary);
            dischargeItem.setTimestamp(dischargeMs);
            timeline.add(dischargeItem);
            dischargeInserted = true;
        }

        // 出科在17:00之后、次日07:00之前
        if (hasDischarge && !dischargeInserted && dischargeBetween) {
            if (showDaySummary && !dayInserted) {
                timeline.add(HljldTimelineItem.ofSummary(daySummary));
            }
            HljldTimelineItem dischargeItem = HljldTimelineItem.ofSummary(dischargeSummary);
            dischargeItem.setTimestamp(dischargeMs);
            timeline.add(dischargeItem);
            dischargeInserted = true;
        }

        // 次日07:00：夜班小结 + 24小时总结（出科在次日07:00之后或无出科才显示）
        boolean shouldAppendNextMorning = !hasDischarge || dischargeAtOrAfterMorning;
        if (shouldAppendNextMorning) {
            if (showShiftSummary) {
                HljldTimelineItem shiftItem = HljldTimelineItem.ofSummary(shiftSummary);
                shiftItem.setTimestamp(nextMorningBoundaryMs);
                timeline.add(shiftItem);
            }
            if (showFullDaySummary) {
                HljldTimelineItem fullDayItem = HljldTimelineItem.ofSummary(fullDaySummary);
                fullDayItem.setTimestamp(nextMorningBoundaryMs);
                timeline.add(fullDayItem);
            }
        }

        // 按时间排序，同一时间戳内按sortRank排序：
        // CONTINUATION(0) < TIME_GROUP(10) < DAY_SUMMARY(20) < DAY_SETTLEMENT(30) < FULL_DAY_SUMMARY(40)
        timeline.sort(Comparator.comparingLong(HljldTimelineItem::getTimestamp)
            .thenComparingInt(HljldTimelineItem::getSortRank));

        return timeline;
    }

    // ══════════════════════════════════════════════════════════
    //  药物通道聚合
    // ══════════════════════════════════════════════════════════

    private static class DrugChannelTotals {
        Map<String, Double> vein = new LinkedHashMap<>();
        Map<String, Double> gastro = new LinkedHashMap<>();
        double transfusion = 0;
        double enteral = 0;
    }

    @SuppressWarnings("unchecked")
    private DrugChannelTotals sumDrugAmountsByChannel(
            HljldSourceData source,
            List<Document> drugsInPeriod,
            Date actualStart,
            long effectiveNow,
            long effectiveEndMs,
            boolean startExclusive) {

        DrugChannelTotals totals = new DrugChannelTotals();

        for (Document execution : drugsInPeriod) {
            Document method = HljldUtils.findDrugMethod(
                HljldUtils.str(execution, "methodCode"), source.getDrugMethods());
            if (method == null) continue;

            // inChannel 必须严格等于三种入量通道之一
            String inChannel = HljldUtils.str(method, "inChannel").trim();
            if (!COUNTED_IN_CHANNELS.contains(inChannel)) continue;

            boolean isOnce = Boolean.TRUE.equals(method.get("isOnce"));
            String drugName = HljldUtils.drugDisplayName(execution);
            String route = HljldUtils.routeLabel(HljldUtils.str(method, "name"));

            double amount;
            if (!isOnce) {
                // 持续用药：班段口径用量
                double execStartMs = HljldUtils.databaseTimeValue(HljldUtils.str(execution, "startTime"));
                long effectiveStartMs = startExclusive && Double.isFinite(execStartMs) && execStartMs > actualStart.getTime()
                    ? (long) execStartMs : actualStart.getTime();
                double usageAtEnd = HljldUtils.calcDrugUsageUpTo(execution, effectiveEndMs);
                double usageAtStart = HljldUtils.calcDrugUsageUpTo(execution, effectiveStartMs);
                amount = HljldUtils.round1(Math.max(0, usageAtEnd - usageAtStart));
            } else {
                // 单次给药
                boolean isTargetEnteral = HljldUtils.isTargetEnteral(drugName);
                if (isTargetEnteral) {
                    // 肠内营养单次：计算 quickAdd 量
                    double quickAddTotal = 0;
                    List<Map<String, Object>> actionList = getList(execution, "drugActionList");
                    if (actionList != null) {
                        for (Map<String, Object> action : actionList) {
                            String act = str(action, "action").trim().toLowerCase();
                            if (!"quickadd".equals(act) && !"stop".equals(act)) continue;
                            long actionTime = (long) HljldUtils.databaseTimeValue(str(action, "time"));
                            if (actionTime >= actualStart.getTime() && actionTime < effectiveEndMs) {
                                quickAddTotal += HljldUtils.parseAmount(action.get("quickAddAmount"));
                            }
                        }
                    }
                    amount = HljldUtils.round1(quickAddTotal);
                } else {
                    // 普通单次给药
                    long execTime = (long) HljldUtils.databaseTimeValue(HljldUtils.str(execution, "startTime"));
                    boolean inRange = startExclusive
                        ? (execTime > actualStart.getTime() && execTime < effectiveEndMs)
                        : (execTime >= actualStart.getTime() && execTime < effectiveEndMs);
                    if (!inRange) continue;
                    amount = HljldUtils.resolveLiquidCap(execution);
                }
            }

            if (amount == 0) continue;

            // 按通道分类
            String methodGroup = HljldUtils.str(method, "group").trim();
            if ("输血".equals(methodGroup) || "输血".equals(inChannel)) {
                totals.transfusion += amount;
            } else if (ENTERAL_NUTRITION_PATTERN.matcher(HljldUtils.str(method, "name")).find()) {
                totals.enteral += amount;
            } else if ("胃肠".equals(methodGroup) || "胃肠".equals(inChannel) || "消化道".equals(inChannel)) {
                totals.gastro.merge(route, amount, Double::sum);
            } else if ("静脉".equals(inChannel)) {
                totals.vein.merge(route, amount, Double::sum);
            }
        }

        return totals;
    }

    // ══════════════════════════════════════════════════════════
    //  detailLines 构建（与前端完全一致）
    // ══════════════════════════════════════════════════════════

    private static List<SummaryTextToken> buildInputLine(HljldSummary summary) {
        List<SummaryTextToken> tokens = new ArrayList<>();
        pushAmount(tokens, "总入量", summary.getTotalInput());

        List<SummaryTextToken> segment = new ArrayList<>();
        if (pushGroup(segment, "药物治疗", summary.getDrugTreatmentTotal(), summary.getDrugTreatmentItems())) {
            appendSeparator(tokens);
            tokens.addAll(segment);
        }

        segment = new ArrayList<>();
        if (pushGroup(segment, "胃肠摄入", summary.getGastrointestinalInputTotal(), summary.getGastrointestinalInputItems())) {
            appendSeparator(tokens);
            tokens.addAll(segment);
        }

        return tokens;
    }

    private static List<SummaryTextToken> buildOutputLine(HljldSummary summary) {
        List<SummaryTextToken> tokens = new ArrayList<>();
        pushAmount(tokens, "总出量", summary.getTotalOutput());

        if (HljldUtils.round1(summary.getUrineTotal()) != 0) {
            appendSeparator(tokens);
            pushAmount(tokens, "尿量", summary.getUrineTotal());
        }

        if (HljldUtils.round1(summary.getUltrafiltrationTotal()) != 0) {
            appendSeparator(tokens);
            pushAmount(tokens, "净超滤量", summary.getUltrafiltrationTotal());
        }

        List<SummaryTextToken> segment = new ArrayList<>();
        if (pushGroup(segment, "排出物", summary.getExcretionTotal(), summary.getOutputItems())) {
            appendSeparator(tokens);
            tokens.addAll(segment);
        }

        segment = new ArrayList<>();
        if (pushGroup(segment, "引流液", summary.getDrainTotal(), summary.getDrainItems())) {
            appendSeparator(tokens);
            tokens.addAll(segment);
        }

        return tokens;
    }

    private static List<SummaryTextToken> buildBalanceLine(HljldSummary summary) {
        return Arrays.asList(
            new SummaryTextToken("平衡量：", false, false),
            new SummaryTextToken(formatAmount(summary.getBalance()) + " ml", true, false)
        );
    }

    private static void pushAmount(List<SummaryTextToken> tokens, String label, double amount) {
        tokens.add(new SummaryTextToken(label + "：", false, false));
        tokens.add(new SummaryTextToken(formatAmount(amount) + " ml", true, false));
    }

    private static void pushItems(List<SummaryTextToken> tokens, List<SummaryItem> items) {
        List<SummaryItem> validItems = items.stream()
            .filter(item -> HljldUtils.round1(item.getAmount()) != 0)
            .collect(Collectors.toList());

        for (int i = 0; i < validItems.size(); i++) {
            if (i > 0) {
                tokens.add(new SummaryTextToken("、", false, false));
            }
            SummaryItem item = validItems.get(i);
            pushAmount(tokens, item.getLabel(), item.getAmount());

            if (item.getChildren() != null && !item.getChildren().isEmpty()) {
                tokens.add(new SummaryTextToken("（", false, false));
                pushItems(tokens, item.getChildren());
                tokens.add(new SummaryTextToken("）", false, false));
            }
        }
    }

    private static boolean pushGroup(
            List<SummaryTextToken> tokens,
            String label,
            double total,
            List<SummaryItem> items) {

        List<SummaryItem> nonZeroItems = items == null
            ? Collections.emptyList()
            : items.stream()
                .filter(item -> HljldUtils.round1(item.getAmount()) != 0)
                .collect(Collectors.toList());

        if (HljldUtils.round1(total) == 0 && nonZeroItems.isEmpty()) {
            return false;
        }

        pushAmount(tokens, label, total);

        if (!nonZeroItems.isEmpty()) {
            tokens.add(new SummaryTextToken("（", false, false));
            pushItems(tokens, nonZeroItems);
            tokens.add(new SummaryTextToken("）", false, false));
        }

        return true;
    }

    private static void appendSeparator(List<SummaryTextToken> tokens) {
        if (!tokens.isEmpty()) {
            tokens.add(new SummaryTextToken("；", false, true));
        }
    }

    private static String formatAmount(double value) {
        double rounded = HljldUtils.round1(value);
        if (rounded == Math.rint(rounded)) {
            return String.format(Locale.CHINA, "%.0f", rounded);
        }
        return String.format(Locale.CHINA, "%.1f", rounded);
    }

    // ══════════════════════════════════════════════════════════
    //  时间解析辅助
    // ══════════════════════════════════════════════════════════

    private Date resolveSummaryTime(HljldSummary.Kind kind, long dayBoundaryMs,
                                     long nursingDayEndMs, long effectiveEndMs) {
        switch (kind) {
            case DAY:
                return new Date(dayBoundaryMs);
            case SHIFT:
            case FULL_DAY:
                return new Date(nursingDayEndMs);
            case DISCHARGE:
                return new Date(effectiveEndMs);
            default:
                return new Date(dayBoundaryMs);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  内部辅助方法
    // ══════════════════════════════════════════════════════════

    private static double sumBedsideByCode(List<Document> records, String code) {
        return records.stream()
            .filter(item -> code.equals(HljldUtils.str(item, "code")))
            .mapToDouble(item -> HljldUtils.parseAmount(item.get("strVal")))
            .sum();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> getList(Document doc, String key) {
        Object v = doc.get(key);
        if (v instanceof List) return (List<Map<String, Object>>) v;
        return null;
    }

    private static String str(Map<?, ?> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString().trim() : "";
    }
}
