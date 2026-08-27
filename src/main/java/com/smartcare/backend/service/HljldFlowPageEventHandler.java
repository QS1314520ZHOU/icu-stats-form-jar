package com.smartcare.backend.service;

import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.Event;
import com.itextpdf.kernel.events.IEventHandler;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.VerticalAlignment;
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;
import com.smartcare.backend.hljld.HljldRemarkLayout;

import java.util.List;

/**
 * 护理记录单流式 PDF 页事件处理器。
 *
 * 在每页 END_PAGE 时绘制：
 * 1. 页眉：标题（居中）+ 患者信息（左对齐）
 * 2. 备注区：左侧"备注"纵向合并4行 + 右侧4行每行合并18列
 * 3. 页码："第 N 页"
 *
 * 使用 PdfCanvas 绘制边框和线条，使用 Canvas 绘制文字。
 * 备注区使用动态高度布局（HljldRemarkLayout），确保文字和边框高度一致。
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
    private final HljldRemarkLayout remarkLayout;

    /**
     * @param font          当前 PdfDocument 的 PdfFont
     * @param patientInfo   患者信息文本
     * @param startPageNo   全局起始页码
     * @param remarkLayout  备注区动态布局（文字和边框共用同一份高度）
     */
    public HljldFlowPageEventHandler(PdfFont font, String patientInfo, int startPageNo,
                                      HljldRemarkLayout remarkLayout) {
        this.font = font;
        this.patientInfo = patientInfo == null ? "" : patientInfo;
        this.startPageNo = startPageNo;
        this.remarkLayout = remarkLayout;
    }

    /** 兼容旧调用：使用固定高度 */
    public HljldFlowPageEventHandler(PdfFont font, String patientInfo, int startPageNo) {
        this(font, patientInfo, startPageNo, null);
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

        // 使用 PdfCanvas 绘制备注区边框和线条（使用动态高度）
        drawRemarksBorders(pdfCanvas, pw);
    }

    // ══════════════════════════════════════════════════════════
    //  页眉：标题 + 患者信息（文字）
    // ══════════════════════════════════════════════════════════

    private void drawHeader(Canvas canvas, float pw, float ph) {
        // 标题：水平居中，垂直居中于标题区域
        float titleCenterY = HljldPdfLayoutConstants.TITLE_BOTTOM + HljldPdfLayoutConstants.TITLE_AREA_HEIGHT / 2f;
        canvas.showTextAligned(
            new Paragraph("重钢总医院重症医学科护理记录单")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.TITLE_FONT_SIZE)
                .setMargin(0),
            pw / 2, titleCenterY, TextAlignment.CENTER, VerticalAlignment.MIDDLE);

        // 患者信息：整体左对齐，垂直居中于患者信息区域，左边缘与表格左边缘对齐
        float infoCenterY = HljldPdfLayoutConstants.INFO_BOTTOM + HljldPdfLayoutConstants.INFO_AREA_HEIGHT / 2f;
        canvas.showTextAligned(
            new Paragraph(patientInfo)
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.INFO_FONT_SIZE)
                .setMargin(0),
            ML, infoCenterY, TextAlignment.LEFT, VerticalAlignment.MIDDLE);
    }

    // ══════════════════════════════════════════════════════════
    //  备注区文字（使用 Canvas 绘制，支持自动换行 + 动态高度）
    // ══════════════════════════════════════════════════════════

    private void drawRemarksText(Canvas canvas, float pw) {
        float remarksBottom = HljldPdfLayoutConstants.REMARK_BOTTOM;
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        // 使用动态布局计算备注高度（如果提供了 remarkLayout）
        float totalHeight;
        List<Float> rowHeights;
        List<String> texts;

        if (remarkLayout != null) {
            totalHeight = remarkLayout.getTotalHeight();
            rowHeights = remarkLayout.getRowHeights();
            texts = remarkLayout.getCompactTexts();
        } else {
            // 兼容：使用固定高度
            totalHeight = HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;
            rowHeights = new java.util.ArrayList<>();
            texts = new java.util.ArrayList<>();
            float fixedRowHeight = HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT / HljldPdfLayoutConstants.REMARK_ROWS;
            for (int i = 0; i < REMARKS.length; i++) {
                rowHeights.add(fixedRowHeight);
                texts.add(HljldRemarkLayout.compactRemarkOptions(REMARKS[i]));
            }
        }

        // "备注"文字：水平居中、垂直居中于4行
        float labelCenterY = remarksBottom + totalHeight / 2f;
        canvas.showTextAligned(
            new Paragraph("备注")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.REMARK_LABEL_FONT_SIZE)
                .setMargin(0),
            leftX + col0Width / 2f, labelCenterY,
            TextAlignment.CENTER, VerticalAlignment.MIDDLE);

        // 4行备注内容文字（从上到下：检查、治疗、基础护理、健康教育）
        // 使用动态高度计算，支持自动换行
        float textX = contentX + 2f;
        float availableWidth = HljldPdfLayoutConstants.REMARK_CONTENT_WIDTH - 4f;

        // 从下到上绘制（第一行在最上面，第四行在最下面）
        float currentY = remarksBottom;
        for (int i = texts.size() - 1; i >= 0; i--) {
            float rowHeight = rowHeights.get(i);
            String text = texts.get(i);

            // 使用矩形区域绘制文字，支持自动换行
            Rectangle textRect = new Rectangle(textX, currentY, availableWidth, rowHeight);

            try (Canvas rowCanvas = new Canvas(canvas.getPdfCanvas(), textRect)) {
                rowCanvas.showTextAligned(
                    new Paragraph(text)
                        .setFont(font)
                        .setFontSize(HljldPdfLayoutConstants.REMARK_FONT_SIZE)
                        .setMultipliedLeading(1.0f)
                        .setMargin(0),
                    0, rowHeight / 2f,
                    TextAlignment.LEFT, VerticalAlignment.MIDDLE);
            }

            currentY += rowHeight;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  备注区边框和线条（使用 PdfCanvas 绘制，动态高度）
    // ══════════════════════════════════════════════════════════

    private void drawRemarksBorders(PdfCanvas pdfCanvas, float pw) {
        float remarksBottom = HljldPdfLayoutConstants.REMARK_BOTTOM;
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        // 使用动态布局计算备注高度（如果提供了 remarkLayout）
        float totalHeight;
        List<Float> rowHeights;

        if (remarkLayout != null) {
            totalHeight = remarkLayout.getTotalHeight();
            rowHeights = remarkLayout.getRowHeights();
        } else {
            // 兼容：使用固定高度
            totalHeight = HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;
            rowHeights = new java.util.ArrayList<>();
            float fixedRowHeight = HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT / HljldPdfLayoutConstants.REMARK_ROWS;
            for (int i = 0; i < REMARKS.length; i++) {
                rowHeights.add(fixedRowHeight);
            }
        }

        float remarksTop = remarksBottom + totalHeight;

        pdfCanvas.setStrokeColor(ColorConstants.BLACK);

        // ── 外边框 ──
        pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_OUTER);
        pdfCanvas.rectangle(leftX, remarksBottom, TABLE_W, totalHeight);
        pdfCanvas.stroke();

        // ── "备注"标签单元格右边线（纵向4行合并） ──
        pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_REMARK);
        pdfCanvas.moveTo(contentX, remarksBottom);
        pdfCanvas.lineTo(contentX, remarksTop);
        pdfCanvas.stroke();

        // ── 右侧4行备注内容的横线（按实际行高累计，从第一列右边界开始） ──
        // 使用与文字完全相同的行高累计绘制横线
        float currentTop = remarksTop;
        for (int i = 0; i < rowHeights.size() - 1; i++) {
            currentTop -= rowHeights.get(i);
            pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_REMARK);
            pdfCanvas.moveTo(contentX, currentTop);
            pdfCanvas.lineTo(leftX + TABLE_W, currentTop);
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
}
