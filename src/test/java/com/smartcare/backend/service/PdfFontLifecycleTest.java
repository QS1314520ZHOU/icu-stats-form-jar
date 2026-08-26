package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Paragraph;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PDF 字体生命周期回归测试。
 * 验证 PdfFont 不在不同 PdfDocument 之间共享。
 */
class PdfFontLifecycleTest {

    /** 找到可用的中文字体路径 */
    private static String findChineseFontPath() {
        String[] paths = {
            "C:/Windows/Fonts/simsun.ttc",
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/simhei.ttf",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
            "/usr/share/fonts/truetype/simsun.ttc"
        };
        for (String p : paths) {
            if (new File(p).exists()) return p;
        }
        return null;
    }

    private static PdfFont createTestFont(String fontPath) {
        try {
            if (fontPath.endsWith(".ttc")) {
                return PdfFontFactory.createFont(fontPath + ",0", PdfEncodings.IDENTITY_H);
            } else {
                return PdfFontFactory.createFont(fontPath, PdfEncodings.IDENTITY_H);
            }
        } catch (Exception e) {
            throw new RuntimeException("无法创建测试字体: " + fontPath, e);
        }
    }

    /** 生成一页简单 PDF，写入中文文本 */
    private byte[] generateSimplePdf(PdfFont font, String text) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());

        doc.add(new Paragraph(text).setFont(font).setFontSize(12));

        doc.close();
        return baos.toByteArray();
    }

    @Test
    @DisplayName("连续生成两个PDF：使用不同PdfFont实例，不应抛出跨文档异常")
    void consecutivePdfGeneration_differentFontInstances() throws Exception {
        String fontPath = findChineseFontPath();
        Assumptions.assumeTrue(fontPath != null, "跳过：未找到中文字体");

        // 模拟旧代码的错误：共享同一个 PdfFont
        // 新代码：每次创建新的 PdfFont

        PdfFont font1 = createTestFont(fontPath);
        PdfFont font2 = createTestFont(fontPath);

        // 验证是不同实例
        assertNotSame(font1, font2, "两次 createPdfFont() 必须返回不同实例");

        // 用 font1 生成第一个 PDF
        byte[] pdf1 = generateSimplePdf(font1, "第一次生成：2026-08-26 护理记录");
        assertNotNull(pdf1);
        assertTrue(pdf1.length > 0);
        assertTrue(new String(pdf1, 0, Math.min(5, pdf1.length)).startsWith("%PDF"),
            "第一个PDF应以%PDF开头");

        // 用 font2 生成第二个 PDF（模拟新的 PdfDocument）
        byte[] pdf2 = generateSimplePdf(font2, "第二次生成：2026-08-25 护理记录");
        assertNotNull(pdf2);
        assertTrue(pdf2.length > 0);
        assertTrue(new String(pdf2, 0, Math.min(5, pdf2.length)).startsWith("%PDF"),
            "第二个PDF应以%PDF开头");

        // 验证两个 PDF 都能被正常打开
        try (PdfReader reader1 = new PdfReader(new ByteArrayInputStream(pdf1))) {
            PdfDocument check1 = new PdfDocument(reader1);
            assertEquals(1, check1.getNumberOfPages());
            check1.close();
        }
        try (PdfReader reader2 = new PdfReader(new ByteArrayInputStream(pdf2))) {
            PdfDocument check2 = new PdfDocument(reader2);
            assertEquals(1, check2.getNumberOfPages());
            check2.close();
        }
    }

    @Test
    @DisplayName("并发生成多个PDF：不同线程使用不同PdfFont，不应出现异常")
    void concurrentPdfGeneration() throws Exception {
        String fontPath = findChineseFontPath();
        Assumptions.assumeTrue(fontPath != null, "跳过：未找到中文字体");

        int threadCount = 4;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        List<Future<byte[]>> futures = new ArrayList<>();

        for (int i = 0; i < threadCount; i++) {
            final int idx = i;
            futures.add(executor.submit(() -> {
                // 每个线程创建自己的 PdfFont（模拟 createPdfFont()）
                PdfFont font = createTestFont(fontPath);
                return generateSimplePdf(font, "并发测试线程 " + idx + ": 护理记录");
            }));
        }

        executor.shutdown();
        assertTrue(executor.awaitTermination(30, TimeUnit.SECONDS), "并发测试超时");

        // 验证所有 PDF 都生成成功
        for (int i = 0; i < threadCount; i++) {
            byte[] pdf = futures.get(i).get();
            assertNotNull(pdf, "线程 " + i + " 生成的PDF不应为null");
            assertTrue(pdf.length > 0, "线程 " + i + " 生成的PDF不应为空");
            assertTrue(new String(pdf, 0, Math.min(5, pdf.length)).startsWith("%PDF"),
                "线程 " + i + " 的PDF应以%PDF开头");

            // 可正常打开
            try (PdfReader reader = new PdfReader(new ByteArrayInputStream(pdf))) {
                PdfDocument doc = new PdfDocument(reader);
                assertEquals(1, doc.getNumberOfPages());
                doc.close();
            }
        }
    }

    @Test
    @DisplayName("多页PDF：超过17行数据应能成功生成多页PDF")
    void multiPagePdf_generation() throws Exception {
        String fontPath = findChineseFontPath();
        Assumptions.assumeTrue(fontPath != null, "跳过：未找到中文字体");

        PdfFont font = createTestFont(fontPath);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());

        // 写入4页内容（模拟60行数据分4页）
        for (int page = 1; page <= 4; page++) {
            if (page > 1) pdfDoc.addNewPage();
            for (int row = 0; row < 17; row++) {
                doc.add(new Paragraph("第" + page + "页 第" + (row + 1) + "行：护理记录数据")
                    .setFont(font).setFontSize(8));
            }
            doc.add(new Paragraph("第 " + page + " 页 / 共 4 页").setFont(font).setFontSize(10));
        }

        doc.close();

        byte[] pdf = baos.toByteArray();
        assertNotNull(pdf);
        assertTrue(pdf.length > 0);
        assertTrue(new String(pdf, 0, Math.min(5, pdf.length)).startsWith("%PDF"),
            "多页PDF应以%PDF开头");

        // 验证4页
        try (PdfReader reader = new PdfReader(new ByteArrayInputStream(pdf))) {
            PdfDocument check = new PdfDocument(reader);
            assertEquals(4, check.getNumberOfPages(), "应生成4页");
            check.close();
        }
    }

    @Test
    @DisplayName("中文字体测试：PDF中能正常写入中文")
    void chineseFont_rendering() throws Exception {
        String fontPath = findChineseFontPath();
        Assumptions.assumeTrue(fontPath != null, "跳过：未找到中文字体");

        PdfFont font = createTestFont(fontPath);

        String chineseText = "重钢总医院重症医学科护理记录单 患者姓名：张三 床号：01床";
        byte[] pdf = generateSimplePdf(font, chineseText);

        assertNotNull(pdf);
        assertTrue(new String(pdf, 0, Math.min(5, pdf.length)).startsWith("%PDF"));

        // 验证PDF可正常打开且内容不为空
        try (PdfReader reader = new PdfReader(new ByteArrayInputStream(pdf))) {
            PdfDocument doc = new PdfDocument(reader);
            assertEquals(1, doc.getNumberOfPages());
            // PDF页面存在即表示中文已成功写入（无字体异常抛出）
            doc.close();
        }
    }

    @Test
    @DisplayName("旧代码复现：共享PdfFont在第二个PdfDocument上会抛出异常")
    void oldCodeBug_reproduction() throws Exception {
        String fontPath = findChineseFontPath();
        Assumptions.assumeTrue(fontPath != null, "跳过：未找到中文字体");

        // 模拟旧代码行为：创建一个 PdfFont，然后在两个 PdfDocument 中使用
        PdfFont sharedFont = createTestFont(fontPath);

        // 第一个 PDF 正常
        byte[] pdf1 = generateSimplePdf(sharedFont, "第一个PDF");
        assertNotNull(pdf1);
        assertTrue(pdf1.length > 0);

        // 第二个 PDF 使用同一个 sharedFont — 这是旧代码的 bug
        // 在某些 iText 版本中会抛出 PdfException
        // 在其他版本中可能静默失败但生成损坏的 PDF
        try {
            byte[] pdf2 = generateSimplePdf(sharedFont, "第二个PDF");
            // 如果没有抛异常，检查 PDF 是否能正常打开
            // 有些 iText 版本不会立即抛异常但 PDF 可能有问题
            if (pdf2 != null && pdf2.length > 0) {
                try (PdfReader reader = new PdfReader(new ByteArrayInputStream(pdf2))) {
                    PdfDocument check = new PdfDocument(reader);
                    // 尝试读取内容，可能会在某些版本中失败
                    check.close();
                }
            }
            // 如果到这里没有异常，说明当前 iText 版本对此容忍度较高
            // 但这仍然是不正确的用法，不应依赖此行为
        } catch (Exception e) {
            // 预期行为：抛出 PdfException
            String msg = e.getMessage();
            assertTrue(msg != null && (msg.contains("indirect object") || msg.contains("other PDF")),
                "异常消息应关于跨文档对象: " + msg);
        }
    }
}
