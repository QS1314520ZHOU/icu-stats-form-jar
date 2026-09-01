package com.smartcare.backend.hljld;

import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.element.Div;
import com.itextpdf.layout.renderer.DivRenderer;
import com.itextpdf.layout.renderer.DrawContext;
import com.itextpdf.layout.renderer.IRenderer;

import java.util.Map;

/**
 * 零高度护理日结束标记。
 * <p>
 * 添加到每个护理日的dailyTable之后，通过自定义Renderer记录
 * 当前物理页码和流式布局结束Y坐标，用于动态定位备注区。
 * <p>
 * 该标记：
 * - 高度为0、margin为0、padding为0
 * - 不绘制任何文字或边框
 * - 不影响页面高度
 * - 不主动创建新页
 */
public class HljldDayEndMarker extends Div {

    private final Map<Integer, Float> dynamicRemarkTopByLocalPage;

    public HljldDayEndMarker(Map<Integer, Float> dynamicRemarkTopByLocalPage) {
        this.dynamicRemarkTopByLocalPage = dynamicRemarkTopByLocalPage;
        this.setHeight(0);
        this.setMarginBottom(0);
        this.setMarginTop(0);
        this.setPaddingBottom(0);
        this.setPaddingTop(0);
        this.setBorder(Border.NO_BORDER);
    }

    @Override
    protected IRenderer makeNewRenderer() {
        return new HljldDayEndMarkerRenderer(this);
    }

    /**
     * 自定义Renderer：在layout完成时记录当前页码和内容结束Y坐标。
     */
    static class HljldDayEndMarkerRenderer extends DivRenderer {

        private final HljldDayEndMarker marker;

        HljldDayEndMarkerRenderer(HljldDayEndMarker marker) {
            super(marker);
            this.marker = marker;
        }

        @Override
        public void draw(DrawContext drawContext) {
            // 在draw阶段记录位置（layout已完成）
            if (getOccupiedArea() != null) {
                int localPageNumber = getOccupiedArea().getPageNumber();
                float contentEndY = getOccupiedArea().getBBox().getY();

                marker.dynamicRemarkTopByLocalPage.put(localPageNumber, contentEndY);

                org.slf4j.LoggerFactory.getLogger(HljldDayEndMarker.class)
                    .info("[hljld] DayEndMarker: localPage={}, contentEndY={}",
                        localPageNumber, contentEndY);
            }
        }
    }
}
