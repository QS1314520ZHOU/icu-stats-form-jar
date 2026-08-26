package com.smartcare.backend.hljld;

/**
 * ICU 护理记录单 PDF 统一布局常量。
 * 所有页面尺寸、边距、字号、列宽等集中定义，禁止在其他类中使用魔法数字。
 */
public final class HljldPdfLayoutConstants {

    private HljldPdfLayoutConstants() {}

    // ══════════════════════════════════════════════════════════
    //  页面尺寸
    // ══════════════════════════════════════════════════════════
    /** A4 横向宽度 (pt) */
    public static final float PAGE_WIDTH  = 842f;
    /** A4 横向高度 (pt) */
    public static final float PAGE_HEIGHT = 595f;

    // ══════════════════════════════════════════════════════════
    //  页面边距（从页面边缘到内容区域的距离）
    // ══════════════════════════════════════════════════════════
    /** 左边距 */
    public static final float MARGIN_LEFT   = 10f;
    /** 右边距 */
    public static final float MARGIN_RIGHT  = 10f;
    /** 上边距 = 标题区域高度 + 患者信息区域高度 + 间距 */
    public static final float MARGIN_TOP    = 46f;
    /** 下边距 = 备注区高度 + 页码高度 + 间距 */
    public static final float MARGIN_BOTTOM = 72f;

    // ══════════════════════════════════════════════════════════
    //  内容区域边界（页面坐标系，(0,0) 在页面左下角）
    // ══════════════════════════════════════════════════════════
    /** 内容区域顶部 Y 坐标 = PAGE_HEIGHT - MARGIN_TOP */
    public static final float CONTENT_TOP    = PAGE_HEIGHT - MARGIN_TOP;  // 549
    /** 内容区域底部 Y 坐标 = MARGIN_BOTTOM */
    public static final float CONTENT_BOTTOM = MARGIN_BOTTOM;             // 72

    // ══════════════════════════════════════════════════════════
    //  页眉区域（标题 + 患者信息，由事件处理器绘制）
    // ══════════════════════════════════════════════════════════
    /** 标题字号 */
    public static final float TITLE_FONT_SIZE = 14f;
    /** 标题 Y 偏移（从页面顶部向下） */
    public static final float TITLE_Y_OFFSET = 14f;
    /** 患者信息字号 */
    public static final float INFO_FONT_SIZE = 9f;
    /** 患者信息 Y 偏移（从页面顶部向下） */
    public static final float INFO_Y_OFFSET = 32f;

    // ══════════════════════════════════════════════════════════
    //  数据表头
    // ══════════════════════════════════════════════════════════
    /** 表头字号 */
    public static final float HEADER_FONT_SIZE = 7f;
    /** 子表头字号 */
    public static final float SUB_HEADER_FONT_SIZE = 6.5f;
    /** 表头行高 */
    public static final float HEADER_ROW_HEIGHT = 16f;
    /** 子表头行高 */
    public static final float SUB_HEADER_ROW_HEIGHT = 18f;

    // ══════════════════════════════════════════════════════════
    //  数据行
    // ══════════════════════════════════════════════════════════
    /** 数据字号 */
    public static final float DATA_FONT_SIZE = 7f;
    /** 数据行最小高度 */
    public static final float DATA_ROW_MIN_HEIGHT = 18f;

    // ══════════════════════════════════════════════════════════
    //  小结和总结
    // ══════════════════════════════════════════════════════════
    /** 小结/总结内容字号 */
    public static final float SUMMARY_FONT_SIZE = 7f;
    /** 小结/总结标题字号 */
    public static final float SUMMARY_TITLE_FONT_SIZE = 8f;
    /** 小结/总结固定行数 */
    public static final int SUMMARY_ROWS = 4;

    // ══════════════════════════════════════════════════════════
    //  备注区
    // ══════════════════════════════════════════════════════════
    /** 备注内容字号 */
    public static final float REMARK_FONT_SIZE = 6.5f;
    /** 备注标签字号 */
    public static final float REMARK_LABEL_FONT_SIZE = 8f;
    /** 备注每行高度 */
    public static final float REMARK_ROW_HEIGHT = 13f;
    /** 备注行数 */
    public static final int REMARK_ROWS = 4;
    /** 备注区总高度 = 行数 * 行高 + 间距 */
    public static final float REMARK_TOTAL_HEIGHT = REMARK_ROW_HEIGHT * REMARK_ROWS + 4f; // 56

