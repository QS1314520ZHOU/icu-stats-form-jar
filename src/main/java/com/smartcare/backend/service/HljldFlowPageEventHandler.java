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
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.VerticalAlignment;
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;

/**
 * 护理记录单流式 PDF 页事件处理器。
 *
 * 在每页 END_PAGE 时绘制：
 * 1. 页眉：标题（居中）+ 患者信息（左对齐）
 * 2. 备注区：19列表格结构，4行，与数据表共享列宽
 * 3. 页码："第 N 页"
 *
 * 使用 PdfCanvas 绘制边框和线条，使用 Canvas 绘制文字。
 */
public class HljldFlowPageEventHandler implements IEventHandler {

    // ── 引用布局常量 ──
    private static final float PW = HljldPdfLayoutConstants.PAGE_WIDTH;
    private static final float PH = HljldPdfLayoutConstants.PAGE_HEIGHT;
    private static final float ML = HljldPdfLayoutConstants.MARGIN_LEFT;
    private static final float[] COL_W = HljldPdfLayoutConstants.COL_WIDTHS_PT;
    private static final float TABLE_W = HljldPdfLayoutConstants.TABLE_WIDTH;
    private static final String[] REMARKS = HljldPdfLayoutConstants.REMARK_LINES;

    // ── 构造参数 ──
    private final PdfFont font;
    private final String patientInfo;
    private final int startPageNo;

    /**
     * @param font        当前 PdfDocument 的 PdfFont
     * @param patientInfo 患者信息文本
     * @param startPageNo 全局起始页码
     */
    public HljldFlowPageEventHandler(PdfFont font, String patientInfo, int startPageNo) {
        this.font = font;
        this.patientInfo = truncate(patientInfo, 120);
        this.startPageNo = startPageNo;
    }

    @Override
    public void handleEvent(Event event) {
        PdfDocumentEvent docEvent = (PdfDocumentEvent) event;
        if (!PdfDocumentEvent.END_PAGE.equals(docEvent.getType())) return;

        PdfDocument pdfDoc = docEvent.getDocument();
        PdfPage page = docEvent.getPage();
        int localPageNumber = pdfDoc.getPageNumber(page);
        int globalPageNumber = startPageNo + localPageNumber - 1;

        Rectangle pageSize = page.getPageSize();
        float pw = pageSize.getWidth();
        float ph = pageSize.getHeight();

        // 使用 PdfCanvas 绘制边框和线条
        PdfCanvas pdfCanvas = new PdfCanvas(page.newContentStreamBefore(), page.getResources(), pdfDoc);

        // 使用 Canvas 绘制文字（在内容流之上）
        try (Canvas canvas = new Canvas(pdfCanvas, new Rectangle(0, 0, pw, ph))) {
            drawHeader(canvas, pw, ph);
            drawRemarksText(canvas, pw);
            drawPageNumber(canvas, pw, globalPageNumber);
        }

        // 使用 PdfCanvas 绘制备注区边框和线条
        drawRemarksBorders(pdfCanvas, pw);
    }

    // ══════════════════════════════════════════════════════════
    //  页眉：标题 + 患者信息（文字）
    // ══════════════════════════════════════════════════════════

    private void drawHeader(Canvas canvas, float pw, float ph) {
        // 标题：水平居中
        float titleY = ph - HljldPdfLayoutConstants.TITLE_Y_OFFSET;
        canvas.showTextAligned(
            new Paragraph("重钢总医院重症医学科护理记录单")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.TITLE_FONT_SIZE)
                .setMargin(0),
            pw / 2, titleY, TextAlignment.CENTER);

        // 患者信息：整体左对齐，从表格左边界开始
        float infoY = ph - HljldPdfLayoutConstants.INFO_Y_OFFSET;
        canvas.showTextAligned(
            new Paragraph(patientInfo)
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.INFO_FONT_SIZE)
                .setMargin(0),
            ML, infoY, TextAlignment.LEFT);
    }

    // ══════════════════════════════════════════════════════════
    //  备注区文字（使用 Canvas 绘制）
    // ══════════════════════════════════════════════════════════

    private void drawRemarksText(Canvas canvas, float pw) {
        float remarksBottom = 0;
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        // "备注"文字：水平居中、垂直居中于4行
        float labelCenterY = HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT / 2;
        canvas.showTextAligned(
            new Paragraph("备注")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.REMARK_LABEL_FONT_SIZE)
                .setMargin(0),
            leftX + col0Width / 2, labelCenterY,
            TextAlignment.CENTER, VerticalAlignment.MIDDLE);

        // 4行备注内容文字
        for (int i = 0; i < REMARKS.length; i++) {
            float rowBottom = i * HljldPdfLayoutConstants.REMARK_ROW_HEIGHT;
            float textY = rowBottom + HljldPdfLayoutConstants.REMARK_ROW_HEIGHT / 2;
            canvas.showTextAligned(
                new Paragraph(REMARKS[i])
                    .setFont(font)
                    .setFontSize(HljldPdfLayoutConstants.REMARK_FONT_SIZE)
                    .setMargin(0),
                contentX + 2, textY,
                TextAlignment.LEFT, VerticalAlignment.MIDDLE);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  备注区边框和线条（使用 PdfCanvas 绘制）
    // ══════════════════════════════════════════════════════════

    private void drawRemarksBorders(PdfCanvas pdfCanvas, float pw) {
        float remarksBottom = 0;
        float remarksTop = HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        pdfCanvas.setStrokeColor(ColorConstants.BLACK);
        pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_OUTER);

        // ── 外边框 ──
        pdfCanvas.rectangle(leftX, remarksBottom, TABLE_W, remarksTop);
        pdfCanvas.stroke();

        // ── "备注"标签单元格右边线（纵向4行合并） ──
        pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_REMARK);
        pdfCanvas.moveTo(contentX, remarksBottom);
        pdfCanvas.lineTo(contentX, remarksTop);
        pdfCanvas.stroke();

        // ── 右侧4行备注内容的横线（从第一列右边界开始） ──
        for (int i = 1; i < REMARKS.length; i++) {
            float lineY = i * HljldPdfLayoutConstants.REMARK_ROW_HEIGHT;
            pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_REMARK);
            pdfCanvas.moveTo(contentX, lineY);
            pdfCanvas.lineTo(leftX + TABLE_W, lineY);
            pdfCanvas.stroke();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  页码：只显示"第 N 页"
    // ══════════════════════════════════════════════════════════

    private void drawPageNumber(Canvas canvas, float pw, int globalPageNumber) {
        canvas.showTextAligned(
            new Paragraph(String.format("第 %d 页", globalPageNumber))
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.PAGE_NUM_FONT_SIZE)
                .setMargin(0),
            pw / 2, HljldPdfLayoutConstants.PAGE_NUM_Y, TextAlignment.CENTER);
    }

    // ══════════════════════════════════════════════════════════
    //  工具方法
    // ══════════════════════════════════════════════════════════

    private static String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "...";
    }
}
