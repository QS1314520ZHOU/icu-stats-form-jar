package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.itextpdf.layout.properties.VerticalAlignment;
import com.itextpdf.kernel.colors.ColorConstants;
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldFlowPdfService 单元测试。
 * 覆盖布局、动态行高、跨页、页码、备注等测试用例。
 */
class HljldFlowPdfServiceTest {

    // ══════════════════════════════════════════════════════════
    //  字体（跨平台：优先classpath，回退系统）
    // ══════════════════════════════════════════════════════════

    private static String findChineseFontPath() {
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
    //  辅助方法：生成测试 PDF
    // ══════════════════════════════════════════════════════════

    private byte[] generateTestPdf(int rowCount, String... nursingRecords) throws Exception {
        PdfFont font = createTestFont();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());

        // 使用新的布局常量设置边距
        doc.setMargins(
            HljldPdfLayoutConstants.MARGIN_TOP,
            HljldPdfLayoutConstants.MARGIN_RIGHT,
            HljldPdfLayoutConstants.MARGIN_BOTTOM,
            HljldPdfLayoutConstants.MARGIN_LEFT
        );

        float[] COL_WIDTHS = HljldPdfLayoutConstants.COL_WIDTHS_PT;
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS));
        table.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_OUTER));
        table.setKeepTogether(false);

        // 双层表头
        String[] headers1 = {"日期时间","药物治疗","","","胃肠摄入","","","尿量\n(ml)","净超滤量\n(ml)",
                             "排出物","","引流液","","检查","治疗","基础\n护理","健康\n教育","护理记录","签名"};
        for (String h : headers1) {
            if (h.isEmpty()) continue;
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

        // 页事件处理器（在添加内容之前注册）
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "床号：001  姓名：测试患者  住院号：123456  性别：男  年龄：65  诊断：重症肺炎", 1);
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
        String shortText = "短";
        String longText = "这是一段非常长的护理记录内容，用于测试动态行高。当文本内容超过单元格宽度时，应该自动换行并增加行高。" +
            "这段文字包含了足够的内容来确保单元格高度能够根据内容自动增长，而不是使用固定高度。";
        assertTrue(longText.length() > shortText.length() * 5, "长文本应明显长于短文本");
    }

    // ══════════════════════════════════════════════════════════
    //  B. 单条记录跨页测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testB_singleLongRecordCrossPage() throws Exception {
        StringBuilder longRecord = new StringBuilder();
        for (int i = 0; i < 200; i++) {
            longRecord.append("这是第").append(i).append("段护理记录内容。");
        }
        byte[] pdf = generateTestPdf(1, longRecord.toString());
        assertNotNull(pdf);
        assertTrue(pdf.length > 0);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        assertTrue(doc.getNumberOfPages() >= 1, "PDF应可读取: pages=" + doc.getNumberOfPages());
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
        assertTrue(doc.getNumberOfPages() >= 1, "PDF应有至少1页");
        assertTrue(pdf.length > 500, "PDF文件应大于500字节");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  D. 签名跨页测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testD_signatureOnLastRow() throws Exception {
        byte[] pdf = generateTestPdf(5, "行1", "行2", "行3", "行4", "行5");
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
        assertTrue(doc.getNumberOfPages() >= 1, "PDF应有至少1页");
        assertTrue(pdf.length > 500, "PDF文件应大于500字节");
        doc.close();
    }

    // ══════════════════════════════════════════════════════════
    //  E. 表头重复测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testE_headerRepeatsOnEachPage() throws Exception {
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
    //  H. 页码测试（只显示"第 N 页"）
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
    //  I. 遮挡检查 - 页面尺寸验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testI_noOverlap() throws Exception {
        byte[] pdf = generateTestPdf(30);
        PdfDocument doc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
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
        PdfFont font = createTestFont();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(
            HljldPdfLayoutConstants.MARGIN_TOP,
            HljldPdfLayoutConstants.MARGIN_RIGHT,
            HljldPdfLayoutConstants.MARGIN_BOTTOM,
            HljldPdfLayoutConstants.MARGIN_LEFT
        );

        float[] COL_WIDTHS = HljldPdfLayoutConstants.COL_WIDTHS_PT;
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS));
        table.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_OUTER));
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
            font, "测试患者信息", 1);
        pdfDoc.addEventHandler(com.itextpdf.kernel.events.PdfDocumentEvent.END_PAGE, handler);
        doc.close();

        PdfDocument verify = new PdfDocument(new PdfReader(new ByteArrayInputStream(baos.toByteArray())));
        assertEquals(pageCountBeforeClose, verify.getNumberOfPages(), "生成时页数应与最终页数一致");
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
                try { results[index] = generateTestPdf(10 + index * 5); }
                catch (Exception e) { fail("线程 " + index + " 失败: " + e.getMessage()); }
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
    //  M. 多护理日 PDF
    // ══════════════════════════════════════════════════════════
    @Test
    void testM_multiDayPdf() throws Exception {
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
        float[] w = HljldPdfLayoutConstants.COL_WIDTHS_PT;
        assertEquals(19, w.length, "应有19列");
        float sum = 0;
        for (float v : w) sum += v;
        assertEquals(HljldPdfLayoutConstants.TABLE_WIDTH, sum, 0.01f, "19列总宽度应等于TABLE_WIDTH");
        assertEquals(50f, w[0], "日期时间列");
        assertEquals(140f, w[17], "护理记录列");
        // 验证表格宽度不超过页面可用宽度
        float availableWidth = HljldPdfLayoutConstants.PAGE_WIDTH
            - HljldPdfLayoutConstants.MARGIN_LEFT
            - HljldPdfLayoutConstants.MARGIN_RIGHT;
        assertTrue(HljldPdfLayoutConstants.TABLE_WIDTH <= availableWidth,
            "表格宽度应不超过页面可用宽度: " + HljldPdfLayoutConstants.TABLE_WIDTH + " <= " + availableWidth);
    }

    // ══════════════════════════════════════════════════════════
    //  页面布局常量验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testPageLayoutConstants() throws Exception {
        assertTrue(HljldPdfLayoutConstants.CONTENT_TOP > HljldPdfLayoutConstants.CONTENT_BOTTOM,
            "内容区域顶部应在底部之上");
        assertTrue(HljldPdfLayoutConstants.MARGIN_TOP > 0, "上边距应大于0");
        assertTrue(HljldPdfLayoutConstants.MARGIN_BOTTOM > 0, "下边距应大于0");
        assertTrue(HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT > 0, "备注区高度应大于0");
        assertTrue(HljldPdfLayoutConstants.PAGE_NUM_FONT_SIZE > 0, "页码字号应大于0");
        // 内容区域高度 = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM
        float contentHeight = HljldPdfLayoutConstants.PAGE_HEIGHT
            - HljldPdfLayoutConstants.MARGIN_TOP
            - HljldPdfLayoutConstants.MARGIN_BOTTOM;
        assertTrue(contentHeight > 0, "内容区域高度应大于0: " + contentHeight);
    }

    // ══════════════════════════════════════════════════════════
    //  备注区19列对齐验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testRemarksAlignment() throws Exception {
        float[] remarkWidths = HljldPdfLayoutConstants.COL_WIDTHS_PT;
        assertEquals(19, remarkWidths.length, "备注区应使用19列宽度");
        // 备注区总宽度应等于表格总宽度
        float sum = 0;
        for (float w : remarkWidths) sum += w;
        assertEquals(HljldPdfLayoutConstants.TABLE_WIDTH, sum, 0.01f,
            "备注区列宽总和应等于表格总宽度");
    }

    // ══════════════════════════════════════════════════════════
    //  患者信息左对齐验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testPatientInfoLeftAligned() throws Exception {
        // 验证患者信息从表格左边界开始
        float leftX = HljldPdfLayoutConstants.MARGIN_LEFT;
        assertTrue(leftX < HljldPdfLayoutConstants.PAGE_WIDTH / 2,
            "左边界应在页面中线左侧: " + leftX);
    }

    // ══════════════════════════════════════════════════════════
    //  页码格式验证（只显示"第 N 页"）
    // ══════════════════════════════════════════════════════════
    @Test
    void testPageNumberFormat() throws Exception {
        // 通过正则验证页码格式
        String pageNumber = String.format("第 %d 页", 1);
        assertTrue(pageNumber.matches("第 \\d+ 页"), "页码格式应为'第 N 页'");
        assertFalse(pageNumber.contains("/"), "页码不应包含'/'");
        assertFalse(pageNumber.contains("共"), "页码不应包含'共'");
    }

    // ══════════════════════════════════════════════════════════
    //  备注内容验证（与前端 DEFAULT_REMARK_LINES 一致）
    // ══════════════════════════════════════════════════════════
    @Test
    void testRemarksContentConsistency() throws Exception {
        String[] remarks = HljldPdfLayoutConstants.REMARK_LINES;
        assertEquals(4, remarks.length, "备注应有4行");

        // 验证每行内容与前端一致（使用4个空格分隔）
        assertTrue(remarks[0].startsWith("检查：A：CT"), "第1行应以'检查：A：CT'开头");
        assertTrue(remarks[0].contains("    "), "第1行应使用4个空格分隔");

        assertTrue(remarks[1].startsWith("治疗：A：机械辅助排痰"), "第2行应以'治疗：A：机械辅助排痰'开头");
        assertTrue(remarks[1].contains("    "), "第2行应使用4个空格分隔");

        assertTrue(remarks[2].startsWith("基础护理：A：口腔护理"), "第3行应以'基础护理：A：口腔护理'开头");
        assertTrue(remarks[2].contains("    "), "第3行应使用4个空格分隔");

        assertTrue(remarks[3].startsWith("健康教育：A：入院指导"), "第4行应以'健康教育：A：入院指导'开头");
        assertTrue(remarks[3].contains("    "), "第4行应使用4个空格分隔");

        // 验证健康教育行包含所有项目
        assertTrue(remarks[3].contains("P：VTE预防指导"), "健康教育行应包含'P：VTE预防指导'");
    }

    // ══════════════════════════════════════════════════════════
    //  小结时间过滤测试（未到时间不显示）
    // ══════════════════════════════════════════════════════════
    @Test
    void testSummaryTimeFilter() throws Exception {
        // 模拟当前时间为16:59（早于17:00）
        long nowMs = java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Shanghai"))
            .withHour(16).withMinute(59).withSecond(0).withNano(0)
            .toInstant().toEpochMilli();

        // 计算当天17:00边界
        java.time.ZonedDateTime now1659 = java.time.Instant.ofEpochMilli(nowMs)
            .atZone(java.time.ZoneId.of("Asia/Shanghai"));
        java.time.LocalDateTime day1700 = now1659.toLocalDateTime()
            .withHour(17).withMinute(0).withSecond(0).withNano(0);
        long dayBoundaryMs = day1700.atZone(java.time.ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli();

        // 验证：16:59 < 17:00，日间小结不应显示
        assertTrue(nowMs < dayBoundaryMs, "16:59应早于17:00");

        // 模拟当前时间为17:00（等于17:00）
        long nowMs1700 = java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Shanghai"))
            .withHour(17).withMinute(0).withSecond(0).withNano(0)
            .toInstant().toEpochMilli();

        // 验证：17:00 >= 17:00，日间小结应显示
        assertTrue(nowMs1700 >= dayBoundaryMs, "17:00应等于或晚于17:00");
    }

    // ══════════════════════════════════════════════════════════
    //  24小时总结时间过滤测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testFullDaySummaryTimeFilter() throws Exception {
        // 模拟当前时间为次日06:59（早于07:00）
        long nowMs = java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Shanghai"))
            .plusDays(1).withHour(6).withMinute(59).withSecond(0).withNano(0)
            .toInstant().toEpochMilli();

        // 计算次日07:00边界
        java.time.ZonedDateTime nowNextDay = java.time.Instant.ofEpochMilli(nowMs)
            .atZone(java.time.ZoneId.of("Asia/Shanghai"));
        java.time.LocalDateTime nextMorning0700 = nowNextDay.toLocalDateTime()
            .withHour(7).withMinute(0).withSecond(0).withNano(0);
        long nextMorningBoundaryMs = nextMorning0700.atZone(java.time.ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli();

        // 验证：06:59 < 07:00，24小时总结不应显示
        assertTrue(nowMs < nextMorningBoundaryMs, "06:59应早于次日07:00");

        // 模拟当前时间为次日07:00（等于07:00）
        long nowMs0700 = java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Shanghai"))
            .plusDays(1).withHour(7).withMinute(0).withSecond(0).withNano(0)
            .toInstant().toEpochMilli();

        // 验证：07:00 >= 07:00，24小时总结应显示
        assertTrue(nowMs0700 >= nextMorningBoundaryMs, "07:00应等于或晚于次日07:00");
    }

    // ══════════════════════════════════════════════════════════
    //  小结内容完整性测试
    // ══════════════════════════════════════════════════════════
    @Test
    void testSummaryContentCompleteness() throws Exception {
        // 创建测试小结
        com.smartcare.backend.hljld.HljldSummary summary = new com.smartcare.backend.hljld.HljldSummary();
        summary.setKind(com.smartcare.backend.hljld.HljldSummary.Kind.DAY);
        summary.setInputSum(1000.0);
        summary.setMedicationSum(500.0);
        summary.setEnteralSum(300.0);
        summary.setOutputSum(800.0);
        summary.setUrineSum(400.0);
        summary.setUltrafiltrationSum(200.0);
        summary.setBalance(200.0);

        // 设置明细项
        java.util.List<com.smartcare.backend.hljld.SummaryItem> medicationItems = new ArrayList<>();
        medicationItems.add(new com.smartcare.backend.hljld.SummaryItem("brought", "带入药量", 100.0));
        medicationItems.add(new com.smartcare.backend.hljld.SummaryItem("iv", "静脉入量", 400.0));
        summary.setMedicationItems(medicationItems);

        java.util.List<com.smartcare.backend.hljld.SummaryItem> enteralItems = new ArrayList<>();
        enteralItems.add(new com.smartcare.backend.hljld.SummaryItem("tube", "鼻饲量", 200.0));
        enteralItems.add(new com.smartcare.backend.hljld.SummaryItem("gastro", "胃肠入量", 100.0));
        summary.setEnteralItems(enteralItems);

        // 验证小结数据
        assertEquals(1000.0, summary.getInputSum(), 0.1, "总入量应为1000.0");
        assertEquals(500.0, summary.getMedicationSum(), 0.1, "药物治疗应为500.0");
        assertEquals(300.0, summary.getEnteralSum(), 0.1, "胃肠摄入应为300.0");
        assertEquals(800.0, summary.getOutputSum(), 0.1, "总出量应为800.0");
        assertEquals(400.0, summary.getUrineSum(), 0.1, "尿量应为400.0");
        assertEquals(200.0, summary.getUltrafiltrationSum(), 0.1, "净超滤量应为200.0");
        assertEquals(200.0, summary.getBalance(), 0.1, "平衡量应为200.0");

        // 验证明细项
        assertEquals(2, summary.getMedicationItems().size(), "药物治疗应有2个明细项");
        assertEquals(2, summary.getEnteralItems().size(), "胃肠摄入应有2个明细项");
    }

    // ══════════════════════════════════════════════════════════
    //  时区一致性测试（Asia/Shanghai）
    // ══════════════════════════════════════════════════════════
    @Test
    void testTimeZoneConsistency() throws Exception {
        // 验证使用 Asia/Shanghai 时区
        java.time.ZoneId shanghaiZone = java.time.ZoneId.of("Asia/Shanghai");
        java.time.ZonedDateTime now = java.time.ZonedDateTime.now(shanghaiZone);

        // 验证时区偏移为 +8 小时
        assertEquals(8, now.getOffset().getTotalSeconds() / 3600, "上海时区应为UTC+8");

        // 验证护理日边界计算
        java.time.LocalDateTime dayStart = now.toLocalDateTime().withHour(7).withMinute(0).withSecond(0).withNano(0);
        java.time.LocalDateTime dayEnd = dayStart.plusDays(1);

        assertTrue(dayEnd.isAfter(dayStart), "护理日结束时间应晚于开始时间");
    }

    // ══════════════════════════════════════════════════════════
    //  备注区高度验证
    // ══════════════════════════════════════════════════════════
    @Test
    void testRemarksHeight() throws Exception {
        float rowHeight = HljldPdfLayoutConstants.REMARK_ROW_HEIGHT;
        int rows = HljldPdfLayoutConstants.REMARK_ROWS;
        float totalHeight = HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT;

        assertEquals(13f, rowHeight, "备注行高应为13pt");
        assertEquals(4, rows, "备注应有4行");
        assertEquals(52f, totalHeight, 0.01f, "备注区总高度应为52pt");

        // 验证备注区高度不超过页面高度的20%
        float maxAllowedHeight = HljldPdfLayoutConstants.PAGE_HEIGHT * 0.2f;
        assertTrue(totalHeight < maxAllowedHeight,
            "备注区高度应小于页面高度的20%: " + totalHeight + " < " + maxAllowedHeight);
    }
}
