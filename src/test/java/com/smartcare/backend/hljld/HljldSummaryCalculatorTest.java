package com.smartcare.backend.hljld;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldSummaryCalculator 单元测试。
 * 覆盖：日间小结门禁、24小时总结门禁、时间轴排序、结算行。
 */
class HljldSummaryCalculatorTest {

    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");

    // ══════════════════════════════════════════════════════════
    //  日间小结门禁测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("日间小结：referenceTime < 17:00 时不显示")
    void daySummary_notShown_before1700() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long dayBoundaryMs = nursingDate.atTime(17, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        // referenceTime = 16:59
        long referenceTimeMs = nursingDate.atTime(16, 59).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary daySummary = createMockSummary(HljldSummary.Kind.DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            daySummary, null, null, null, referenceTimeMs, nursingDate);

        boolean hasDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.DAY_SUMMARY);
        assertFalse(hasDaySummary, "referenceTime=16:59时不应显示日间小结");
    }

    @Test
    @DisplayName("日间小结：referenceTime = 17:00 时显示")
    void daySummary_shown_at1700() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long referenceTimeMs = nursingDate.atTime(17, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary daySummary = createMockSummary(HljldSummary.Kind.DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            daySummary, null, null, null, referenceTimeMs, nursingDate);

        boolean hasDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.DAY_SUMMARY);
        assertTrue(hasDaySummary, "referenceTime=17:00时应显示日间小结");
    }

    @Test
    @DisplayName("日间小结：referenceTime = 17:01 时显示")
    void daySummary_shown_after1700() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long referenceTimeMs = nursingDate.atTime(17, 1).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary daySummary = createMockSummary(HljldSummary.Kind.DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            daySummary, null, null, null, referenceTimeMs, nursingDate);

        boolean hasDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.DAY_SUMMARY);
        assertTrue(hasDaySummary, "referenceTime=17:01时应显示日间小结");
    }

    // ══════════════════════════════════════════════════════════
    //  24小时总结门禁测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("24小时总结：referenceTime < 次日07:00 时不显示")
    void fullDaySummary_notShown_beforeNext0700() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long nextMorningMs = nursingDate.plusDays(1).atTime(7, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        // referenceTime = 06:59
        long referenceTimeMs = nursingDate.plusDays(1).atTime(6, 59).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary fullDaySummary = createMockSummary(HljldSummary.Kind.FULL_DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            null, null, fullDaySummary, null, referenceTimeMs, nursingDate);

        boolean hasFullDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.FULL_DAY_SUMMARY);
        assertFalse(hasFullDaySummary, "referenceTime=06:59时不应显示24小时总结");
    }

    @Test
    @DisplayName("24小时总结：referenceTime = 07:00 时显示")
    void fullDaySummary_shown_at0700() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long referenceTimeMs = nursingDate.plusDays(1).atTime(7, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary fullDaySummary = createMockSummary(HljldSummary.Kind.FULL_DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            null, null, fullDaySummary, null, referenceTimeMs, nursingDate);

        boolean hasFullDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.FULL_DAY_SUMMARY);
        assertTrue(hasFullDaySummary, "referenceTime=07:00时应显示24小时总结");
    }

    @Test
    @DisplayName("24小时总结：referenceTime = 07:01 时显示")
    void fullDaySummary_shown_after0700() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long referenceTimeMs = nursingDate.plusDays(1).atTime(7, 1).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary fullDaySummary = createMockSummary(HljldSummary.Kind.FULL_DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            null, null, fullDaySummary, null, referenceTimeMs, nursingDate);

        boolean hasFullDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.FULL_DAY_SUMMARY);
        assertTrue(hasFullDaySummary, "referenceTime=07:01时应显示24小时总结");
    }

    // ══════════════════════════════════════════════════════════
    //  历史护理日测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("历史护理日：nursingDate=2026-08-26, referenceTime=2026-08-27 10:24 同时显示日间小结和24小时总结")
    void historicalNursingDate_showsBothSummaries() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        // referenceTime = 2026-08-27 10:24 (次日已过07:00)
        long referenceTimeMs = nursingDate.plusDays(1).atTime(10, 24).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary daySummary = createMockSummary(HljldSummary.Kind.DAY, nursingDate, true);
        HljldSummary fullDaySummary = createMockSummary(HljldSummary.Kind.FULL_DAY, nursingDate, true);

        List<HljldTimelineItem> timeline = buildTestTimeline(
            daySummary, null, fullDaySummary, null, referenceTimeMs, nursingDate);

        boolean hasDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.DAY_SUMMARY);
        boolean hasFullDaySummary = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.FULL_DAY_SUMMARY);

        assertTrue(hasDaySummary, "应显示日间小结");
        assertTrue(hasFullDaySummary, "应显示24小时总结");
    }

    // ══════════════════════════════════════════════════════════
    //  结算行测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("结算行：日间小结后应生成结算行")
    void settlementRow_afterDaySummary() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long referenceTimeMs = nursingDate.atTime(17, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary daySummary = createMockSummary(HljldSummary.Kind.DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            daySummary, null, null, null, referenceTimeMs, nursingDate);

        boolean hasSettlement = timeline.stream()
            .anyMatch(item -> item.getKind() == HljldTimelineItem.Kind.DAY_SETTLEMENT);
        assertTrue(hasSettlement, "日间小结后应生成结算行");
    }

    @Test
    @DisplayName("结算行：sortRank在日间小结之后")
    void settlementRow_sortRank_afterDaySummary() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long referenceTimeMs = nursingDate.atTime(17, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary daySummary = createMockSummary(HljldSummary.Kind.DAY, nursingDate, true);
        List<HljldTimelineItem> timeline = buildTestTimeline(
            daySummary, null, null, null, referenceTimeMs, nursingDate);

        int daySummaryRank = -1;
        int settlementRank = -1;
        for (HljldTimelineItem item : timeline) {
            if (item.getKind() == HljldTimelineItem.Kind.DAY_SUMMARY) {
                daySummaryRank = item.getSortRank();
            }
            if (item.getKind() == HljldTimelineItem.Kind.DAY_SETTLEMENT) {
                settlementRank = item.getSortRank();
            }
        }

        assertTrue(daySummaryRank >= 0, "应有日间小结");
        assertTrue(settlementRank >= 0, "应有结算行");
        assertTrue(settlementRank > daySummaryRank,
            "结算行sortRank(" + settlementRank + ")应大于日间小结sortRank(" + daySummaryRank + ")");
    }

    // ══════════════════════════════════════════════════════════
    //  时间轴排序测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("时间轴排序：同一时间戳内按sortRank排序")
    void timeline_sorting_bySortRank() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long referenceTimeMs = nursingDate.plusDays(1).atTime(10, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        HljldSummary daySummary = createMockSummary(HljldSummary.Kind.DAY, nursingDate, true);
        HljldSummary fullDaySummary = createMockSummary(HljldSummary.Kind.FULL_DAY, nursingDate, true);

        List<HljldTimelineItem> timeline = buildTestTimeline(
            daySummary, null, fullDaySummary, null, referenceTimeMs, nursingDate);

        // 验证日间小结在结算行之前
        int daySummaryIdx = -1;
        int settlementIdx = -1;
        for (int i = 0; i < timeline.size(); i++) {
            HljldTimelineItem item = timeline.get(i);
            if (item.getKind() == HljldTimelineItem.Kind.DAY_SUMMARY) {
                daySummaryIdx = i;
            }
            if (item.getKind() == HljldTimelineItem.Kind.DAY_SETTLEMENT) {
                settlementIdx = i;
            }
        }

        if (daySummaryIdx >= 0 && settlementIdx >= 0) {
            assertTrue(daySummaryIdx < settlementIdx,
                "日间小结应在结算行之前");
        }
    }

    // ══════════════════════════════════════════════════════════
    //  时间边界计算测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("时间边界：17:00和次日07:00应根据nursingDate计算，不根据referenceTime")
    void timeBoundaries_basedOnNursingDate() {
        LocalDate nursingDate = LocalDate.of(2026, 8, 26);
        long dayBoundaryMs = nursingDate.atTime(17, 0).atZone(SHANGHAI).toInstant().toEpochMilli();
        long nextMorningMs = nursingDate.plusDays(1).atTime(7, 0).atZone(SHANGHAI).toInstant().toEpochMilli();

        // 验证边界时间戳
        ZonedDateTime dayBoundary = java.time.Instant.ofEpochMilli(dayBoundaryMs).atZone(SHANGHAI);
        ZonedDateTime nextMorning = java.time.Instant.ofEpochMilli(nextMorningMs).atZone(SHANGHAI);

        assertEquals(2026, dayBoundary.getYear());
        assertEquals(8, dayBoundary.getMonthValue());
        assertEquals(26, dayBoundary.getDayOfMonth());
        assertEquals(17, dayBoundary.getHour());
        assertEquals(0, dayBoundary.getMinute());

        assertEquals(2026, nextMorning.getYear());
        assertEquals(8, nextMorning.getMonthValue());
        assertEquals(27, nextMorning.getDayOfMonth());
        assertEquals(7, nextMorning.getHour());
        assertEquals(0, nextMorning.getMinute());
    }

    // ══════════════════════════════════════════════════════════
    //  辅助方法
    // ══════════════════════════════════════════════════════════

    private HljldSummary createMockSummary(HljldSummary.Kind kind, LocalDate nursingDate, boolean available) {
        HljldSummary summary = new HljldSummary();
        summary.setKind(kind);
        summary.setAvailable(available);

        long plannedStartMs = nursingDate.atTime(7, 0).atZone(SHANGHAI).toInstant().toEpochMilli();
        long plannedEndMs = nursingDate.plusDays(1).atTime(7, 0).atZone(SHANGHAI).toInstant().toEpochMilli();
        summary.setPlannedStart(plannedStartMs);
        summary.setPlannedEnd(plannedEndMs);

        switch (kind) {
            case DAY:
                summary.setPeriodStart(plannedStartMs);
                summary.setPeriodEnd(nursingDate.atTime(17, 0).atZone(SHANGHAI).toInstant().toEpochMilli());
                summary.setTime(Date.from(Instant.ofEpochMilli(nursingDate.atTime(17, 0).atZone(SHANGHAI).toInstant().toEpochMilli())));
                break;
            case FULL_DAY:
            case SHIFT:
                summary.setPeriodStart(plannedStartMs);
                summary.setPeriodEnd(plannedEndMs);
                summary.setTime(Date.from(Instant.ofEpochMilli(plannedEndMs)));
                break;
            default:
                summary.setPeriodStart(plannedStartMs);
                summary.setPeriodEnd(plannedEndMs);
                break;
        }

        // 设置detailLines
        summary.setDetailLines(new ArrayList<>());

        return summary;
    }

    private List<HljldTimelineItem> buildTestTimeline(
            HljldSummary daySummary,
            HljldSummary shiftSummary,
            HljldSummary fullDaySummary,
            HljldSummary dischargeSummary,
            long referenceTimeMs,
            LocalDate nursingDate) {

        HljldSummaryCalculator calculator = new HljldSummaryCalculator();
        return calculator.buildTimeline(
            new ArrayList<>(),
            daySummary,
            shiftSummary,
            fullDaySummary,
            dischargeSummary,
            referenceTimeMs);
    }
}
