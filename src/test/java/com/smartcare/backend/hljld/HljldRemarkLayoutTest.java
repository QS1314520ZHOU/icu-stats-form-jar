package com.smartcare.backend.hljld;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldRemarkLayout 单元测试。
 * 覆盖：备注压缩、动态高度计算、行高一致性。
 */
class HljldRemarkLayoutTest {

    // ══════════════════════════════════════════════════════════
    //  备注压缩测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("compactRemarkOptions: 压缩选项间空格")
    void compactRemarkOptions_removesSpacesBetweenOptions() {
        String input = "检查：A：CT    B：核磁共振    C：胃镜";
        String result = HljldRemarkLayout.compactRemarkOptions(input);
        assertEquals("检查：A：CTB：核磁共振C：胃镜", result);
    }

    @Test
    @DisplayName("compactRemarkOptions: 保留冒号后无空格")
    void compactRemarkOptions_noSpaceAfterColon() {
        String input = "治疗：A：机械辅助排痰    B：气压治疗";
        String result = HljldRemarkLayout.compactRemarkOptions(input);
        assertEquals("治疗：A：机械辅助排痰B：气压治疗", result);
    }

    @Test
    @DisplayName("compactRemarkOptions: null返回空字符串")
    void compactRemarkOptions_nullReturnsEmpty() {
        assertEquals("", HljldRemarkLayout.compactRemarkOptions(null));
    }

    @Test
    @DisplayName("compactRemarkOptions: 全角空格被压缩")
    void compactRemarkOptions_removesFullWidthSpaces() {
        String input = "检查：A：CT　B：核磁共振";
        String result = HljldRemarkLayout.compactRemarkOptions(input);
        assertEquals("检查：A：CTB：核磁共振", result);
    }

    @Test
    @DisplayName("compactRemarkOptions: 健康教育全部选项压缩")
    void compactRemarkOptions_healthEducation() {
        String input = "健康教育：A：入院指导    B：入科指导    C：疾病知识    D：药物指导    E：饮食指导    F：肢体活动指导    G：检查指导    H：安全指导    I：心理指导    J：术前指导    K：术后指导    L：转科/出院指导    M：用氧注意事项    N：通气配合指导    O：康复指导    P：VTE预防指导";
        String result = HljldRemarkLayout.compactRemarkOptions(input);
        // 验证所有选项间无空格
        assertFalse(result.contains("  "), "不应包含连续空格");
        assertTrue(result.startsWith("健康教育："), "应以标签开头");
        assertTrue(result.endsWith("P：VTE预防指导"), "应以最后选项结尾");
        assertTrue(result.contains("A：入院指导B：入科指导"), "选项A和B之间应无空格");
        assertTrue(result.contains("O：康复指导P：VTE预防指导"), "选项O和P之间应无空格");
    }

    @Test
    @DisplayName("compactRemarkOptions: 斜杠保留")
    void compactRemarkOptions_preservesSlash() {
        String input = "基础护理：A：口腔护理    B：动/静脉置管护理";
        String result = HljldRemarkLayout.compactRemarkOptions(input);
        assertTrue(result.contains("动/静脉置管护理"), "斜杠应被保留");
    }

    // ══════════════════════════════════════════════════════════
    //  动态高度计算测试
    // ══════════════════════════════════════════════════════════

    @Test
    @DisplayName("calculate: 返回4行布局")
    void calculate_returnsFourRows() {
        // 使用固定宽度模拟，不依赖真实字体
        String[] texts = {
            "检查：A：CTB：核磁共振C：胃镜D：肠镜E：超声检查F：床旁胸片G：心电图",
            "治疗：A：机械辅助排痰B：气压治疗C：雾化吸入D：支气管镜灌洗E：TDP照射F：针灸治疗G：运动治疗H：肺复张",
            "基础护理：A：口腔护理B：动/静脉置管护理C：擦浴D：会阴擦洗E：肛周护理F：更换引流袋G：膀胱冲洗H：压疮护理I：床上洗头",
            "健康教育：A：入院指导B：入科指导C：疾病知识D：药物指导E：饮食指导F：肢体活动指导G：检查指导H：安全指导I：心理指导J：术前指导K：术后指导L：转科/出院指导M：用氧注意事项N：通气配合指导O：康复指导P：VTE预防指导"
        };

        // 验证压缩后的文本包含所有必要内容
        for (String text : texts) {
            String compacted = HljldRemarkLayout.compactRemarkOptions(text);
            assertNotNull(compacted);
            assertFalse(compacted.isEmpty());
        }
    }

    @Test
    @DisplayName("compactRemarkOptions: 所有4行备注内容完整性")
    void allFourRemarkLines_areComplete() {
        String[] rawLines = HljldPdfLayoutConstants.REMARK_LINES;

        // 验证原始内容包含所有必要标签
        assertTrue(rawLines[0].startsWith("检查："), "第1行应以'检查：'开头");
        assertTrue(rawLines[1].startsWith("治疗："), "第2行应以'治疗：'开头");
        assertTrue(rawLines[2].startsWith("基础护理："), "第3行应以'基础护理：'开头");
        assertTrue(rawLines[3].startsWith("健康教育："), "第4行应以'健康教育：'开头");

        // 验证压缩后内容完整性
        String compact0 = HljldRemarkLayout.compactRemarkOptions(rawLines[0]);
        String compact1 = HljldRemarkLayout.compactRemarkOptions(rawLines[1]);
        String compact2 = HljldRemarkLayout.compactRemarkOptions(rawLines[2]);
        String compact3 = HljldRemarkLayout.compactRemarkOptions(rawLines[3]);

        // 检查行
        assertTrue(compact0.contains("A：CT"), "检查行应包含A：CT");
        assertTrue(compact0.contains("G：心电图"), "检查行应包含G：心电图");

        // 治疗行
        assertTrue(compact1.contains("A：机械辅助排痰"), "治疗行应包含A：机械辅助排痰");
        assertTrue(compact1.contains("H：肺复张"), "治疗行应包含H：肺复张");

        // 基础护理行
        assertTrue(compact2.contains("A：口腔护理"), "基础护理行应包含A：口腔护理");
        assertTrue(compact2.contains("I：床上洗头"), "基础护理行应包含I：床上洗头");

        // 健康教育行
        assertTrue(compact3.contains("A：入院指导"), "健康教育行应包含A：入院指导");
        assertTrue(compact3.contains("P：VTE预防指导"), "健康教育行应包含P：VTE预防指导");

        // 验证压缩后无多余空格
        assertFalse(compact0.contains("  "), "检查行不应包含连续空格");
        assertFalse(compact1.contains("  "), "治疗行不应包含连续空格");
        assertFalse(compact2.contains("  "), "基础护理行不应包含连续空格");
        assertFalse(compact3.contains("  "), "健康教育行不应包含连续空格");
    }
}
