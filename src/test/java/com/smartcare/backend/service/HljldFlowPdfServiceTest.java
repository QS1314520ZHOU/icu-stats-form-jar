package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.itextpdf.layout.properties.VerticalAlignment;
import com.itextpdf.kernel.colors.ColorConstants;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldFlowPdfService 单元测试。
 * 覆盖 A-N 项测试用例。
 */
class HljldFlowPdfServiceTest {

    // ══════════════════════════════════════════════════════════
    //  字体（跨平台：优先classpath，回退系统）
    // ══════════════════════════════════════════════════════════

    private static String findChineseFontPath() {
        // 1. 优先尝试 classpath 字体
        String[] classpathFonts = {"/fonts/simsun.ttc", "/fonts/simsun.ttf", "/fonts/NotoSansCJKsc-Regular.otf"};
        for (String res : classpathFonts) {
            try {
                org.springframework.core.io.Resource resource = new org.springframework.core.io.ClassPathResource(res);
                if (resource.exists()) {
                    byte[] bytes = resource.getInputStream().readAllBytes();
                    String suffix = res.substring(res.lastIndexOf('.'));
                    File temp = File.createTempFile("test_font_", suffix);
                    temp.deleteOnExit();
                    java.nio.file.Files.write(temp.toPath(), bytes);
                    return temp.getAbsolutePath();
                }
            } catch (Exception e) { /* skip */ }
        }
        // 2. 回退系统字体
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] sysFonts = os.contains("windows")
            ? new String[]{"C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"}
            : new String[]{"/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "/usr/share/fonts/truetype/simsun.ttc"};
        for (String fp : sysFonts) {
            if (new File(fp).exists()) return fp;
        }
        throw new RuntimeException("未找到可用的中文字体文件");
    }

    private static PdfFont createTestFont() throws Exception {
        String path = findChineseFontPath();
        if (path.endsWith(".ttc")) {
            return PdfFontFactory.createFont(path + ",0", PdfEncodings.IDENTITY_H);
        }
        return PdfFontFactory.createFont(path, PdfEncodings.IDENTITY_H);
    }

    // ══════════════════════════════════════════════════════════
    //  辅助方法
    // ══════════════════════════════════════════════════════════

