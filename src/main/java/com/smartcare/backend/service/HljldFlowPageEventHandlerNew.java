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
import com.smartcare.backend.hljld.HljldPdfFooterPolicyNew;
import com.smartcare.backend.hljld.HljldPdfLayoutConstantsNew;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * 护理记录单流式 PDF 页事件处理器（/form/hljldFormPDFNew 专用）。
 *
 * <p>在每页 END_PAGE 时绘制：</p>
 * <ol>
 *   <li>页眉：标题（居中）+ 患者信息（左对齐）— 每页必绘</li>
 *   <li>页码："第 N 页" — 每页必绘</li>
 *   <li>备注区 + 审核护士签名 — 仅在本次输出的最后一个物理页，且
 *       {@link HljldPdfFooterPolicyNew} 要求时绘制</li>
 * </ol>
 *
 * <p>中间页不绘制备注区和审核护士签名，但仍保留底部预留空间以确保分页一致。</p>
 */
public class HljldFlowPageEventHandlerNew implements IEventHandler {

    private static final Logger log = LoggerFactory.getLogger(HljldFlowPageEventHandlerNew.class);

    // ── 引用布局常量 ──
    private static final float PW = HljldPdfLayoutConstantsNew.PAGE_WIDTH;
    private static final float PH = HljldPdfLayoutConstantsNew.PAGE_HEIGHT;
    private static final float ML = HljldPdfLayoutConstantsNew.MARGIN_LEFT;
    private static final float[] COL_W = HljldPdfLayoutConstantsNew.COL_WIDTHS_PT;
    private static final float TABLE_W = HljldPdfLayoutConstantsNew.TABLE_WIDTH;
    private static final String[] REMARKS = HljldPdfLayoutConstantsNew.REMARK_LINES;

    /** 备注区最小可用空间（pt），低于此值跳过备注强制分页效果 */
    private static final float MIN_SPACE_FOR_REMARKS = 35f;
    /** 备注行最小高度（压缩下限） */
    private static final float REMARK_MIN_ROW_HEIGHT = 7f;

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
    private final HljldPdfFooterPolicyNew policy;

