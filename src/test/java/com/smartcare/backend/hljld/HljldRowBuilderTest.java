package com.smartcare.backend.hljld;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldRowBuilder 单元测试
 * 覆盖：carry-over 和 settlement 的胃肠/非胃肠分类。
 */
class HljldRowBuilderTest {

    private HljldRowBuilder rowBuilder;

    @BeforeEach
    void setUp() {
        rowBuilder = new HljldRowBuilder();
    }

    // ══════════════════════════════════════════════════════════
    //  Carry-over 分类测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("carry-over: 胃肠类持续药物应进入 enteral 列")
    void carryOver_enteralDrug_goesToEnteral() {
        HljldSourceData source = new HljldSourceData();

        // 药物方法配置：group=胃肠, isOnce=false
        Document method = new Document();
        method.put("code", "TP-HE");
        method.put("name", "肠内营养泵");
        method.put("group", "胃肠");
        method.put("isOnce", false);
        method.put("valid", true);
        source.setDrugMethods(Arrays.asList(method));

        // 药物执行记录：25日开始，26日07:00仍在执行
        Document execution = new Document();
        execution.put("_id", "exec1");
        execution.put("methodCode", "TP-HE");
        execution.put("startTime", "2026-08-25T10:00:00Z");
        execution.put("liquidAmount", 500);
        execution.put("drugList", Arrays.asList(
            Map.of("name", "TP-HE", "liquidAmount", 500)));
        execution.put("drugActionList", Arrays.asList(
            Map.of("action", "start", "time", "2026-08-25T10:00:00Z", "speed", 50)));
        source.setDrugExecutions(Arrays.asList(execution));

        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);
        long nowMs = makeDate(2026, Calendar.AUGUST, 26, 10, 0, 0).getTime();

        List<HljldTimeRow> rows = rowBuilder.buildRows(source, aug26Start, aug26End, false, nowMs);

        // 找到 carry-over 行
        Optional<HljldTimeRow> carryOver = rows.stream()
            .filter(r -> r.getKey().startsWith("carry-over"))
            .findFirst();

        assertTrue(carryOver.isPresent(), "应有 carry-over 行");
        assertTrue(carryOver.get().getEnteral().isEmpty() == false,
            "胃肠类药物应进入 enteral 列");
        assertTrue(carryOver.get().getMedications().isEmpty(),
            "胃肠类药物不应进入 medications 列");
    }

    @Test
    @DisplayName("carry-over: 非胃肠类持续药物应进入 medications 列")
    void carryOver_nonEnteralDrug_goesToMedications() {
        HljldSourceData source = new HljldSourceData();

        // 药物方法配置：group=静脉, isOnce=false
        Document method = new Document();
        method.put("code", "IV");
        method.put("name", "静脉输液泵");
        method.put("group", "静脉");
        method.put("isOnce", false);
        method.put("valid", true);
        source.setDrugMethods(Arrays.asList(method));

        // 药物执行记录：25日开始，26日07:00仍在执行
        Document execution = new Document();
        execution.put("_id", "exec2");
        execution.put("methodCode", "IV");
        execution.put("startTime", "2026-08-25T10:00:00Z");
        execution.put("liquidAmount", 250);
        execution.put("drugList", Arrays.asList(
            Map.of("name", "氯化钠", "liquidAmount", 250)));
        execution.put("drugActionList", Arrays.asList(
            Map.of("action", "start", "time", "2026-08-25T10:00:00Z", "speed", 25)));
        source.setDrugExecutions(Arrays.asList(execution));

        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        Date aug26End = makeDate(2026, Calendar.AUGUST, 27, 7, 0, 0);
        long nowMs = makeDate(2026, Calendar.AUGUST, 26, 10, 0, 0).getTime();

        List<HljldTimeRow> rows = rowBuilder.buildRows(source, aug26Start, aug26End, false, nowMs);

        Optional<HljldTimeRow> carryOver = rows.stream()
            .filter(r -> r.getKey().startsWith("carry-over"))
            .findFirst();

        assertTrue(carryOver.isPresent(), "应有 carry-over 行");
        assertTrue(carryOver.get().getMedications().isEmpty() == false,
            "非胃肠类药物应进入 medications 列");
        assertTrue(carryOver.get().getEnteral().isEmpty(),
            "非胃肠类药物不应进入 enteral 列");
    }

    // ══════════════════════════════════════════════════════════
    //  Settlement 分类测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("SegmentSettlement: isEnteral 字段正确设置")
    void segmentSettlement_isEnteral_correct() {
        HljldSourceData source = new HljldSourceData();

        // 胃肠类药物
        Document enteralMethod = new Document();
        enteralMethod.put("code", "TP-HE");
        enteralMethod.put("name", "肠内营养泵");
        enteralMethod.put("group", "胃肠");
        enteralMethod.put("isOnce", false);
        enteralMethod.put("valid", true);

        // 静脉类药物
        Document veinMethod = new Document();
        veinMethod.put("code", "IV");
        veinMethod.put("name", "静脉输液泵");
        veinMethod.put("group", "静脉");
        veinMethod.put("isOnce", false);
        veinMethod.put("valid", true);

        source.setDrugMethods(Arrays.asList(enteralMethod, veinMethod));

        // 胃肠药物执行记录
        Document enteralExec = new Document();
        enteralExec.put("_id", "exec-enteral");
        enteralExec.put("startTime", "2026-08-25T10:00:00Z");
        enteralExec.put("liquidAmount", 500);
        enteralExec.put("drugList", Arrays.asList(
            Map.of("name", "TP-HE", "liquidAmount", 500)));
        enteralExec.put("drugActionList", Arrays.asList(
            Map.of("action", "start", "time", "2026-08-25T10:00:00Z", "speed", 50)));

        // 静脉药物执行记录
        Document veinExec = new Document();
        veinExec.put("_id", "exec-vein");
        veinExec.put("startTime", "2026-08-25T10:00:00Z");
        veinExec.put("liquidAmount", 250);
        veinExec.put("drugList", Arrays.asList(
            Map.of("name", "氯化钠", "liquidAmount", 250)));
        veinExec.put("drugActionList", Arrays.asList(
            Map.of("action", "start", "time", "2026-08-25T10:00:00Z", "speed", 25)));

        source.setDrugExecutions(Arrays.asList(enteralExec, veinExec));

        // 构建 night 段（17:00→次日07:00）
        Date aug26Start = makeDate(2026, Calendar.AUGUST, 26, 7, 0, 0);
        List<HljldUtils.NursingSegment> segments = HljldUtils.resolveNursingSegments(aug26Start);
        HljldUtils.NursingSegment nightSegment = segments.get(1);

        long nowMs = makeDate(2026, Calendar.AUGUST, 26, 20, 0, 0).getTime();
        List<HljldUtils.SegmentSettlement> settlements = HljldUtils.buildSegmentSettlements(
            source.getDrugExecutions(), source.getDrugMethods(), nightSegment, nowMs);

        // 验证 isEnteral 分类
        for (HljldUtils.SegmentSettlement s : settlements) {
            if (s.name.contains("TP-HE")) {
                assertTrue(s.isEnteral, "TP-HE 应标记为胃肠类 (isEnteral=true)");
            }
            if (s.name.contains("氯化钠")) {
                assertFalse(s.isEnteral, "氯化钠应标记为非胃肠类 (isEnteral=false)");
            }
        }
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
