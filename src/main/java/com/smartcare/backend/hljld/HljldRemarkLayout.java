package com.smartcare.backend.hljld;

import com.itextpdf.kernel.font.PdfFont;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 备注区动态布局模型。
 *
 * 在PDF开始布局前完成以下计算：
 * 1. 压缩4行备注文字（取消选项间距）
 * 2. 根据实际字体、字号、可用宽度计算每行换行数
 * 3. 计算每行实际高度
 * 4. 计算4行总高度
 * 5. 使用同一份rowHeights绘制文字和横线
 * 6. 使用同一个totalHeight绘制备注外边框
 */
public final class HljldRemarkLayout {

    private static final float REMARK_ROW_MIN_HEIGHT = 13f;
    private static final float LINE_LEADING = 1.2f;
    private static final float CONTENT_PADDING = 2f;

    private final List<String> compactTexts;
    private final List<Float> rowHeights;
    private final float totalHeight;

    private HljldRemarkLayout(List<String> compactTexts, List<Float> rowHeights, float totalHeight) {
        this.compactTexts = Collections.unmodifiableList(compactTexts);
        this.rowHeights = Collections.unmodifiableList(rowHeights);
        this.totalHeight = totalHeight;
    }

    /**
     * 压缩备注选项之间的空格。
     * 例如：检查：A：CT    B：核磁共振 → 检查：A：CTB：核磁共振
     */
    public static String compactRemarkOptions(String value) {
        if (value == null) {
            return "";
        }
        return value
            .replace('\u3000', ' ')
            .replaceAll("\\s+(?=[A-P\uFF21-\uFF30][：:])", "")
            .replaceAll("^(检查|治疗|基础护理|健康教育)[：:]\\s*", "$1：")
            .trim();
    }

    /**
     * 计算备注区布局。
     *
     * @param font            PdfFont，用于精确测量文字宽度
     * @param rawTexts        原始4行备注文字
     * @param availableWidth  右侧内容区可用宽度（pt）
     * @return 备注区布局模型
     */
    public static HljldRemarkLayout calculate(
            PdfFont font, String[] rawTexts, float availableWidth) {

        float fontSize = HljldPdfLayoutConstants.REMARK_FONT_SIZE;
        List<String> compactTexts = new ArrayList<>();
        List<Float> rowHeights = new ArrayList<>();
        float totalHeight = 0;

        for (String raw : rawTexts) {
            String compacted = compactRemarkOptions(raw);
            compactTexts.add(compacted);

            int lineCount = calculateLineCount(font, compacted, fontSize, availableWidth);
            float textHeight = lineCount * fontSize * LINE_LEADING;
            float rowHeight = Math.max(textHeight + CONTENT_PADDING * 2, REMARK_ROW_MIN_HEIGHT);
            rowHeights.add(rowHeight);
            totalHeight += rowHeight;
        }

        return new HljldRemarkLayout(compactTexts, rowHeights, totalHeight);
    }

    /**
     * 使用PdfFont真实宽度逐字测量换行数。
     * 优先取消选项间距，然后再自动换行。
     */
    private static int calculateLineCount(PdfFont font, String text, float fontSize, float availableWidth) {
        if (text.isEmpty()) {
            return 1;
        }

        int lineCount = 1;
        float currentLineWidth = 0;

        // 逐字符测量
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            float charWidth = font.getWidth(String.valueOf(ch), fontSize);

            if (currentLineWidth + charWidth > availableWidth && currentLineWidth > 0) {
                // 换行
                lineCount++;
                currentLineWidth = charWidth;
            } else {
                currentLineWidth += charWidth;
            }
        }

        return lineCount;
    }

    public List<String> getCompactTexts() {
        return compactTexts;
    }

    public List<Float> getRowHeights() {
        return rowHeights;
    }

    public float getTotalHeight() {
        return totalHeight;
    }

    public int getRowCount() {
        return rowHeights.size();
    }
}
