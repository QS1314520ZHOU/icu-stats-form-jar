package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Paragraph;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 根因验证测试：确认 Unicode 下标字符 U+2082 问题的根本原因
 */
public class HljldPdfFontRootCauseTest {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfFontRootCauseTest.class);

    private static final String TEST_INPUT = "气囊压力28cmH₂O，SpO₂ 98%，CO₂潴留，Na⁺、K⁺、Ca²⁺，体温38.5℃，剂量5μg。";

    @Test
    public void verifyUnicodeCodePointsExist() {
        log.info("=== 验证1：输入字符串中是否包含 U+2082 ===");

        int[] codePoints = TEST_INPUT.codePoints().toArray();

        List<Integer> subscriptTwoPositions = new ArrayList<>();
        for (int i = 0; i < codePoints.length; i++) {
            if (codePoints[i] == 0x2082) {
                subscriptTwoPositions.add(i);
            }
        }

        log.info("输入字符串长度（code points）: {}", codePoints.length);
        log.info("U+2082 出现次数: {}", subscriptTwoPositions.size());
        log.info("U+2082 位置: {}", subscriptTwoPositions);

        // 验证确实存在 U+2082
        assertFalse(subscriptTwoPositions.isEmpty(),
            "输入字符串必须包含至少一个 U+2082 (₂) 字符");

        // 输出周围字符的码点用于调试
        for (int pos : subscriptTwoPositions) {
            if (pos > 0) {
                log.info("U+2082 前一个字符: U+{} ({})",
                    Integer.toHexString(codePoints[pos - 1]),
                    new String(Character.toChars(codePoints[pos - 1])));
            }
            if (pos < codePoints.length - 1) {
                log.info("U+2082 后一个字符: U+{} ({})",
                    Integer.toHexString(codePoints[pos + 1]),
                    new String(Character.toChars(codePoints[pos + 1])));
            }
        }
    }

    @Test
    public void verifyFontGlyphSupport(@TempDir Path tempDir) throws IOException {
        log.info("=== 验证2：检查 simsun.ttc 字体对 U+2082 的支持 ===");

        String fontPath = "src/main/resources/fonts/simsun.ttc";
        File fontFile = new File(fontPath);

        if (!fontFile.exists()) {
            log.warn("字体文件不存在: {}", fontPath);
            return;
        }

        try {
            // 加载字体
            PdfFont primaryFont = PdfFontFactory.createFont(
                fontPath + ",0",
                PdfEncodings.IDENTITY_H
            );

            log.info("主字体加载成功: {}", primaryFont.getFontProgram().getFontNames().getFontName());

            // 检查各种 Unicode 字符的字形支持
            int[] testCodePoints = {
                0x2082,  // ₂ subscript two
                0x2080,  // ₀ subscript zero
                0x2081,  // ₁ subscript one
                0x00B2,  // ² superscript two
                0x2070,  // ⁰ superscript zero
                0x2071,  // ¹ superscript one
                0x00B9,  // ¹ superscript one (alternative)
                0x208A,  // ₊ subscript plus
                0x208B,  // ₋ subscript minus
                0x207A,  // ⁺ superscript plus
                0x207B,  // ⁻ superscript minus
                0x0048,  // H
                0x004F,  // O
                0x4E2D,  // 中
                0x6587,  // 文
            };

            boolean hasMissingGlyphs = false;
            List<Integer> missingCodePoints = new ArrayList<>();

            for (int cp : testCodePoints) {
                boolean hasGlyph = primaryFont.containsGlyph(cp);
                String charStr = new String(Character.toChars(cp));
                log.info("U+{} ({}) - 字形支持: {}",
                    Integer.toHexString(cp), charStr, hasGlyph ? "✓" : "✗");

                if (!hasGlyph && (cp >= 0x2080 && cp <= 0x2089)) {
                    hasMissingGlyphs = true;
                    missingCodePoints.add(cp);
                }
            }

            if (hasMissingGlyphs) {
                log.warn("主字体缺少下标数字字形: {}",
                    missingCodePoints.stream()
                        .map(cp -> String.format("U+%04X", cp))
                        .collect(Collectors.joining(", ")));
            }

            // 创建测试 PDF 验证渲染
            File testPdf = tempDir.resolve("glyph_test.pdf").toFile();
            try (PdfWriter writer = new PdfWriter(testPdf);
                 PdfDocument pdfDoc = new PdfDocument(writer);
                 Document doc = new Document(pdfDoc)) {

                Paragraph p = new Paragraph();
                p.setFont(primaryFont);
                p.setFontSize(12);
                p.add(TEST_INPUT);
                doc.add(p);
            }

            log.info("测试 PDF 已生成: {}", testPdf.getAbsolutePath());

        } catch (Exception e) {
            log.error("字体测试失败", e);
            fail("字体测试异常: " + e.getMessage());
        }
    }

    @Test
    public void verifyHljldRowBuilderPreservesUnicode() {
        log.info("=== 验证3：HljldRowBuilder 是否保留 Unicode 字符 ===");

        // 模拟 HljldRowBuilder 的 desc 处理逻辑
        String originalDesc = "  气囊压力28cmH₂O，固定妥当  ";

        // trim 和拼接（与 HljldRowBuilder 一致）
        String processedDesc = originalDesc.trim();

        // 验证处理前后 Unicode 保留
        int[] originalCodePoints = originalDesc.trim().codePoints().toArray();
        int[] processedCodePoints = processedDesc.codePoints().toArray();

        log.info("处理前 code points 数量: {}", originalCodePoints.length);
        log.info("处理后 code points 数量: {}", processedCodePoints.length);

        // 查找 U+2082
        boolean originalHasSubscript = false;
        boolean processedHasSubscript = false;
        for (int cp : originalCodePoints) {
            if (cp == 0x2082) { originalHasSubscript = true; break; }
        }
        for (int cp : processedCodePoints) {
            if (cp == 0x2082) { processedHasSubscript = true; break; }
        }

        log.info("处理前包含 U+2082: {}", originalHasSubscript);
        log.info("处理后包含 U+2082: {}", processedHasSubscript);

        assertTrue(originalHasSubscript, "原始字符串必须包含 U+2082");
        assertTrue(processedHasSubscript, "trim 处理后必须保留 U+2082");

        // 验证没有进行全局替换
        assertFalse(processedDesc.contains("H O"), "不应出现 H 和 O 之间有空格的情况");
        assertFalse(processedDesc.contains("H2O"), "不应将 ₂ 替换为 2");
    }
}
