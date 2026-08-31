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
    //  预留足够空间以兼容不同打印机的不可打印区域（通常3~10mm）
    // ══════════════════════════════════════════════════════════
    /** 左边距 */
    public static final float MARGIN_LEFT   = 28f;
    /** 右边距 */
    public static final float MARGIN_RIGHT  = 28f;

    // ══════════════════════════════════════════════════════════
    //  顶部区域坐标（由上到下推导）
    // ══════════════════════════════════════════════════════════
    /** 页面顶部到标题之间的安全边距 */
    public static final float PAGE_TOP_PADDING = 28f;
    /** 标题区域高度 */
    public static final float TITLE_AREA_HEIGHT = 18f;
    /** 标题与患者信息之间的间距 */
    public static final float TITLE_INFO_GAP = 2f;
    /** 患者信息区域高度 */
    public static final float INFO_AREA_HEIGHT = 11f;
    /** 患者信息与表格顶部之间的间距 */
    public static final float INFO_TABLE_GAP = 2f;

    /** 顶部固定区域总高度 = PAGE_TOP_PADDING + TITLE_AREA_HEIGHT + TITLE_INFO_GAP + INFO_AREA_HEIGHT + INFO_TABLE_GAP */
    public static final float TOP_FIXED_HEIGHT =
        PAGE_TOP_PADDING
        + TITLE_AREA_HEIGHT
        + TITLE_INFO_GAP
        + INFO_AREA_HEIGHT
        + INFO_TABLE_GAP;

    /** 上边距 = 顶部固定区域总高度 */
    public static final float MARGIN_TOP = TOP_FIXED_HEIGHT;  // 41pt

    // ══════════════════════════════════════════════════════════
    //  底部区域坐标（由下到上推导）
    // ══════════════════════════════════════════════════════════
    /** 页面底部到页码之间的安全边距 */
    public static final float PAGE_BOTTOM_PADDING = 8f;
    /** 页码区域高度 */
    public static final float PAGE_NUMBER_HEIGHT = 14f;
    /** 页码与备注区之间的间距 */
    public static final float PAGE_NUMBER_REMARK_GAP = 8f;

    /** 页码中心Y坐标 = PAGE_BOTTOM_PADDING + PAGE_NUMBER_HEIGHT / 2 */
    public static final float PAGE_NUM_Y =
        PAGE_BOTTOM_PADDING
        + PAGE_NUMBER_HEIGHT / 2f;  // 9f

    /** 备注区底部Y坐标 = PAGE_BOTTOM_PADDING + PAGE_NUMBER_HEIGHT + PAGE_NUMBER_REMARK_GAP */
    public static final float REMARK_BOTTOM =
        PAGE_BOTTOM_PADDING
        + PAGE_NUMBER_HEIGHT
        + PAGE_NUMBER_REMARK_GAP;  // 18f

    /** 备注每行高度 */
    public static final float REMARK_ROW_HEIGHT = 13f;
    /** 备注行数 */
    public static final int REMARK_ROWS = 4;
    /** 备注区总高度 = 行数 * 行高 */
    public static final float REMARK_TOTAL_HEIGHT = REMARK_ROW_HEIGHT * REMARK_ROWS; // 52

    /** 备注区顶部Y坐标 = REMARK_BOTTOM + REMARK_TOTAL_HEIGHT */
    public static final float REMARK_TOP =
        REMARK_BOTTOM
        + REMARK_TOTAL_HEIGHT;  // 70

    /** 下边距 = REMARK_TOP */
    public static final float MARGIN_BOTTOM = REMARK_TOP;  // 70

    // ══════════════════════════════════════════════════════════
    //  内容区域边界（页面坐标系，(0,0) 在页面左下角）
    // ══════════════════════════════════════════════════════════
    /** 内容区域顶部 Y 坐标 = PAGE_HEIGHT - MARGIN_TOP */
    public static final float CONTENT_TOP    = PAGE_HEIGHT - MARGIN_TOP;  // 554
    /** 内容区域底部 Y 坐标 = MARGIN_BOTTOM = REMARK_TOP */
    public static final float CONTENT_BOTTOM = MARGIN_BOTTOM;             // 70

    // ══════════════════════════════════════════════════════════
    //  页眉区域（标题 + 患者信息，由事件处理器绘制）
    // ══════════════════════════════════════════════════════════
    /** 标题字号 */
    public static final float TITLE_FONT_SIZE = 14f;
    /** 患者信息字号 */
    public static final float INFO_FONT_SIZE = 9f;

    /** 标题顶部Y坐标 = PAGE_HEIGHT - PAGE_TOP_PADDING */
    public static final float TITLE_TOP = PAGE_HEIGHT - PAGE_TOP_PADDING;  // 587
    /** 标题底部Y坐标 = TITLE_TOP - TITLE_AREA_HEIGHT */
    public static final float TITLE_BOTTOM = TITLE_TOP - TITLE_AREA_HEIGHT;  // 569
    /** 患者信息顶部Y坐标 = TITLE_BOTTOM - TITLE_INFO_GAP */
    public static final float INFO_TOP = TITLE_BOTTOM - TITLE_INFO_GAP;  // 567
    /** 患者信息底部Y坐标 = INFO_TOP - INFO_AREA_HEIGHT */
    public static final float INFO_BOTTOM = INFO_TOP - INFO_AREA_HEIGHT;  // 556

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
    /** 备注内容字号（缩小以确保长文本完整显示） */
    public static final float REMARK_FONT_SIZE = 5.5f;
    /** 备注标签字号 */
    public static final float REMARK_LABEL_FONT_SIZE = 8f;

    // ══════════════════════════════════════════════════════════
    //  页码
    // ══════════════════════════════════════════════════════════
    /** 页码字号 */
    public static final float PAGE_NUM_FONT_SIZE = 10f;

    // ══════════════════════════════════════════════════════════
    //  19 列宽度（pt）
    // ══════════════════════════════════════════════════════════
    // A4横向页面宽度842pt，左右边距各28pt，可用宽度786pt
    // 表格总宽786pt，确保不超过页面右边界
    // 总宽 786pt:
    //   日期43, 药物85+30+30=145, 胃肠85+30+30=145,
    //   尿量33, 净超滤48, 排出物28+28=56, 引流液28+28=56,
    //   检查28, 治疗28, 基础护理33, 健康教育33, 护理记录91, 签名27
    public static final float[] COL_WIDTHS_PT = {
        43f,        // 0: 日期时间
        85f,        // 1: 药物治疗-名称
        30f,        // 2: 药物治疗-量
        30f,        // 3: 药物治疗-途径
        85f,        // 4: 胃肠摄入-名称
        30f,        // 5: 胃肠摄入-量
        30f,        // 6: 胃肠摄入-途径
        33f,        // 7: 尿量
        48f,        // 8: 净超滤量
        28f,        // 9:  排出物-名称
        28f,        // 10: 排出物-量
        28f,        // 11: 引流液-名称
        28f,        // 12: 引流液-量
        28f,        // 13: 检查
        28f,        // 14: 治疗
        33f,        // 15: 基础护理
        33f,        // 16: 健康教育
        101f,       // 17: 护理记录
        37f         // 18: 签名
    };

    /** 表格总宽度 = 所有列宽之和，不超过页面可用宽度 */
    public static final float TABLE_WIDTH = 786f;

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
    public static final float BORDER_REMARK = 0.5f;

    // ══════════════════════════════════════════════════════════
    //  备注内容（选项之间保留空格，提升可读性）
    // ══════════════════════════════════════════════════════════
    public static final String[] REMARK_LINES = {
        "检查：A：CT B：核磁共振 C：胃镜 D：肠镜 E：超声检查 F：床旁胸片 G：心电图",
        "治疗：A：机械辅助排痰 B：气压治疗 C：雾化吸入 D：支气管镜灌洗 E：TDP照射 F：针灸治疗 G：运动治疗 H：肺复张",
        "基础护理：A：口腔护理 B：动/静脉置管护理 C：擦浴 D：会阴擦洗 E：肛周护理 F：更换引流袋 G：膀胱冲洗 H：压疮护理 I：床上洗头",
        "健康教育：A：入院指导 B：入科指导 C：疾病知识 D：药物指导 E：饮食指导 F：肢体活动指导 G：检查指导 H：安全指导 I：心理指导 J：术前指导 K：术后指导 L：转科/出院指导 M：用氧注意事项 N：通气配合指导 O：康复指导 P：VTE预防指导"
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

    /** 护理记录列索引（唯一左对齐+顶部对齐的列） */
    public static final int NURSING_RECORD_COLUMN_INDEX = 17;

    // ══════════════════════════════════════════════════════════
    //  静态校验
    // ══════════════════════════════════════════════════════════
    static {
        // 验证顶部区域坐标
        assert TOP_FIXED_HEIGHT == PAGE_TOP_PADDING + TITLE_AREA_HEIGHT + TITLE_INFO_GAP + INFO_AREA_HEIGHT + INFO_TABLE_GAP
            : "TOP_FIXED_HEIGHT must equal sum of top area components";
        assert CONTENT_TOP == PAGE_HEIGHT - MARGIN_TOP
            : "CONTENT_TOP must equal PAGE_HEIGHT - MARGIN_TOP";

        // 验证底部区域坐标
        assert CONTENT_BOTTOM == REMARK_TOP
            : "CONTENT_BOTTOM must equal REMARK_TOP";
        assert MARGIN_BOTTOM == REMARK_TOP
            : "MARGIN_BOTTOM must equal REMARK_TOP";
        assert PAGE_NUM_Y < REMARK_BOTTOM
            : "PAGE_NUM_Y must be less than REMARK_BOTTOM";
        assert REMARK_TOP == REMARK_BOTTOM + REMARK_TOTAL_HEIGHT
            : "REMARK_TOP must equal REMARK_BOTTOM + REMARK_TOTAL_HEIGHT";

        // 验证表格宽度
        float colSum = 0;
        for (float w : COL_WIDTHS_PT) colSum += w;
        assert Math.abs(colSum - TABLE_WIDTH) < 0.01f
            : "Sum of column widths must equal TABLE_WIDTH";

        // 验证表格不超出页面
        assert MARGIN_LEFT + TABLE_WIDTH <= PAGE_WIDTH - MARGIN_RIGHT
            : "Table must not exceed page right boundary";
    }
}