    // ══════════════════════════════════════════════════════════
    //  页码
    // ══════════════════════════════════════════════════════════
    /** 页码字号 */
    public static final float PAGE_NUM_FONT_SIZE = 10f;
    /** 页码 Y 坐标（从页面底部向上） */
    public static final float PAGE_NUM_Y = 4f;

    // ══════════════════════════════════════════════════════════
    //  19 列宽度（pt）
    // ══════════════════════════════════════════════════════════
    // 总宽 850pt:
    //   日期50, 药物100+30+30=160, 胃肠100+30+30=160,
    //   尿量30, 净超滤30, 排出物30+30=60, 引流液30+30=60,
    //   检查30, 治疗30, 基础护理30, 健康教育30, 护理记录150, 签名30
    public static final float[] COL_WIDTHS_PT = {
        50f,        // 0: 日期时间
        100f,       // 1: 药物治疗-名称
        30f,        // 2: 药物治疗-量
        30f,        // 3: 药物治疗-途径
        100f,       // 4: 胃肠摄入-名称
        30f,        // 5: 胃肠摄入-量
        30f,        // 6: 胃肠摄入-途径
        30f,        // 7: 尿量
        30f,        // 8: 净超滤量
        30f,        // 9:  排出物-名称
        30f,        // 10: 排出物-量
        30f,        // 11: 引流液-名称
        30f,        // 12: 引流液-量
        30f,        // 13: 检查
        30f,        // 14: 治疗
        30f,        // 15: 基础护理
        30f,        // 16: 健康教育
        150f,       // 17: 护理记录
        30f         // 18: 签名
    };

    /** 表格总宽度 = 所有列宽之和 */
    public static final float TABLE_WIDTH = 850f;

    // ══════════════════════════════════════════════════════════
    //  边框粗细
    // ══════════════════════════════════════════════════════════
    /** 外边框 */
    public static final float BORDER_OUTER = 0.5f;
    /** 表头内部边框 */
    public static final float BORDER_HEADER_INNER = 0.5f;
    /** 数据行边框 */
    public static final float BORDER_DATA = 0.3f;
    /** 小结/总结边框 */
    public static final float BORDER_SUMMARY = 0.5f;
    /** 备注区边框 */
    public static final float BORDER_REMARK = 0.3f;

    // ══════════════════════════════════════════════════════════
    //  备注内容
    // ══════════════════════════════════════════════════════════
    public static final String[] REMARK_LINES = {
        "检查：A：CT  B：核磁共振  C：胃镜  D：肠镜  E：超声检查  F：床旁胸片  G：心电图",
        "治疗：A：机械辅助排痰  B：气压治疗  C：雾化吸入  D：支气管镜灌洗  E：TDP照射  F：针灸治疗  G：运动治疗  H：肺复张",
        "基础护理：A：口腔护理  B：动/静脉置管护理  C：擦浴  D：会阴擦洗  E：肛周护理  F：更换引流袋  G：膀胱冲洗  H：压疮护理  I：床上洗头",
        "健康教育：A：入院指导  B：入科指导  C：疾病知识  D：药物指导  E：饮食指导  F：肢体活动指导  G：检查指导  H：安全指导  I：心理指导  J：术前指导  K：术后指导  L：转科/出院指导  M：用氧注意事项  N：通气配合指导  O：康复指导  P：VTE预防指导"
    };

    // ══════════════════════════════════════════════════════════
    //  数据字段键名
    // ══════════════════════════════════════════════════════════
    public static final String[] DATA_KEYS = {
        "timeText",                      // 0
        "medName", "medAmount", "medRoute", // 1,2,3
        "enteralName", "enteralAmount", "enteralRoute", // 4,5,6
        "urine",                         // 7
        "ultrafiltration",               // 8
        "outputName", "outputAmount",    // 9,10
        "drainName", "drainAmount",      // 11,12
        "examination",                   // 13
        "treatment",                     // 14
        "basicCare",                     // 15
        "healthEducation",               // 16
        "nursingRecord",                 // 17
        "signature"                      // 18
    };

    /** 左对齐的字段索引 */
    public static final java.util.Set<Integer> LEFT_ALIGN_FIELDS = java.util.Set.of(
        0, 1, 4, 9, 11, 17
    );
}
