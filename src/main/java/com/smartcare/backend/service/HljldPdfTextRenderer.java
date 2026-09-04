package com.smartcare.backend.service;

import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Text;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.VerticalAlignment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * Unicode 富文本渲染器。
 *
 * <p>按 Unicode code point 遍历输入字符串，根据字体字形支持情况
 * 自动选择主字体或回退字体，构建富文本 Paragraph。</p>
 *
 * <p>对于两个字体都不支持的 Unicode 下标/上标字符，会映射为普通 ASCII
 * 并使用 TextRise 实现视觉上的上下标效果。</p>
 */
public class HljldPdfTextRenderer {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfTextRenderer.class);

    /** 字体大小缩放比例（用于兜底上下标渲染） */
    private static final float SUBSCRIPT_SUPERSCRIPT_SCALE = 0.72f;

    /** 下标 TextRise 偏移量（负值向下） */
    private static final float SUBSCRIPT_RISE = -2f;

    /** 上标 TextRise 偏移量（正值向上） */
    private static final float SUPERSCRIPT_RISE = 3f;

    /**
     * 创建富文本 Paragraph。
     *
     * @param text       原始文本
     * @param fonts      字体包
     * @param fontSize   字号
     * @param alignment  对齐方式
     * @return 富文本 Paragraph
     */
    public static Paragraph createParagraph(String text, HljldPdfFontBundle fonts,
                                           float fontSize, TextAlignment alignment) {
        if (text == null || text.isEmpty()) {
            return new Paragraph();
        }

        Paragraph paragraph = new Paragraph();
        paragraph.setFontSize(fontSize);
        paragraph.setTextAlignment(alignment);
        paragraph.setVerticalAlignment(VerticalAlignment.TOP);

        // 按 code point 遍历
        List<TextRun> runs = buildTextRuns(text, fonts);

        // 合并连续相同字体/样式的 run
        List<TextRun> mergedRuns = mergeRuns(runs);

        // 将 run 转换为 iText Text 对象
        for (TextRun run : mergedRuns) {
            Text textElement = new Text(run.content);
            textElement.setFont(run.font);
            textElement.setFontSize(run.actualFontSize);

            if (run.textRise != 0) {
                textElement.setTextRise(run.textRise);
            }

            paragraph.add(textElement);
        }

        return paragraph;
    }

    /**
     * 创建默认对齐的富文本 Paragraph。
     */
    public static Paragraph createParagraph(String text, HljldPdfFontBundle fonts, float fontSize) {
        return createParagraph(text, fonts, fontSize, TextAlignment.LEFT);
    }

    /**
     * 构建 TextRun 列表（按 code point 逐个分析）。
     */
    private static List<TextRun> buildTextRuns(String text, HljldPdfFontBundle fonts) {
        List<TextRun> runs = new ArrayList<>();

        int[] codePoints = text.codePoints().toArray();
        for (int cp : codePoints) {
            TextRun run = resolveRun(cp, fonts);
            runs.add(run);
        }

        return runs;
    }

    /**
     * 为单个 code point 解析 TextRun。
     */
    private static TextRun resolveRun(int codePoint, HljldPdfFontBundle fonts) {
        TextRun run = new TextRun();
        run.content = new String(Character.toChars(codePoint));
        run.originalCodePoint = codePoint;

        // 1. 检查字体是否直接支持该字符
        if (fonts.hasGlyph(codePoint)) {
            run.font = fonts.resolve(codePoint);
            run.actualFontSize = 0;  // 使用段落默认字号
            run.textRise = 0;
            return run;
        }

        // 2. 检查是否为 Unicode 下标字符
        if (HljldPdfFontBundle.isSubscript(codePoint)) {
            run.font = fonts.getPrimaryFont();
            run.actualFontSize = 0;  // 使用段落默认字号 * SUBSCRIPT_SUPERSCRIPT_SCALE
            run.textRise = SUBSCRIPT_RISE;
            run.content = new String(Character.toChars(HljldPdfFontBundle.getSubscriptFallback(codePoint)));
            run.isFallbackSubscript = true;
            return run;
        }

        // 3. 检查是否为 Unicode 上标字符
        if (HljldPdfFontBundle.isSuperscript(codePoint)) {
            run.font = fonts.getPrimaryFont();
            run.actualFontSize = 0;  // 使用段落默认字号 * SUBSCRIPT_SUPERSCRIPT_SCALE
            run.textRise = SUPERSCRIPT_RISE;
            run.content = new String(Character.toChars(HljldPdfFontBundle.getSuperscriptFallback(codePoint)));
            run.isFallbackSuperscript = true;
            return run;
        }

        // 4. 检查是否为上下标正负号
        if (HljldPdfFontBundle.isSign(codePoint)) {
            run.font = fonts.getPrimaryFont();
            run.actualFontSize = 0;
            run.textRise = 0;
            run.content = new String(Character.toChars(HljldPdfFontBundle.getSignFallback(codePoint)));
            run.isFallbackSign = true;
            return run;
        }

        // 5. 完全不支持的字符：使用方块占位符
        log.warn("字体无法显示字符 U+{}, 使用占位符",
            Integer.toHexString(codePoint));
        run.font = fonts.getPrimaryFont() != null ? fonts.getPrimaryFont() : fonts.getFallbackFont();
        run.actualFontSize = 0;
        run.textRise = 0;
        run.content = "□";  // 占位符
        run.isUnsupported = true;
        return run;
    }

    /**
     * 合并连续相同字体和样式的 TextRun，减少 Text 对象数量。
     */
    private static List<TextRun> mergeRuns(List<TextRun> runs) {
        List<TextRun> merged = new ArrayList<>();
        if (runs.isEmpty()) return merged;

        TextRun current = runs.get(0);
        StringBuilder sb = new StringBuilder(current.content);

        for (int i = 1; i < runs.size(); i++) {
            TextRun next = runs.get(i);
            if (canMerge(current, next)) {
                sb.append(next.content);
            } else {
                current.content = sb.toString();
                merged.add(current);
                current = next;
                sb = new StringBuilder(current.content);
            }
        }
        current.content = sb.toString();
        merged.add(current);

        return merged;
    }

    /**
     * 判断两个 TextRun 是否可以合并。
     */
    private static boolean canMerge(TextRun a, TextRun b) {
        return a.font == b.font
            && a.textRise == b.textRise
            && a.isFallbackSubscript == b.isFallbackSubscript
            && a.isFallbackSuperscript == b.isFallbackSuperscript
            && a.isFallbackSign == b.isFallbackSign
            && a.isUnsupported == b.isUnsupported;
    }

    /**
     * 获取下标/上标的缩放比例。
     */
    public static float getSubscriptSuperscriptScale() {
        return SUBSCRIPT_SUPERSCRIPT_SCALE;
    }

    /**
     * 内部 TextRun 数据结构。
     */
    private static class TextRun {
        String content;
        PdfFont font;
        float actualFontSize;  // 0 表示使用段落默认字号
        float textRise;
        int originalCodePoint;
        boolean isFallbackSubscript;
        boolean isFallbackSuperscript;
        boolean isFallbackSign;
        boolean isUnsupported;
    }
}
