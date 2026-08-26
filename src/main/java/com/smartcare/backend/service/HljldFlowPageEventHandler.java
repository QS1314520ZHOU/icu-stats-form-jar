package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.Event;
import com.itextpdf.kernel.events.IEventHandler;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;

/**
 * 护理记录单流式PDF页事件处理器。
 * 负责在每页绘制页眉（标题+患者信息）和页脚（页码）。
 * 备注区通过 setFixedPosition 添加到首页底部。
 */
public class HljldFlowPageEventHandler implements IEventHandler {

    private final PdfFont font;
    private final String patientInfo;
    private final float margin;
    private final String[] remarkLines;

    // 标题和患者信息字号
    private static final float HEADER_TITLE_FONT_SIZE = 14f;
    private static final float HEADER_INFO_FONT_SIZE = 9f;
    private static final float FOOTER_FONT_SIZE = 10f;
    private static final float REMARK_FONT_SIZE = 6f;

    // 页面常量
    private static final float PAGE_WIDTH = 842f;  // A4横向
    private static final float PAGE_HEIGHT = 595f;

    // 备注内容
    private static final String[] DEFAULT_REMARK_LINES = {
        "检查：A：CT  B：核磁共振  C：胃镜  D：肠镜  E：超声检查  F：床旁胸片  G：心电图",
        "治疗：A：机械辅助排痰  B：气压治疗  C：雾化吸入  D：支气管镜灌洗  E：TDP照射  F：针灸治疗  G：运动治疗  H：肺复张",
        "基础护理：A：口腔护理  B：动/静脉置管护理  C：擦浴  D：会阴擦洗  E：肛周护理  F：更换引流袋  G：膀胱冲洗  H：压疮护理  I：床上洗头",
        "健康教育：A：入院指导  B：入科指导  C：疾病知识  D：药物指导  E：饮食指导  F：肢体活动指导  G：检查指导  H：安全指导  I：心理指导  J：术前指导  K：术后指导  L：转科/出院指导  M：用氧注意事项  N：通气配合指导  O：康复指导  P：VTE预防指导"
    };

    /**
     * @param font           PdfFont 实例（属于当前 PdfDocument）
     * @param patientInfo    患者信息行文本
     * @param margin         页边距
     */
    public HljldFlowPageEventHandler(PdfFont font, String patientInfo, float margin) {
        this.font = font;
        this.patientInfo = patientInfo;
        this.margin = margin;
        this.remarkLines = DEFAULT_REMARK_LINES;
    }

    @Override
    public void handleEvent(Event event) {
        PdfDocumentEvent docEvent = (PdfDocumentEvent) event;
        PdfDocument pdfDoc = docEvent.getDocument();

        // iText 7.2.5: 使用 PdfDocumentEvent.END_PAGE 常量比较
        if (PdfDocumentEvent.END_PAGE.equals(docEvent.getType())) {
            int pageNumber = pdfDoc.getPageNumber(docEvent.getPage());
            int totalPages = pdfDoc.getNumberOfPages();

            // 在页面上绘制
            Rectangle pageSize = docEvent.getPage().getPageSize();
            float pageWidth = pageSize.getWidth();
            float pageHeight = pageSize.getHeight();

            try (Canvas canvas = new Canvas(docEvent.getPage(), new Rectangle(margin, margin,
                    pageWidth - 2 * margin, pageHeight - 2 * margin))) {

                // ===== 页眉：标题（居中） =====
                float titleY = pageHeight - margin - 10f;
                canvas.showTextAligned(
                    new Paragraph("重钢总医院重症医学科护理记录单")
                        .setFont(font).setFontSize(HEADER_TITLE_FONT_SIZE),
                    pageWidth / 2, titleY, TextAlignment.CENTER);

                // ===== 页眉：患者信息（居中，标题下方） =====
                float infoY = titleY - 18f;
                canvas.showTextAligned(
                    new Paragraph(patientInfo)
                        .setFont(font).setFontSize(HEADER_INFO_FONT_SIZE),
                    pageWidth / 2, infoY, TextAlignment.CENTER);

                // ===== 页脚：页码（居中） =====
                float footerY = margin - 5f;
                canvas.showTextAligned(
                    new Paragraph(String.format("第 %d / %d 页", pageNumber, totalPages))
                        .setFont(font).setFontSize(FOOTER_FONT_SIZE),
                    pageWidth / 2, footerY, TextAlignment.CENTER);
            }
        }
    }
}
