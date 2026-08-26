package com.smartcare.backend.hljld;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import java.util.Calendar;
import java.util.Date;
import java.util.TimeZone;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldUtils 单元测试
 * 覆盖：护理日 07:00 边界归属、肠内营养名称映射、isTargetEnteral 判断。
 */
class HljldUtilsTest {

    // ══════════════════════════════════════════════════════════
    //  护理日 07:00 边界归属测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("护理日区间：07:00 左闭右开 [07:00, 次日07:00)")
    void nursingDayRange_isLeftClosedRightOpen() {
        // 2026-08-26 07:00 属于 2026-08-26 护理日
        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);

        // 07:00:00 应该属于 26 号护理日（左闭）
        assertTrue(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0), aug26Start, aug26End, false),
            "26号07:00:00应属于26号护理日");
    }

    @Test
    @DisplayName("06:59:59 属于前一天护理日")
    void before0700_belongsToPreviousDay() {
        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);

        // 06:59:59 归到分钟是 06:59，不属于 26 号
        assertFalse(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 26, 6, 59, 59), aug26Start, aug26End, false),
            "26号06:59:59不应属于26号护理日");
    }

    @Test
    @DisplayName("次日 07:00:00 不属于当天护理日（右开）")
    void nextDay0700_notInCurrentDay() {
        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);

        // 27号07:00:00 不属于 26 号护理日（右开）
        assertFalse(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0), aug26Start, aug26End, false),
            "27号07:00:00不应属于26号护理日");
    }

    @Test
    @DisplayName("26号07:00:30 归属26号护理日，分钟归为07:00")
    void after0700_withSeconds_belongsToCurrentDay() {
        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);

        assertTrue(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 26, 7, 0, 30), aug26Start, aug26End, false),
            "26号07:00:30应属于26号护理日");
    }

    @Test
    @DisplayName("27号06:59:59 仍属于26号护理日")
    void justBeforeNextDay0700_belongsToCurrentDay() {
        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);

        assertTrue(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 27, 6, 59, 59), aug26Start, aug26End, false),
            "27号06:59:59应属于26号护理日");
    }

    @Test
    @DisplayName("startExclusive=true 时 07:00:00 被排除（特殊场景）")
    void startExclusive_excludesStartTime() {
        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);

        // startExclusive=true 时，07:00:00 被排除（左开）
        assertFalse(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0), aug26Start, aug26End, true),
            "startExclusive=true时07:00:00应被排除");

        // 07:00:01 因 minuteInstant 截断到分钟仍为 07:00，与 startMs 相等，左开排除
        assertFalse(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 26, 7, 0, 1), aug26Start, aug26End, true),
            "startExclusive=true时07:00:01因分钟截断仍等于startMs，应被排除");

        // 07:01:00 截断到 07:01 > 07:00，左开包含
        assertTrue(HljldUtils.inNursingRange(
            makeDate(2026, Calendar.AUGUST, 26, 7, 1, 0), aug26Start, aug26End, true),
            "startExclusive=true时07:01:00截断到07:01应包含");
    }

    @Test
    @DisplayName("resolveActiveStayRange 正常护理日 startExclusive=false")
    void resolveActiveStayRange_normalDay_startNotExclusive() {
        // 患者入科时间在护理日之前，不应裁剪
        org.bson.Document patient = new org.bson.Document();
        patient.put("admissionTime", "2026-08-20T07:00:00Z");

        Date aug26Start = HljldUtils.startOfNursingDay(
            makeDate(2026, Calendar.AUGUST, 26, 0, 0, 0));
        Date aug26End = HljldUtils.endOfNursingDay(
            makeDate(2026, Calendar.AUGUST, 26, 0, 0, 0));

        HljldUtils.ActiveStayRange range = HljldUtils.resolveActiveStayRange(
            patient, aug26Start, aug26End);

        assertFalse(range.startExclusive,
            "正常护理日 startExclusive 应为 false，确保07:00包含");
        assertTrue(range.hasValidRange, "正常护理日应有有效范围");
    }

    // ══════════════════════════════════════════════════════════
    //  肠内营养名称映射测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("enteralDisplayName: SP → 短肽")
    void enteralDisplayName_SP() {
        assertEquals("短肽", HljldUtils.enteralDisplayName("SP"));
        assertEquals("短肽", HljldUtils.enteralDisplayName("sp"));
        assertEquals("短肽", HljldUtils.enteralDisplayName("短肽"));
    }

    @Test
    @DisplayName("enteralDisplayName: TP-HE → 瑞高")
    void enteralDisplayName_TP_HE() {
        assertEquals("瑞高", HljldUtils.enteralDisplayName("TP-HE"));
        assertEquals("瑞高", HljldUtils.enteralDisplayName("tp-he"));
        assertEquals("瑞高", HljldUtils.enteralDisplayName("瑞高"));
        assertEquals("瑞高", HljldUtils.enteralDisplayName("营养液TP-HE 500ml"));
    }

    @Test
    @DisplayName("enteralDisplayName: TPF-T → 瑞能")
    void enteralDisplayName_TPF_T() {
        assertEquals("瑞能", HljldUtils.enteralDisplayName("TPF-T"));
        assertEquals("瑞能", HljldUtils.enteralDisplayName("tpf-t"));
        assertEquals("瑞能", HljldUtils.enteralDisplayName("瑞能"));
        assertEquals("瑞能", HljldUtils.enteralDisplayName("营养液TPF-T 500ml"));
    }

    @Test
    @DisplayName("enteralDisplayName: TP → 瑞素（必须最后匹配）")
    void enteralDisplayName_TP() {
        assertEquals("瑞素", HljldUtils.enteralDisplayName("TP"));
        assertEquals("瑞素", HljldUtils.enteralDisplayName("tp"));
        assertEquals("瑞素", HljldUtils.enteralDisplayName("瑞素"));
        assertEquals("瑞素", HljldUtils.enteralDisplayName("营养液TP 500ml"));
    }

    @Test
    @DisplayName("TP-HE 不能被 TP 提前匹配为瑞素")
    void enteralDisplayName_TP_HE_notMatchTP() {
        String result = HljldUtils.enteralDisplayName("TP-HE");
        assertNotEquals("瑞素", result, "TP-HE 不应被识别为瑞素");
        assertEquals("瑞高", result, "TP-HE 应被识别为瑞高");
    }

    @Test
    @DisplayName("TPF-T 不能被 TP 提前匹配为瑞素")
    void enteralDisplayName_TPF_T_notMatchTP() {
        String result = HljldUtils.enteralDisplayName("TPF-T");
        assertNotEquals("瑞素", result, "TPF-T 不应被识别为瑞素");
        assertEquals("瑞能", result, "TPF-T 应被识别为瑞能");
    }

    @Test
    @DisplayName("中文商品名直接匹配")
    void enteralDisplayName_chineseNames() {
        assertEquals("短肽", HljldUtils.enteralDisplayName("短肽"));
        assertEquals("瑞高", HljldUtils.enteralDisplayName("瑞高"));
        assertEquals("瑞能", HljldUtils.enteralDisplayName("瑞能"));
        assertEquals("瑞素", HljldUtils.enteralDisplayName("瑞素"));
    }

    @Test
    @DisplayName("空值和null安全")
    void enteralDisplayName_nullAndEmpty() {
        assertEquals("", HljldUtils.enteralDisplayName(null));
        assertEquals("", HljldUtils.enteralDisplayName(""));
        assertEquals("其他", HljldUtils.enteralDisplayName("其他"));
    }

    // ══════════════════════════════════════════════════════════
    //  isTargetEnteral 判断测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("isTargetEnteral: 识别所有目标肠内营养")
    void isTargetEnteral_allTargets() {
        assertTrue(HljldUtils.isTargetEnteral("SP"));
        assertTrue(HljldUtils.isTargetEnteral("TP-HE"));
        assertTrue(HljldUtils.isTargetEnteral("TPF-T"));
        assertTrue(HljldUtils.isTargetEnteral("TP"));
        assertTrue(HljldUtils.isTargetEnteral("瑞素"));
        assertTrue(HljldUtils.isTargetEnteral("瑞高"));
        assertTrue(HljldUtils.isTargetEnteral("瑞能"));
        assertTrue(HljldUtils.isTargetEnteral("短肽"));
    }

    @Test
    @DisplayName("isTargetEnteral: null/空值返回false")
    void isTargetEnteral_nullAndEmpty() {
        assertFalse(HljldUtils.isTargetEnteral(null));
        assertFalse(HljldUtils.isTargetEnteral(""));
    }

    @Test
    @DisplayName("isTargetEnteral: 非目标药物返回false")
    void isTargetEnteral_nonTarget() {
        assertFalse(HljldUtils.isTargetEnteral("氯化钠"));
        assertFalse(HljldUtils.isTargetEnteral("多巴胺"));
    }

    // ══════════════════════════════════════════════════════════
    //  辅助方法
    // ══════════════════════════════════════════════════════════

    private static Date makeDate(int year, int month, int day, int hour, int minute, int second) {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        cal.set(year, month, day, hour, minute, second);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTime();
    }
}
