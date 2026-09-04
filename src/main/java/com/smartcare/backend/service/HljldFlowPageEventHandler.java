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
import com.smartcare.backend.hljld.HljldPdfFooterPolicy;
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * 护理记录单流式 PDF 页事件处理器。
 *
 * <p>在每页 END_PAGE 时绘制：</p>
 * <ol>
 *   <li>页眉：标题（居中）+ 患者信息（左对齐）— 每页必绘</li>
 *   <li>页码："第 N 页" — 每页必绘</li>
 *   <li>备注区 + 审核护士签名 — 仅在本次输出的最后一个物理页，且
 *       {@link HljldPdfFooterPolicy} 要求时绘制</li>
 * </ol>
 *
 * <p>中间页不绘制备注区和审核护士签名，但仍保留底部预留空间以确保分页一致。</p>
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
    private final HljldPdfFontBundle fonts;
    private final PdfFont font;
    private final String patientInfo;
    private final int startPageNo;
    /** 动态备注位置映射：键为本地物理页码，值为正文结束Y坐标 */
    private final Map<Integer, Float> dynamicRemarkTopByLocalPage;
    /** 本次输出的总物理页数（用于判断最终页） */
    private final int totalPages;
    /** 页脚渲染策略 */
    private final HljldPdfFooterPolicy policy;

    /**
     * @param fonts                       字体包（支持 Unicode 下标/上标回退）
     * @param patientInfo                 患者信息文本
     * @param startPageNo                 全局起始页码
     * @param dynamicRemarkTopByLocalPage 动态备注位置映射（可变，由 DayEndMarker 在 draw 阶段更新）
     * @param totalPages                  本次输出的总物理页数
     * @param policy                      页脚渲染策略（决定是否在最终页绘制备注和签名）
     */
    public HljldFlowPageEventHandler(HljldPdfFontBundle fonts, String patientInfo, int startPageNo,
                                     Map<Integer, Float> dynamicRemarkTopByLocalPage,
                                     int totalPages, HljldPdfFooterPolicy policy) {
        this.fonts = fonts;
        this.font = fonts.getPrimaryFont();
        this.patientInfo = patientInfo == null ? "" : patientInfo;
        this.startPageNo = startPageNo;
        this.dynamicRemarkTopByLocalPage = dynamicRemarkTopByLocalPage;
        this.totalPages = totalPages;
        this.policy = policy;
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

        // 判断是否为最终页
        boolean isFinalPage;
        if (totalPages > 0) {
            isFinalPage = (localPageNumber == totalPages);
        } else {
            // 兼容旧模式：无 totalPages 时使用动态位置判断
            isFinalPage = dynamicRemarkTopByLocalPage.containsKey(localPageNumber);
        }

        // 是否在最终页绘制备注和签名
        boolean drawRemark = isFinalPage && policy != null && policy.isShowRemarkOnFinalPage();
        boolean drawSignature = isFinalPage && policy != null && policy.isShowAuditSignatureOnFinalPage();

        // 计算备注区底部Y坐标（仅绘制时需要）
        float remarksBottom = HljldPdfLayoutConstants.REMARK_BOTTOM;
        if (drawRemark) {
            Float dynamicContentEndY = dynamicRemarkTopByLocalPage.get(localPageNumber);
            if (dynamicContentEndY != null) {
                float dynamicBottom = dynamicContentEndY - HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;
                if (dynamicBottom >= HljldPdfLayoutConstants.REMARK_BOTTOM - 2f) {
                    remarksBottom = dynamicBottom;
                    log.debug("[hljld] 备注动态位置: localPage={}, contentEndY={}, remarksBottom={}",
                        localPageNumber, dynamicContentEndY, remarksBottom);
                } else {
                    log.warn("[hljld] 备注动态位置低于安全边界，回退固定位置: localPage={}, " +
                        "dynamicBottom={}, safeBottom={}", localPageNumber, dynamicBottom, remarksBottom);
                }
            }
        }

        // 使用 PdfCanvas 绘制边框和线条
        PdfCanvas pdfCanvas = new PdfCanvas(page.newContentStreamBefore(), page.getResources(), pdfDoc);

        // 使用 Canvas 绘制文字（在内容流之上）
        try (Canvas canvas = new Canvas(pdfCanvas, new Rectangle(0, 0, pw, ph))) {
            drawHeader(canvas, pw, ph);
            drawPageNumber(canvas, pw, globalPageNumber);

            // 仅最终页且策略要求时绘制备注
            if (drawRemark) {
                drawRemarksText(canvas, pdfCanvas, pw, remarksBottom);
            }

            // 仅最终页且策略要求时绘制审核护士签名
            if (drawSignature) {
                drawAuditNurseSignature(canvas, pw, drawRemark, remarksBottom);
            }
        }

        // 仅最终页且策略要求时绘制备注区边框
        if (drawRemark) {
            drawRemarksBorders(pdfCanvas, pw, remarksBottom);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  页眉：标题 + 患者信息（文字）
    // ══════════════════════════════════════════════════════════

    private void drawHeader(Canvas canvas, float pw, float ph) {
        // 标题：水平居中，垂直居中于标题区域（静态中文，使用主字体即可）
        float titleCenterY = HljldPdfLayoutConstants.TITLE_BOTTOM + HljldPdfLayoutConstants.TITLE_AREA_HEIGHT / 2f;
        canvas.showTextAligned(
            new Paragraph("重钢总医院重症医学科护理记录单")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.TITLE_FONT_SIZE)
                .setMargin(0),
            pw / 2, titleCenterY, TextAlignment.CENTER, VerticalAlignment.MIDDLE);

        // 患者信息：使用富文本渲染，支持 Unicode 下标/上标
        float infoCenterY = HljldPdfLayoutConstants.INFO_BOTTOM + HljldPdfLayoutConstants.INFO_AREA_HEIGHT / 2f;
        Paragraph infoParagraph = HljldPdfTextRenderer.createParagraph(
            patientInfo,
            fonts,
            HljldPdfLayoutConstants.INFO_FONT_SIZE,
            TextAlignment.LEFT
        );
        infoParagraph.setMargin(0);
        canvas.showTextAligned(
            infoParagraph,
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
    //  审核护士签名
    // ══════════════════════════════════════════════════════════

    /**
     * 绘制审核护士签名区。
     * <p>位于页脚右下角，右边界与主表格右边界对齐，文字右对齐。
     * 当备注区存在时，签名位于备注区下方；否则位于页脚右下角。</p>
     *
     * @param canvas       Canvas 绘制上下文
     * @param pw           页面宽度
     * @param hasRemark    本页是否同时绘制了备注区
     * @param remarksBottom 备注区底部 Y 坐标（hasRemark 时有效）
     */
    private void drawAuditNurseSignature(Canvas canvas, float pw, boolean hasRemark, float remarksBottom) {
        float rightX = ML + TABLE_W;
        float sigY;
        if (hasRemark) {
            sigY = remarksBottom + HljldPdfLayoutConstants.AUDIT_SIG_BELOW_REMARK_OFFSET;
        } else {
            sigY = HljldPdfLayoutConstants.AUDIT_SIG_Y_BASE;
        }

        canvas.showTextAligned(
            new Paragraph(HljldPdfLayoutConstants.AUDIT_SIG_TEXT)
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.AUDIT_SIG_FONT_SIZE)
                .setMargin(0),
            rightX, sigY, TextAlignment.RIGHT);
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
