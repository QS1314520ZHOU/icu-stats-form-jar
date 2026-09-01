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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * 护理记录单流式 PDF 页事件处理器。
 *
 * 在每页 END_PAGE 时绘制：
 * 1. 页眉：标题（居中）+ 患者信息（左对齐）
 * 2. 备注区：左侧"备注"纵向合并4行 + 右侧4行每行合并18列
 * 3. 页码："第 N 页"
 *
 * 备注区支持两种位置：
 * - 普通页：固定在页面底部（REMARK_BOTTOM）
 * - 护理日最后一页：紧跟正文结束位置（动态Y坐标）
 *
 * 使用 PdfCanvas 绘制边框和线条，使用 Canvas 绘制文字。
 */
public class HljldFlowPageEventHandler implements IEventHandler {

    private static final Logger log = LoggerFactory.getLogger(HljldFlowPageEventHandler.class);

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
    /** 动态备注位置映射：键为本地物理页码，值为正文结束Y坐标 */
    private final Map<Integer, Float> dynamicRemarkTopByLocalPage;

    /**
     * @param font                       当前 PdfDocument 的 PdfFont
     * @param patientInfo                患者信息文本
     * @param startPageNo                全局起始页码
     * @param dynamicRemarkTopByLocalPage 动态备注位置映射（可变，由 DayEndMarker 在 draw 阶段更新）
     */
    public HljldFlowPageEventHandler(PdfFont font, String patientInfo, int startPageNo,
                                     Map<Integer, Float> dynamicRemarkTopByLocalPage) {
        this.font = font;
        this.patientInfo = patientInfo == null ? "" : patientInfo;
        this.startPageNo = startPageNo;
        this.dynamicRemarkTopByLocalPage = dynamicRemarkTopByLocalPage;
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

        // 计算备注区底部Y坐标
        // 如果当前页是护理日最后一页，使用动态位置；否则使用固定底部位置
        Float dynamicContentEndY = dynamicRemarkTopByLocalPage.get(localPageNumber);
        float remarksBottom;

        if (dynamicContentEndY != null) {
            // 动态位置：备注紧跟正文结束位置
            float dynamicBottom = dynamicContentEndY - HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;

            // 安全检查：确保备注不超出安全边界（允许2pt浮点误差）
            if (dynamicBottom >= HljldPdfLayoutConstants.REMARK_BOTTOM - 2f) {
                remarksBottom = dynamicBottom;
                log.debug("[hljld] 备注动态位置: localPage={}, contentEndY={}, remarksBottom={}",
                    localPageNumber, dynamicContentEndY, remarksBottom);
            } else {
                // 回退到固定底部位置
                remarksBottom = HljldPdfLayoutConstants.REMARK_BOTTOM;
                log.warn("[hljld] 备注动态位置低于安全边界，回退固定位置: localPage={}, " +
                    "dynamicBottom={}, safeBottom={}", localPageNumber, dynamicBottom, remarksBottom);
            }
        } else {
            // 固定位置：普通页备注在页面底部
            remarksBottom = HljldPdfLayoutConstants.REMARK_BOTTOM;
        }

        // 使用 PdfCanvas 绘制边框和线条
        PdfCanvas pdfCanvas = new PdfCanvas(page.newContentStreamBefore(), page.getResources(), pdfDoc);

        // 使用 Canvas 绘制文字（在内容流之上）
        try (Canvas canvas = new Canvas(pdfCanvas, new Rectangle(0, 0, pw, ph))) {
            drawHeader(canvas, pw, ph);
            drawRemarksText(canvas, pdfCanvas, pw, remarksBottom);
            drawPageNumber(canvas, pw, globalPageNumber);
        }

        // 使用 PdfCanvas 绘制备注区边框和线条
        drawRemarksBorders(pdfCanvas, pw, remarksBottom);
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
    //  备注区文字（使用 Canvas 绘制）
    // ══════════════════════════════════════════════════════════

    private void drawRemarksText(Canvas canvas, PdfCanvas pdfCanvas, float pw, float remarksBottom) {
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        // "备注"文字：水平居中、垂直居中于4行
        float remarksTop = remarksBottom + HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;
        float labelCenterY = remarksBottom + HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT / 2f;
        canvas.showTextAligned(
            new Paragraph("备注")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.REMARK_LABEL_FONT_SIZE)
                .setMargin(0),
            leftX + col0Width / 2f, labelCenterY,
            TextAlignment.CENTER, VerticalAlignment.MIDDLE);

        // 4行备注内容文字（从上到下：检查、治疗、基础护理、健康教育）
        // 使用 PdfCanvas.beginText() 直接绘制文字，确保精确定位
        float textX = contentX + 4f;

        for (int i = 0; i < REMARKS.length; i++) {
            // 从上到下绘制：第一行在最上面，第四行在最下面
            // 计算当前行的底部Y坐标
            float rowBottom = remarksBottom + (REMARKS.length - 1 - i) * HljldPdfLayoutConstants.REMARK_ROW_HEIGHT;
            // 计算文字Y坐标（使用行中心偏下一点，确保文字在行内垂直居中）
            float textY = rowBottom + HljldPdfLayoutConstants.REMARK_ROW_HEIGHT / 2f - 1f;

            // 每行文字单独绘制，确保精确定位
            pdfCanvas.saveState();
            pdfCanvas.setFillColor(ColorConstants.BLACK);
            pdfCanvas.beginText();
            pdfCanvas.setFontAndSize(font, HljldPdfLayoutConstants.REMARK_FONT_SIZE);
            pdfCanvas.moveText(textX, textY);
            pdfCanvas.showText(REMARKS[i]);
            pdfCanvas.endText();
            pdfCanvas.restoreState();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  备注区边框和线条（使用 PdfCanvas 绘制）
    // ══════════════════════════════════════════════════════════

    private void drawRemarksBorders(PdfCanvas pdfCanvas, float pw, float remarksBottom) {
        float remarksTop = remarksBottom + HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        pdfCanvas.setStrokeColor(ColorConstants.BLACK);

        // ── 外边框 ──
        pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_OUTER);
        pdfCanvas.rectangle(leftX, remarksBottom, TABLE_W, HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT);
        pdfCanvas.stroke();

        // ── "备注"标签单元格右边线（纵向4行合并） ──
        pdfCanvas.setLineWidth(HljldPdfLayoutConstants.BORDER_REMARK);
        pdfCanvas.moveTo(contentX, remarksBottom);
        pdfCanvas.lineTo(contentX, remarksTop);
        pdfCanvas.stroke();

        // ── 右侧4行备注内容的横线（从第一列右边界开始，不穿过左侧"备注"单元格） ──
        for (int i = 1; i < REMARKS.length; i++) {
            float lineY = remarksBottom + i * HljldPdfLayoutConstants.REMARK_ROW_HEIGHT;
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
}
