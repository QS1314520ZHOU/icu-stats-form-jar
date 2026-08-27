package com.smartcare.backend.hljld;

import java.util.List;

/**
 * 备注布局计算结果
 * 用于动态计算备注区域的高度
 */
public final class HljldRemarkLayout {

    private final List<String> texts;
    private final List<Float> rowHeights;
    private final float totalHeight;

    public HljldRemarkLayout(
        List<String> texts,
        List<Float> rowHeights
    ) {
        this.texts = texts;
        this.rowHeights = rowHeights;
        this.totalHeight = (float)
            rowHeights.stream()
                .mapToDouble(
                    Float::doubleValue
                )
                .sum();
    }

    public List<String> getTexts() {
        return texts;
    }

    public List<Float> getRowHeights() {
        return rowHeights;
    }

    public float getTotalHeight() {
        return totalHeight;
    }
}
