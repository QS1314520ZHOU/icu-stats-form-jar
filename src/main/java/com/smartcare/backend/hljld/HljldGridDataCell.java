package com.smartcare.backend.hljld;

import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.Property;
import com.itextpdf.layout.renderer.CellRenderer;
import com.itextpdf.layout.renderer.DrawContext;
import com.itextpdf.layout.renderer.IRenderer;
import com.itextpdf.layout.renderer.TextRenderer;

/**
 * 护理记录单数据单元格（/form/hljldFormPDFNew）——安全版。
 *
 * <p>始终执行 {@code super.draw()}，保证文字内容绝不丢失。
 * 仅当判定为「跨页拆行空壳」时，临时去掉边框再绘制，避免下一页出现带框空白行。</p>
 *
 * <p>判定：源文本非空，且本页所有后代 TextRenderer 均未画出文字高度。</p>
 */
public class HljldGridDataCell extends Cell {

    private final String sourceText;

    public HljldGridDataCell(String sourceText, Paragraph paragraph) {
        super(1, 1);
        this.sourceText = sourceText == null ? "" : sourceText;
        add(paragraph);
    }

    @Override
    protected IRenderer makeNewRenderer() {
        return new BorderSafeGhostRenderer(this);
    }

    static class BorderSafeGhostRenderer extends CellRenderer {

        private final HljldGridDataCell cellElement;
        private final String sourceText;
        private final Border originalBorder;

        BorderSafeGhostRenderer(HljldGridDataCell element) {
            super(element);
            this.cellElement = element;
            this.sourceText = element.sourceText;
            Object border = element.getProperty(Property.BORDER);
            this.originalBorder = border instanceof Border ? (Border) border : null;
        }

        @Override
        public void draw(DrawContext drawContext) {
            boolean suppressBorder = isGhostSplitRemainder();
            if (suppressBorder) {
                cellElement.setProperty(Property.BORDER, Border.NO_BORDER);
            }
            try {
                super.draw(drawContext);
            } finally {
                if (suppressBorder) {
                    cellElement.setProperty(Property.BORDER, originalBorder);
                }
            }
        }

        private boolean isGhostSplitRemainder() {
            // 真正空列：保留网格边框
            if (sourceText.trim().isEmpty()) {
                return false;
            }
            // 本页若画出了任何文字高度 → 正常格子，保留边框
            return !hasDrawnText(this);
        }

        /** 递归查找本页是否画出了文字（兼容 ParagraphRenderer 等中间层） */
        private static boolean hasDrawnText(IRenderer renderer) {
            if (renderer == null) {
                return false;
            }
            if (renderer instanceof TextRenderer) {
                Rectangle bbox = renderer.getOccupiedArea() != null
                    ? renderer.getOccupiedArea().getBBox()
                    : null;
                if (bbox != null && bbox.getHeight() > 0.5f) {
                    return true;
                }
            }
            for (IRenderer child : renderer.getChildRenderers()) {
                if (hasDrawnText(child)) {
                    return true;
                }
            }
            return false;
        }
    }
}