    /**
     * @param fonts                       字体包（支持 Unicode 下标/上标回退）
     * @param patientInfo                 患者信息文本
     * @param startPageNo                 全局起始页码
     * @param dynamicRemarkTopByLocalPage 动态备注位置映射（可变，由 DayEndMarker 在 draw 阶段更新）
     * @param totalPages                  本次输出的总物理页数
     * @param policy                      页脚渲染策略（决定是否在最终页绘制备注和签名）
     */
    public HljldFlowPageEventHandlerNew(HljldPdfFontBundle fonts, String patientInfo, int startPageNo,
                                        Map<Integer, Float> dynamicRemarkTopByLocalPage,
                                        int totalPages, HljldPdfFooterPolicyNew policy) {
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

        log.debug("[hljld-new] END_PAGE: localPage={}, totalPages={}, isFinalPage={}, drawRemark={}, drawSignature={}, policy={}",
            localPageNumber, totalPages, isFinalPage, drawRemark, drawSignature, policy);

        // ── 动态备注定位 + 空间判断（最终页） ──
        float remarksBottom = HljldPdfLayoutConstantsNew.REMARK_BOTTOM;
        float remarkRowHeight = HljldPdfLayoutConstantsNew.REMARK_ROW_HEIGHT;
        float remarkFontSize = HljldPdfLayoutConstantsNew.REMARK_FONT_SIZE;

        if (drawRemark) {
            Float dynamicContentEndY = dynamicRemarkTopByLocalPage.get(localPageNumber);
            if (dynamicContentEndY != null) {
                // 可用空间 = 内容结束位置 - 安全边界（页码区顶部）
                float safeBottom = HljldPdfLayoutConstantsNew.PAGE_BOTTOM_PADDING
                    + HljldPdfLayoutConstantsNew.PAGE_NUMBER_HEIGHT
                    + HljldPdfLayoutConstantsNew.PAGE_NUMBER_REMARK_GAP;
                float availableSpace = dynamicContentEndY - safeBottom;

                if (availableSpace >= HljldPdfLayoutConstantsNew.REMARK_TOTAL_HEIGHT) {
                    // 空间充足（>= 52pt）：正常显示
                    float dynamicBottom = dynamicContentEndY - HljldPdfLayoutConstantsNew.REMARK_TOTAL_HEIGHT;
                    if (dynamicBottom >= safeBottom) {
                        remarksBottom = dynamicBottom;
                        log.debug("[hljld-new] 备注动态位置: localPage={}, contentEndY={}, remarksBottom={}",
                            localPageNumber, dynamicContentEndY, remarksBottom);
                    }
                } else if (availableSpace >= MIN_SPACE_FOR_REMARKS) {
                    // 空间 35~52pt：压缩行高和字号适应
                    remarkRowHeight = Math.max(REMARK_MIN_ROW_HEIGHT,
                        availableSpace / HljldPdfLayoutConstantsNew.REMARK_ROWS);
                    remarkFontSize = Math.max(3.5f, remarkRowHeight * 0.55f);
                    // 备注紧贴内容底部，签名在备注下方
                    remarksBottom = safeBottom;
                    log.debug("[hljld-new] 备注压缩: localPage={}, rowH={}, fontSize={}, availableSpace={}",
                        localPageNumber, String.format("%.1f", remarkRowHeight),
                        String.format("%.1f", remarkFontSize),
                        String.format("%.1f", availableSpace));
                } else {
                    // 空间 < 35pt：回退固定位置（可能与内容有轻微重叠，但保证备注可见）
                    remarksBottom = HljldPdfLayoutConstantsNew.REMARK_BOTTOM;
                    log.info("[hljld-new] 备注空间不足回退固定位置: localPage={}, availableSpace={}",
                        localPageNumber, String.format("%.1f", availableSpace));
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
                drawRemarksText(canvas, pdfCanvas, pw, remarksBottom, remarkRowHeight, remarkFontSize);
            }

            // 仅最终页且策略要求时绘制审核护士签名
            if (drawSignature) {
                drawAuditNurseSignature(canvas, pw, drawRemark, remarksBottom);
            }
        }

        // 仅最终页且策略要求时绘制备注区边框
        if (drawRemark) {
            drawRemarksBorders(pdfCanvas, pw, remarksBottom, remarkRowHeight);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  页眉：标题 + 患者信息（文字）
    // ══════════════════════════════════════════════════════════

    private void drawHeader(Canvas canvas, float pw, float ph) {
        // 标题：水平居中，垂直居中于标题区域（静态中文，使用主字体即可）
        float titleCenterY = HljldPdfLayoutConstantsNew.TITLE_BOTTOM + HljldPdfLayoutConstantsNew.TITLE_AREA_HEIGHT / 2f;
        canvas.showTextAligned(
            new Paragraph("重钢总医院重症医学科护理记录单")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstantsNew.TITLE_FONT_SIZE)
                .setMargin(0),
            pw / 2, titleCenterY, TextAlignment.CENTER, VerticalAlignment.MIDDLE);

        // 患者信息：使用富文本渲染，支持 Unicode 下标/上标
        float infoCenterY = HljldPdfLayoutConstantsNew.INFO_BOTTOM + HljldPdfLayoutConstantsNew.INFO_AREA_HEIGHT / 2f;
        Paragraph infoParagraph = HljldPdfTextRenderer.createParagraph(
            patientInfo,
            fonts,
            HljldPdfLayoutConstantsNew.INFO_FONT_SIZE,
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

    private void drawRemarksText(Canvas canvas, PdfCanvas pdfCanvas, float pw, float remarksBottom,
                                  float rowHeight, float fontSize) {
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        // "备注"文字：水平居中、垂直居中于所有行
        float remarkTotalHeight = rowHeight * REMARKS.length;
        float labelCenterY = remarksBottom + remarkTotalHeight / 2f;
        canvas.showTextAligned(
            new Paragraph("备注")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstantsNew.REMARK_LABEL_FONT_SIZE)
                .setMargin(0),
            leftX + col0Width / 2f, labelCenterY,
            TextAlignment.CENTER, VerticalAlignment.MIDDLE);

        // 备注内容文字（从上到下：检查、治疗、基础护理、健康教育）
        float textX = contentX + 4f;

        for (int i = 0; i < REMARKS.length; i++) {
            // 从上到下绘制：第一行在最上面，第四行在最下面
            float rowBottom = remarksBottom + (REMARKS.length - 1 - i) * rowHeight;
            float textY = rowBottom + rowHeight / 2f - 1f;

            pdfCanvas.saveState();
            pdfCanvas.setFillColor(ColorConstants.BLACK);
            pdfCanvas.beginText();
            pdfCanvas.setFontAndSize(font, fontSize);
            pdfCanvas.moveText(textX, textY);
            pdfCanvas.showText(REMARKS[i]);
            pdfCanvas.endText();
            pdfCanvas.restoreState();
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
            sigY = remarksBottom + HljldPdfLayoutConstantsNew.AUDIT_SIG_BELOW_REMARK_OFFSET;
        } else {
            sigY = HljldPdfLayoutConstantsNew.AUDIT_SIG_Y_BASE;
        }

        canvas.showTextAligned(
            new Paragraph(HljldPdfLayoutConstantsNew.AUDIT_SIG_TEXT)
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstantsNew.AUDIT_SIG_FONT_SIZE)
                .setMargin(0),
            rightX, sigY, TextAlignment.RIGHT);
    }

    // ══════════════════════════════════════════════════════════
    //  备注区边框和线条（使用 PdfCanvas 绘制）
    // ══════════════════════════════════════════════════════════

    private void drawRemarksBorders(PdfCanvas pdfCanvas, float pw, float remarksBottom, float rowHeight) {
        float remarkTotalHeight = rowHeight * REMARKS.length;
        float remarksTop = remarksBottom + remarkTotalHeight;
        float leftX = ML;
        float col0Width = COL_W[0];
        float contentX = leftX + col0Width;

        pdfCanvas.setStrokeColor(ColorConstants.BLACK);

        // ── 外边框 ──
        pdfCanvas.setLineWidth(HljldPdfLayoutConstantsNew.BORDER_OUTER);
        pdfCanvas.rectangle(leftX, remarksBottom, TABLE_W, remarkTotalHeight);
        pdfCanvas.stroke();

        // ── "备注"标签单元格右边线（纵向合并） ──
        pdfCanvas.setLineWidth(HljldPdfLayoutConstantsNew.BORDER_REMARK);
        pdfCanvas.moveTo(contentX, remarksBottom);
        pdfCanvas.lineTo(contentX, remarksTop);
        pdfCanvas.stroke();

        // ── 右侧备注内容的横线（从第一列右边界开始，不穿过左侧"备注"单元格） ──
        for (int i = 1; i < REMARKS.length; i++) {
            float lineY = remarksBottom + i * rowHeight;
            pdfCanvas.setLineWidth(HljldPdfLayoutConstantsNew.BORDER_REMARK);
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
                .setFontSize(HljldPdfLayoutConstantsNew.PAGE_NUM_FONT_SIZE)
                .setMargin(0),
            pw / 2, HljldPdfLayoutConstantsNew.PAGE_NUM_Y, TextAlignment.CENTER);
    }
}
