package com.smartcare.backend.hljld;

import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.element.Div;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.layout.LayoutArea;
import com.itextpdf.layout.layout.LayoutContext;
import com.itextpdf.layout.layout.LayoutResult;
import com.itextpdf.layout.renderer.DivRenderer;
import com.itextpdf.layout.renderer.IRenderer;

/**
 * 备注续页决策元素（/form/hljldFormPDFNew 专用）。
 *
 * <p>在流式布局末尾追加，按「剩余可用高度」三选一：</p>
 * <ol>
 *   <li>available ≥ 52pt：本页 0 高度占位，由事件处理器正常/压缩贴靠绘制备注</li>
 *   <li>35 ≤ available &lt; 52：同上（压缩档由事件处理器处理）</li>
 *   <li>available &lt; 35pt：强制分页，新页布局完整「双层表头 + 备注图例」</li>
 * </ol>
 *
 * <p>预渲染与正式渲染都添加本元素，保证页数一致。兼容 iText 7.2.5 LayoutResult API。</p>
 */
public class HljldRemarkContinuationElement extends Div {

    public HljldRemarkContinuationElement(Table continuationTable) {
        setMargin(0);
        setPadding(0);
        setBorder(Border.NO_BORDER);
        setWidth(HljldPdfLayoutConstantsNew.TABLE_WIDTH);
        // 子表始终挂在元素上：仅独立续页路径会 layout 子内容
        add(continuationTable);
    }

    @Override
    protected IRenderer makeNewRenderer() {
        return new HljldRemarkContinuationRenderer(this);
    }

    static class HljldRemarkContinuationRenderer extends DivRenderer {

        HljldRemarkContinuationRenderer(HljldRemarkContinuationElement element) {
            super(element);
        }

        @Override
        public LayoutResult layout(LayoutContext layoutContext) {
            Rectangle area = layoutContext.getArea().getBBox();
            float available = area.getHeight();
            float minSpace = HljldPdfLayoutConstantsNew.MIN_SPACE_FOR_REMARKS;
            float contentSafeBottom = HljldPdfLayoutConstantsNew.PAGE_BOTTOM_PADDING
                + HljldPdfLayoutConstantsNew.PAGE_NUMBER_HEIGHT
                + HljldPdfLayoutConstantsNew.PAGE_NUMBER_REMARK_GAP;
            // 接近满页内容区高度时视为「新页」（CONTENT_TOP - 页脚安全区 ≈ 524pt）
            float freshPageMin = (HljldPdfLayoutConstantsNew.CONTENT_TOP - contentSafeBottom) * 0.92f;

            if (available < minSpace) {
                // 空间不足 → 返回 NOTHING，iText 换页后重试 layout
                return new LayoutResult(LayoutResult.NOTHING, null, this, null);
            }

            if (available < freshPageMin) {
                // 正文页尾：0 高度占位，备注由事件处理器贴靠/压缩绘制
                Rectangle occupiedRect = new Rectangle(
                    area.getLeft(), area.getTop(), area.getWidth(), 0f);
                LayoutArea occupiedArea = new LayoutArea(
                    layoutContext.getArea().getPageNumber(), occupiedRect);
                return new LayoutResult(LayoutResult.FULL, occupiedArea, null, null);
            }

            // 独立续页：布局「表头 + 备注」子表
            return super.layout(layoutContext);
        }
    }
}
