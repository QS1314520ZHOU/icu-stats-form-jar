package com.smartcare.backend.service;

import com.itextpdf.kernel.events.Event;
import com.itextpdf.kernel.events.IEventHandler;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;

/**
 * 护理记录单流式PDF页事件处理器。
 * 在每页 END_PAGE 时绘制：
 * - 页眉（标题 + 患者信息）
 * - 备注区（19列对齐，4行）
 * - 页码
 *
 * 所有绘制区域在 Document 边距之外，不与主 Table 重叠。
 */
public class HljldFlowPageEventHandler implements IEventHandler {

    // ── 由 HljldFlowPdfService 传入的常量 ──
    private final PdfFont font;
    private final String patientInfo;
    private final int totalPages;
    private final int startPageNo;

    // ── 页面尺寸 ──
    static final float PAGE_WIDTH = 842f;   // A4横向 297mm
    static final float PAGE_HEIGHT = 595f;  // A4横向 210mm
    static final float MARGIN_LEFT = 10f;
    static final float MARGIN_RIGHT = 10f;

    // ── 页眉区域 (页面顶部) ──
    static final float HEADER_TOP = PAGE_HEIGHT - 10f;       // 标题Y起始
    static final float TITLE_FONT_SIZE = 14f;
    static final float INFO_FONT_SIZE = 9f;
    static final float HEADER_HEIGHT = 36f;                   // 标题+患者信息总占高

    // ── 页脚区域 (页面底部) ──
    static final float REMARK_FONT_SIZE = 6.5f;
    static final float REMARK_LABEL_FONT_SIZE = 8f;
    static final float REMARK_ROW_HEIGHT = 13f;
    static final int REMARK_ROWS = 4;
    static final float REMARK_TOTAL_HEIGHT = REMARK_ROW_HEIGHT * REMARK_ROWS + 4f; // ~56pt
    static final float PAGE_NUMBER_HEIGHT = 16f;
    static final float FOOTER_TOTAL_HEIGHT = REMARK_TOTAL_HEIGHT + PAGE_NUMBER_HEIGHT; // ~72pt

    // ── 内容区域 ──
    static final float CONTENT_TOP = HEADER_TOP - HEADER_HEIGHT;      // 表格起始Y
    static final float CONTENT_BOTTOM = FOOTER_TOTAL_HEIGHT + 4f;     // 备注+页码+间距

    // ── 19列宽度 ──
    static final float[] COL_WIDTHS_PT = {
        50f, 100f, 30f, 30f, 100f, 30f, 30f, 30f, 30f,
        30f, 30f, 30f, 30f, 30f, 30f, 30f, 30f, 150f, 30f
    };

    // ── 备注内容 ──
    static final String[] REMARK_LINES = {
        "检查：A：CT  B：核磁共振  C：胃镜  D：肠镜  E：超声检查  F：床旁胸片  G：心电图",
        "治疗：A：机械辅助排痰  B：气压治疗  C：雾化吸入  D：支气管镜灌洗  E：TDP照射  F：针灸治疗  G：运动治疗  H：肺复张",
        "基础护理：A：口腔护理  B：动/静脉置管护理  C：擦浴  D：会阴擦洗  E：肛周护理  F：更换引流袋  G：膀胱冲洗  H：压疮护理  I：床上洗头",
        "健康教育：A：入院指导  B：入科指导  C：疾病知识  D：药物指导  E：饮食指导  F：肢体活动指导  G：检查指导  H：安全指导  I：心理指导  J：术前指导  K：术后指导  L：转科/出院指导  M：用氧注意事项  N：通气配合指导  O：康复指导  P：VTE预防指导"
    };

    /**
     * @param font        PdfFont（属于当前 PdfDocument）
     * @param patientInfo 患者信息行（截断为一行）
     * @param totalPages  本次PDF总页数（两遍渲染后确定）
     * @param startPageNo 全局起始页码
     */
    public HljldFlowPageEventHandler(PdfFont font, String patientInfo, int totalPages, int startPageNo) {
        this.font = font;
        this.patientInfo = truncate(patientInfo, 80);
        this.totalPages = totalPages;
        this.startPageNo = startPageNo;
    }

    @Override
    public void handleEvent(Event event) {
        PdfDocumentEvent docEvent = (PdfDocumentEvent) event;
        if (!PdfDocumentEvent.END_PAGE.equals(docEvent.getType())) return;

        PdfDocument pdfDoc = docEvent.getDocument();
        int localPageNumber = pdfDoc.getPageNumber(docEvent.getPage());
        int globalPageNumber = startPageNo + localPageNumber - 1;

        Rectangle pageSize = docEvent.getPage().getPageSize();
        float pw = pageSize.getWidth();
        float ph = pageSize.getHeight();

        try (Canvas canvas = new Canvas(docEvent.getPage(),
                new Rectangle(0, 0, pw, ph))) {

            // ═══ 页眉 ═══
            drawHeader(canvas, pw, ph);

            // ═══ 备注区 ═══
            drawRemarks(canvas, pw);

            // ═══ 页码 ═══
            drawPageNumber(canvas, pw, globalPageNumber);
        }
    }

    private void drawHeader(Canvas canvas, float pw, float ph) {
        // 标题
        float titleY = ph - 14f;
        canvas.showTextAligned(
            new Paragraph("重钢总医院重症医学科护理记录单")
                .setFont(font).setFontSize(TITLE_FONT_SIZE),
            pw / 2, titleY, TextAlignment.CENTER);

        // 患者信息（限制为一行）
        float infoY = titleY - 18f;
        canvas.showTextAligned(
            new Paragraph(patientInfo)
                .setFont(font).setFontSize(INFO_FONT_SIZE),
            pw / 2, infoY, TextAlignment.CENTER);
    }

    private void drawRemarks(Canvas canvas, float pw) {
        // 备注区Y坐标：从页码上方开始
        float baseY = PAGE_NUMBER_HEIGHT + 8f;
        float labelX = MARGIN_LEFT + 20f;  // 标签居中
        float contentX = MARGIN_LEFT + 45f; // 内容起始X

        // 备注标签 "备注" (垂直居中于4行)
        float labelY = baseY + REMARK_TOTAL_HEIGHT / 2;
        canvas.showTextAligned(
            new Paragraph("备注").setFont(font).setFontSize(REMARK_LABEL_FONT_SIZE),
            labelX, labelY, TextAlignment.CENTER);

        // 4行备注内容（从下往上绘制）
        for (int i = 0; i < REMARK_LINES.length; i++) {
            float lineY = baseY + i * REMARK_ROW_HEIGHT + REMARK_ROW_HEIGHT / 2;
            canvas.showTextAligned(
                new Paragraph(REMARK_LINES[i]).setFont(font).setFontSize(REMARK_FONT_SIZE),
                contentX, lineY, TextAlignment.LEFT);
        }
    }

    private void drawPageNumber(Canvas canvas, float pw, int globalPageNumber) {
        float footerY = 4f;
        canvas.showTextAligned(
            new Paragraph(String.format("第 %d / %d 页", globalPageNumber, totalPages))
                .setFont(font).setFontSize(10f),
            pw / 2, footerY, TextAlignment.CENTER);
    }

    /**
     * 截断患者信息为一行，避免覆盖表格
     */
    private static String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "...";
    }
}
