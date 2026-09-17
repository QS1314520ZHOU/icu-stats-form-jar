package com.smartcare.backend.hljld;

import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.element.Div;
import com.itextpdf.layout.renderer.DivRenderer;
import com.itextpdf.layout.renderer.DrawContext;
import com.itextpdf.layout.renderer.IRenderer;

import java.util.Map;

/**
 * 备注区占位元素。
 *
 * <p>添加到最后一天的 HljldDayEndMarker 之后，高度 = 备注区总高度。
 * iText 流式布局会自动判断：</p>
 * <ul>
 *   <li>当前页剩余空间 >= 备注区高度 → 留在当前页，备注紧贴内容</li>
 *   <li>当前页剩余空间 < 备注区高度 → 自动分页到新页，备注独占新页</li>
 * </ul>
 *
 * <p>该元素在 draw 阶段更新 dynamicRemarkTopByLocalPage，确保事件处理器
 * 在正确的位置绘制备注区。</p>
 */
public class HljldRemarksSpacer extends Div {

    private static final float SPACER_HEIGHT = HljldPdfLayoutConstantsNew.REMARK_TOTAL_HEIGHT;

    private final Map<Integer, Float> dynamicRemarkTopByLocalPage;

    public HljldRemarksSpacer(Map<Integer, Float> dynamicRemarkTopByLocalPage) {
        this.dynamicRemarkTopByLocalPage = dynamicRemarkTopByLocalPage;
        this.setHeight(SPACER_HEIGHT);
        this.setMarginBottom(0);
        this.setMarginTop(0);
        this.setPaddingBottom(0);
        this.setPaddingTop(0);
        this.setBorder(Border.NO_BORDER);
    }

    @Override
    protected IRenderer makeNewRenderer() {
        return new HljldRemarksSpacerRenderer(this);
    }

    /**
     * 自定义 Renderer：在 draw 阶段记录当前页码和位置。
     * 如果占位元素触发了分页，会更新新页的位置信息。
     */
    static class HljldRemarksSpacerRenderer extends DivRenderer {

        private static final float MIN_SPACE_FOR_REMARKS = 35f;

        private final HljldRemarksSpacer spacer;

        HljldRemarksSpacerRenderer(HljldRemarksSpacer spacer) {
            super(spacer);
            this.spacer = spacer;
        }

        @Override
        public void draw(DrawContext drawContext) {
            // 占位元素本身不绘制内容
            // 但需要更新 dynamicRemarkTopByLocalPage，确保事件处理器能找到正确位置
            if (getOccupiedArea() != null) {
                int localPageNumber = getOccupiedArea().getPageNumber();
                float contentEndY = getOccupiedArea().getBBox().getY();

                // 检查当前页是否有足够空间容纳备注区
                float safeBottom = HljldPdfLayoutConstantsNew.PAGE_BOTTOM_PADDING
                    + HljldPdfLayoutConstantsNew.PAGE_NUMBER_HEIGHT
                    + HljldPdfLayoutConstantsNew.PAGE_NUMBER_REMARK_GAP;
                float availableSpace = contentEndY - safeBottom;

                if (availableSpace >= MIN_SPACE_FOR_REMARKS) {
                    // 空间足够，更新位置
                    spacer.dynamicRemarkTopByLocalPage.put(localPageNumber, contentEndY);
                    org.slf4j.LoggerFactory.getLogger(HljldRemarksSpacer.class)
                        .info("[hljld] 备注空间足够，更新位置: localPage={}, availableSpace={}",
                            localPageNumber, String.format("%.1f", availableSpace));
                } else {
                    // 空间不足，不更新位置，让事件处理器不绘制备注
                    // HljldRemarksSpacer 会触发分页到新页，新页空间足够
                    org.slf4j.LoggerFactory.getLogger(HljldRemarksSpacer.class)
                        .info("[hljld] 备注空间不足，不更新位置，等待分页: localPage={}, availableSpace={}",
                            localPageNumber, String.format("%.1f", availableSpace));
                }
            }
        }
    }
}