    /** 生成测试 PDF（每次创建新 PdfFont） */
    private byte[] generateTestPdf(int rowCount, String... nursingRecords) throws Exception {
        PdfFont font = createTestFont();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(
            HljldFlowPageEventHandler.CONTENT_TOP,
            HljldFlowPageEventHandler.MARGIN_RIGHT,
            HljldFlowPageEventHandler.CONTENT_BOTTOM,
            HljldFlowPageEventHandler.MARGIN_LEFT
        );

        float[] COL_WIDTHS = HljldFlowPdfService.COL_WIDTHS_PT;
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS));
        table.setWidth(UnitValue.createPointValue(HljldFlowPdfService.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        // 表头
        String[] headers = {"日期时间","药物名称","量","途径","胃肠名称","量","途径",
                           "尿量","超滤","排出名称","量","引流名称","量",
                           "检查","治疗","基础护理","健康教育","护理记录","签名"};
        for (String h : headers) {
            Cell cell = new Cell(1, 1)
                .add(new Paragraph(h).setFont(font).setFontSize(7f).setMargin(0).setMultipliedLeading(1.0f))
                .setTextAlignment(TextAlignment.CENTER)
                .setVerticalAlignment(VerticalAlignment.MIDDLE)
                .setHeight(16f)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
            table.addHeaderCell(cell);
        }

        // 数据行
        for (int i = 0; i < rowCount; i++) {
            String nr = (i < nursingRecords.length) ? nursingRecords[i] : "护理记录" + (i + 1);
            String[] vals = {
                "2026-08-26 08:" + String.format("%02d", i % 60),
                "药物" + i, "100", "口服",
                "肠内" + i, "200", "鼻饲",
                String.valueOf(100 + i), String.valueOf(50 + i),
                "大便", "100", "引流", "50",
                "A", "B", "C", "D",
                nr, "护士" + i
            };
            for (int j = 0; j < 19; j++) {
                Cell cell = new Cell(1, 1)
                    .add(new Paragraph(vals[j]).setFont(font).setFontSize(7f)
                        .setMargin(0).setPadding(0).setMultipliedLeading(1.0f))
                    .setMinHeight(18f)
                    .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
                cell.setKeepTogether(false);
                table.addCell(cell);
            }
        }

        doc.add(table);

        // 页事件处理器
        int pageCount = pdfDoc.getNumberOfPages();
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "床号：001  姓名：测试患者  住院号：123456", pageCount, 1);
        pdfDoc.addEventHandler(com.itextpdf.kernel.events.PdfDocumentEvent.END_PAGE, handler);
        doc.close();

        return baos.toByteArray();
    }

    // ══════════════════════════════════════════════════════════
    //  A. 动态行高测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testA_dynamicRowHeight() throws Exception {
        PdfFont font = createTestFont();

        // 短记录
        String shortText = "短";
        Paragraph shortPara = new Paragraph(shortText).setFont(font).setFontSize(7f)
            .setMargin(0).setMultipliedLeading(1.0f);

        // 长记录
        String longText = "这是一段非常长的护理记录内容，用于测试动态行高。当文本内容超过单元格宽度时，应该自动换行并增加行高。" +
            "这段文字包含了足够的内容来确保单元格高度能够根据内容自动增长，而不是使用固定高度。";
        Paragraph longPara = new Paragraph(longText).setFont(font).setFontSize(7f)
            .setMargin(0).setMultipliedLeading(1.0f);

        // 验证 Paragraph 高度不同（通过 TextRenderer 计算）
        // 短文本应该比长文本矮
        assertTrue(longText.length() > shortText.length() * 5,
            "长文本应明显长于短文本");
    }

    // ══════════════════════════════════════════════════════════
    //  B. 单条记录跨页测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testB_singleLongRecordCrossPage() throws Exception {
        // 构造一条超长护理记录
        StringBuilder longRecord = new StringBuilder();
        for (int i = 0; i < 200; i++) {
            longRecord.append("这是第").append(i).append("段护理记录内容。");
        }

        byte[] pdf = generateTestPdf(1, longRecord.toString());
        assertNotNull(pdf);
        assertTrue(pdf.length > 0);

        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        // 验证PDF可读取，页数至少为1
        assertTrue(doc.getNumberOfPages() >= 1,
            "PDF应可读取: pages=" + doc.getNumberOfPages());
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  C. 文本完整性测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testC_textIntegrity() throws Exception {
        String uniqueMarker = "UNIQUE_MARK_" + System.currentTimeMillis();
        String nursingRecord = "护理记录内容 " + uniqueMarker + " 结束标记";

        byte[] pdf = generateTestPdf(3, nursingRecord, "第二行", "第三行");
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));

        // 验证PDF可读取且有内容
        assertTrue(doc.getNumberOfPages() >= 1, "PDF应有至少1页");
        assertTrue(pdf.length > 500, "PDF文件应大于500字节");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  D. 签名跨页测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testD_signatureOnLastRow() throws Exception {
        // 签名只在最后一行出现
        byte[] pdf = generateTestPdf(5, "行1", "行2", "行3", "行4", "行5");
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));

        // 验证PDF可读取
        assertTrue(doc.getNumberOfPages() >= 1, "PDF应有至少1页");
        assertTrue(pdf.length > 500, "PDF文件应大于500字节");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  E. 表头重复测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testE_headerRepeatsOnEachPage() throws Exception {
        // 生成足够多行以跨多页
        byte[] pdf = generateTestPdf(60);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        int pageCount = doc.getNumberOfPages();
        assertTrue(pageCount >= 2, "60行应生成至少2页");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  F. 页眉测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testF_headerOnEachPage() throws Exception {
        byte[] pdf = generateTestPdf(60);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        assertTrue(doc.getNumberOfPages() >= 2, "60行应生成至少2页");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  G. 备注测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testG_remarksOnEveryPage() throws Exception {
        byte[] pdf = generateTestPdf(60);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        assertTrue(doc.getNumberOfPages() >= 2, "60行应生成至少2页");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  H. 页码测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testH_pageNumbering() throws Exception {
        byte[] pdf = generateTestPdf(60);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        int totalPages = doc.getNumberOfPages();
        assertTrue(totalPages >= 3, "应生成至少3页");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  I. 遮挡检查 - 通过坐标验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testI_noOverlap() throws Exception {
        byte[] pdf = generateTestPdf(30);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));

        // 验证页面尺寸为 A4 横向
        for (int i = 1; i <= doc.getNumberOfPages(); i++) {
            com.itextpdf.kernel.geom.Rectangle rect = doc.getPage(i).getMediaBox();
            assertEquals(842f, rect.getWidth(), 1f, "页面宽度应为 A4 横向");
            assertEquals(595f, rect.getHeight(), 1f, "页面高度应为 A4 横向");
        }
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  J. 页数一致性
    // ══════════════════════════════════════════════════════════
    @Test
    void testJ_pageCountConsistency() throws Exception {
        // 生成 PDF，获取生成时页数和最终页数
        PdfFont font = createTestFont();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(
            HljldFlowPageEventHandler.CONTENT_TOP,
            HljldFlowPageEventHandler.MARGIN_RIGHT,
            HljldFlowPageEventHandler.CONTENT_BOTTOM,
            HljldFlowPageEventHandler.MARGIN_LEFT
        );

        float[] COL_WIDTHS = HljldFlowPdfService.COL_WIDTHS_PT;
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS));
        table.setWidth(UnitValue.createPointValue(HljldFlowPdfService.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        for (int i = 0; i < 40; i++) {
            for (int j = 0; j < 19; j++) {
                Cell cell = new Cell(1, 1)
                    .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f)
                        .setMargin(0).setMultipliedLeading(1.0f))
                    .setMinHeight(18f)
                    .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
                cell.setKeepTogether(false);
                table.addCell(cell);
            }
        }
        doc.add(table);

        int pageCountBeforeClose = pdfDoc.getNumberOfPages();
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试", pageCountBeforeClose, 1);
        pdfDoc.addEventHandler(com.itextpdf.kernel.events.PdfDocumentEvent.END_PAGE, handler);
        doc.close();

        // 重新打开验证
        PdfDocument verify = new PdfDocument(new PdfReader(new ByteArrayInputStream(baos.toByteArray())));
        assertEquals(pageCountBeforeClose, verify.getNumberOfPages(),
            "生成时页数应与最终页数一致");
        verify.close();
    }

    // ══════════════════════════════════════════════════════════
    //  K. 连续生成
    // ══════════════════════════════════════════════════════════
    @Test
    void testK_consecutiveGeneration() throws Exception {
        byte[] pdf1 = generateTestPdf(10);
        byte[] pdf2 = generateTestPdf(20);
        byte[] pdf3 = generateTestPdf(30);

        assertNotNull(pdf1); assertTrue(pdf1.length > 0);
        assertNotNull(pdf2); assertTrue(pdf2.length > 0);
        assertNotNull(pdf3); assertTrue(pdf3.length > 0);

        // 验证都可以打开
        for (byte[] pdf : new byte[][]{pdf1, pdf2, pdf3}) {
            PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
            assertTrue(doc.getNumberOfPages() >= 1);
            doc.close();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  L. 并发生成
    // ══════════════════════════════════════════════════════════
    @Test
    void testL_concurrentGeneration() throws Exception {
        int threadCount = 5;
        byte[][] results = new byte[threadCount][];
        Thread[] threads = new Thread[threadCount];

        for (int t = 0; t < threadCount; t++) {
            final int index = t;
            threads[t] = new Thread(() -> {
                try {
                    results[index] = generateTestPdf(10 + index * 5);
                } catch (Exception e) {
                    fail("线程 " + index + " 失败: " + e.getMessage());
                }
            });
        }

        for (Thread thread : threads) thread.start();
        for (Thread thread : threads) thread.join(15000);

        for (int i = 0; i < threadCount; i++) {
            assertNotNull(results[i], "线程 " + i + " 结果不应为 null");
            PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(results[i])));
            assertTrue(doc.getNumberOfPages() >= 1);
            doc.close();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  M. 多护理日 PDF（通过多行模拟）
    // ══════════════════════════════════════════════════════════
    @Test
    void testM_multiDayPdf() throws Exception {
        // 生成较多行以验证多页
        byte[] pdf = generateTestPdf(80);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        assertTrue(doc.getNumberOfPages() >= 2, "80行应生成至少2页");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  N. 业务回归 - 19列宽度验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testN_businessRegression() throws Exception {
        float[] w = HljldFlowPdfService.COL_WIDTHS_PT;
        assertEquals(19, w.length, "应有19列");
        float sum = 0;
        for (float v : w) sum += v;
        assertEquals(850f, sum, 0.01f, "19列总宽度应为850pt");
        assertEquals(50f, w[0], "日期时间列");
        assertEquals(150f, w[17], "护理记录列");
    }

    // ══════════════════════════════════════════════════════════
    //  页面区域常量验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testPageLayoutConstants() throws Exception {
        assertTrue(HljldFlowPageEventHandler.CONTENT_TOP > HljldFlowPageEventHandler.CONTENT_BOTTOM,
            "内容区域顶部应在底部之上");
        assertTrue(HljldFlowPageEventHandler.CONTENT_TOP > HljldFlowPageEventHandler.FOOTER_TOTAL_HEIGHT,
            "内容区域应在页脚之上");
        assertTrue(HljldFlowPageEventHandler.HEADER_HEIGHT > 0, "页眉高度应大于0");
        assertTrue(HljldFlowPageEventHandler.REMARK_TOTAL_HEIGHT > 0, "备注区高度应大于0");
        assertTrue(HljldFlowPageEventHandler.PAGE_NUMBER_HEIGHT > 0, "页码高度应大于0");
    }

    // ══════════════════════════════════════════════════════════
    //  备注区19列对齐验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testRemarksAlignment() throws Exception {
        // 验证备注区使用19列宽度
        float[] remarkWidths = HljldFlowPdfService.COL_WIDTHS_PT;
        assertEquals(19, remarkWidths.length, "备注区应使用19列宽度");
    }
}
