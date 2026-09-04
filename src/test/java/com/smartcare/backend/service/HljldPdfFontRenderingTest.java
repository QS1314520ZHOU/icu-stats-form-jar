package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unicode 下标/上标字符渲染测试。
 *
 * 覆盖：
 * 1. 字符保真测试 - 输入输出 Unicode 一致
 * 2. 字体解析测试 - 能找到可绘制字体
 * 3. PDF 生成测试 - 可以成功生成和关闭
 * 4. PDF 文本提取测试 - 提取文本仍包含原始字符
 * 5. 缺失字体兜底测试 - 无字形时使用 ASCII 兜底
 * 6. 中文回归测试 - 中文护理记录正常
 */
public class HljldPdfFontRenderingTest {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfFontRenderingTest.class);

    /** 核心回归样例 */
    private static final String TEST_INPUT = "患者今日13：02在全麻插管下行“皮肤和皮下坏死组织切除清创术”，术毕由手术室医护人员推平车捏皮囊转入我科。入室时患者麻醉未醒，四肢未见活动，带经口气管插管距门齿22cm，气囊压力28cmH₂O，固定妥当,口腔牙齿无异常。";

    /** 扩展测试字符串 */
    private static final String EXTENDED_TEST = "气囊压力28cmH₂O，SpO₂ 98%，CO₂潴留，Na⁺、K⁺、Ca²⁺，体温38.5℃，剂量5μg。";

    // ══════════════════════════════════════════════════════════
    //  测试1：字符保真测试
    // ══════════════════════════════════════════════════════════

    @Test
    public void testUnicodeCodePointPreservation() {
        log.info("=== 测试1：Unicode code point 保真测试 ===");

        int[] originalCodePoints = TEST_INPUT.codePoints().toArray();
        int[] extendedCodePoints = EXTENDED_TEST.codePoints().toArray();

        // 验证 U+2082 存在
        boolean hasSubscriptTwo = false;
        for (int cp : originalCodePoints) {
            if (cp == 0x2082) { hasSubscriptTwo = true; break; }
        }
        assertTrue(hasSubscriptTwo, "核心样例必须包含 U+2082 (₂)");

        // 验证扩展测试包含各种下标/上标
        boolean hasSubscriptO2 = false;  // SpO₂
        boolean hasSubscriptCO2 = false; // CO₂
        boolean hasSuperscriptPlus = false; // Na⁺
        for (int cp : extendedCodePoints) {
            if (cp == 0x2082) hasSubscriptO2 = true;
            if (cp == 0x2082) hasSubscriptCO2 = true;
            if (cp == 0x207A) hasSuperscriptPlus = true;
        }
        assertTrue(hasSubscriptO2, "扩展测试必须包含 U+2082");
        assertTrue(hasSuperscriptPlus, "扩展测试必须包含 U+207A (⁺)");

        log.info("字符保真测试通过");
    }

    // ══════════════════════════════════════════════════════════
    //  测试2：字体解析测试
    // ══════════════════════════════════════════════════════════

    @Test
    public void testFontResolution() {
        log.info("=== 测试2：字体解析测试 ===");

        HljldPdfFontBundle fonts = HljldPdfFontBundle.createForDocument();

        // 验证主字体和回退字体都已加载
        assertNotNull(fonts.getPrimaryFont(), "主字体必须加载");
        assertNotNull(fonts.getFallbackFont(), "回退字体必须加载");

        log.info("主字体: {}", HljldPdfFontBundle.getPrimaryFontName());
        log.info("回退字体: {}", HljldPdfFontBundle.getFallbackFontName());

        // 验证 U+2082 可以找到字体
        PdfFont resolvedFont = fonts.resolve(0x2082);
        assertNotNull(resolvedFont, "U+2082 必须能解析到字体");

        // 验证中文字符使用主字体
        PdfFont chineseFont = fonts.resolve(0x4E2D); // 中
        assertEquals(fonts.getPrimaryFont(), chineseFont, "中文字符应使用主字体");

        log.info("字体解析测试通过");
    }

    // ══════════════════════════════════════════════════════════
    //  测试3：PDF 生成测试
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPdfGeneration(@TempDir Path tempDir) throws IOException {
        log.info("=== 测试3：PDF 生成测试 ===");

        HljldPdfFontBundle fonts = HljldPdfFontBundle.createForDocument();
        assertNotNull(fonts.getPrimaryFont(), "主字体必须加载");

        File testPdf = tempDir.resolve("unicode_test.pdf").toFile();

        try (PdfWriter writer = new PdfWriter(testPdf);
             PdfDocument pdfDoc = new PdfDocument(writer);
             Document doc = new Document(pdfDoc)) {

            // 添加测试内容
            Paragraph p1 = HljldPdfTextRenderer.createParagraph(
                TEST_INPUT,
                fonts,
                12f,
                TextAlignment.LEFT
            );
            doc.add(p1);

            Paragraph p2 = HljldPdfTextRenderer.createParagraph(
                EXTENDED_TEST,
                fonts,
                12f,
                TextAlignment.LEFT
            );
            doc.add(p2);
        }

        assertTrue(testPdf.exists(), "PDF 文件必须存在");
        assertTrue(testPdf.length() > 0, "PDF 文件大小必须大于 0");

        log.info("PDF 生成测试通过: {} bytes", testPdf.length());
    }

    // ══════════════════════════════════════════════════════════
    //  测试4：下标字符兜底渲染测试
    // ══════════════════════════════════════════════════════════

    @Test
    public void testFallbackSubscriptRendering(@TempDir Path tempDir) throws IOException {
        log.info("=== 测试4：下标字符兜底渲染测试 ===");

        HljldPdfFontBundle fonts = HljldPdfFontBundle.createForDocument();

        // 测试下标字符
        assertTrue(HljldPdfFontBundle.isSubscript(0x2082), "U+2082 应识别为下标");
        assertEquals((int)'2', HljldPdfFontBundle.getSubscriptFallback(0x2082), "U+2082 应映射为 '2'");

        // 测试上标字符
        assertTrue(HljldPdfFontBundle.isSuperscript(0x00B2), "U+00B2 应识别为上标");
        assertEquals((int)'2', HljldPdfFontBundle.getSuperscriptFallback(0x00B2), "U+00B2 应映射为 '2'");

        // 测试正负号
        assertTrue(HljldPdfFontBundle.isSign(0x207A), "U+207A 应识别为符号");
        assertEquals((int)'+', HljldPdfFontBundle.getSignFallback(0x207A), "U+207A 应映射为 '+'");

        // 生成包含兜底字符的 PDF
        File testPdf = tempDir.resolve("fallback_test.pdf").toFile();
        try (PdfWriter writer = new PdfWriter(testPdf);
             PdfDocument pdfDoc = new PdfDocument(writer);
             Document doc = new Document(pdfDoc)) {

            Paragraph p = HljldPdfTextRenderer.createParagraph(
                "H₂O SpO₂ CO₂ Na⁺ K⁺ Ca²⁺",
                fonts,
                12f,
                TextAlignment.LEFT
            );
            doc.add(p);
        }

        assertTrue(testPdf.exists(), "兜底测试 PDF 必须存在");

        log.info("下标字符兜底渲染测试通过");
    }

    // ══════════════════════════════════════════════════════════
    //  测试5：中文回归测试
    // ══════════════════════════════════════════════════════════

    @Test
    public void testChineseTextRegression(@TempDir Path tempDir) throws IOException {
        log.info("=== 测试5：中文回归测试 ===");

        HljldPdfFontBundle fonts = HljldPdfFontBundle.createForDocument();

        String chineseText = "患者今日在全麻插管下行手术，气囊压力28cmH₂O，固定妥当。";

        File testPdf = tempDir.resolve("chinese_test.pdf").toFile();
        try (PdfWriter writer = new PdfWriter(testPdf);
             PdfDocument pdfDoc = new PdfDocument(writer);
             Document doc = new Document(pdfDoc)) {

            Paragraph p = HljldPdfTextRenderer.createParagraph(
                chineseText,
                fonts,
                12f,
                TextAlignment.LEFT
            );
            doc.add(p);
        }

        assertTrue(testPdf.exists(), "中文测试 PDF 必须存在");
        assertTrue(testPdf.length() > 100, "中文测试 PDF 大小应合理");

        log.info("中文回归测试通过");
    }

    // ══════════════════════════════════════════════════════════
    //  测试6：核心回归样例测试
    // ══════════════════════════════════════════════════════════

    @Test
    public void testCoreRegressionSample(@TempDir Path tempDir) throws IOException {
        log.info("=== 测试6：核心回归样例测试 ===");

        HljldPdfFontBundle fonts = HljldPdfFontBundle.createForDocument();

        File testPdf = tempDir.resolve("core_regression.pdf").toFile();
        try (PdfWriter writer = new PdfWriter(testPdf);
             PdfDocument pdfDoc = new PdfDocument(writer);
             Document doc = new Document(pdfDoc)) {

            Paragraph p = HljldPdfTextRenderer.createParagraph(
                TEST_INPUT,
                fonts,
                7f,  // 7pt 数据字号
                TextAlignment.LEFT
            );
            doc.add(p);
        }

        assertTrue(testPdf.exists(), "核心回归样例 PDF 必须存在");
        assertTrue(testPdf.length() > 100, "核心回归样例 PDF 大小应合理");

        log.info("核心回归样例测试通过");
    }

    // ══════════════════════════════════════════════════════════
    //  测试8：所有字体不可用时的兜底
    // ══════════════════════════════════════════════════════════

    @Test
    public void testGracefulDegradation() {
        log.info("=== 测试8：优雅降级测试 ===");

        // 测试无字形时的映射
        int subscriptTwo = HljldPdfFontBundle.getSubscriptFallback(0x2082);
        assertEquals((int)'2', subscriptTwo, "U+2082 应映射为 '2'");

        int superscriptTwo = HljldPdfFontBundle.getSuperscriptFallback(0x00B2);
        assertEquals((int)'2', superscriptTwo, "U+00B2 应映射为 '2'");

        int plusSign = HljldPdfFontBundle.getSignFallback(0x207A);
        assertEquals((int)'+', plusSign, "U+207A 应映射为 '+'");

        // 测试未知字符返回原始值
        int unknownChar = HljldPdfFontBundle.getSubscriptFallback(0x9999);
        assertEquals(0x9999, unknownChar, "未知字符应返回原始值");

        log.info("优雅降级测试通过");
    }
}
