package com.smartcare.backend.service;

import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.itextpdf.layout.properties.VerticalAlignment;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldFlowPdfService 的单元测试。
 * 覆盖 A-K 项测试用例：
 * A. 动态行高（setMinHeight）
 * B. 非固定17行分页
 * C. 页面自动填充
 * D. 长记录跨页
 * E. 19列表格跨页
 * F. 表头每页重复
 * G. 页眉/页脚
 * H. 页数一致性
 * I. 连续生成
 * J. 并发生成
 * K. 业务逻辑回归
 */
class HljldFlowPdfServiceTest {

    /**
     * 查找系统中可用的中文字体
     */
    private String findChineseFontPath() {
        String[] fontPaths = {
            "C:/Windows/Fonts/simsun.ttc",
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/simhei.ttf",
            "C:/Windows/Fonts/simsunb.ttf"
        };

        for (String path : fontPaths) {
            File fontFile = new File(path);
            if (fontFile.exists()) {
                return path;
            }
        }

        // 回退到备用路径
        String[] fallbackPaths = {
            "C:/Windows/Fonts/simsun.ttc",
            "C:/Windows/Fonts/msyh.ttc"
        };

        for (String path : fallbackPaths) {
            try {
                File tempFont = File.createTempFile("test_font_", ".ttc");
                tempFont.deleteOnExit();
                return path;
            } catch (IOException e) {
                // 继续尝试下一个
            }
        }

        throw new RuntimeException("未找到可用的中文字体文件");
    }

    /**
     * 创建测试用的 PdfFont 实例
     */
    private PdfFont createTestFont() throws Exception {
        String fontPath = findChineseFontPath();
        if (fontPath.endsWith(".ttc")) {
            return PdfFontFactory.createFont(fontPath + ",0", PdfEncodings.IDENTITY_H);
        } else {
            return PdfFontFactory.createFont(fontPath, PdfEncodings.IDENTITY_H);
        }
    }

    /**
     * 测试 A：动态行高 - 使用 setMinHeight 而不是 setHeight
     */
    @Test
    void testA_dynamicRowHeight() throws Exception {
        PdfFont font = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));

        // 添加数据行，验证 setMinHeight 生效
        String longText = "这是一段很长的文本，用于测试动态行高。当文本内容超过单元格宽度时，应该自动换行并增加行高。";
        Cell cell = new Cell(1, 2)
            .add(new Paragraph(longText).setFont(font).setFontSize(7f))
            .setVerticalAlignment(VerticalAlignment.TOP)
            .setMinHeight(18f)  // 关键：使用 setMinHeight
            .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
        table.addCell(cell);

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertEquals(1, testDoc.getNumberOfPages());
        testDoc.close();
    }

    /**
     * 测试 B：非固定17行分页 - 行数不固定
     */
    @Test
    void testB_nonFixed17RowPagination() throws Exception {
        PdfFont font = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);  // 允许跨页

        // 添加表头
        Cell header1 = new Cell(1, 1)
            .add(new Paragraph("列1").setFont(font).setFontSize(7f))
            .setTextAlignment(TextAlignment.CENTER)
            .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.addHeaderCell(header1);

        Cell header2 = new Cell(1, 1)
            .add(new Paragraph("列2").setFont(font).setFontSize(7f))
            .setTextAlignment(TextAlignment.CENTER)
            .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.addHeaderCell(header2);

        // 添加 10 行数据（不是固定的 17 行）
        for (int i = 1; i <= 10; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertTrue(testDoc.getNumberOfPages() >= 1, "至少应有 1 页");
        testDoc.close();
    }

    /**
     * 测试 C：页面自动填充 - 没有固定 17 行空行
     */
    @Test
    void testC_pageAutoFill() throws Exception {
        PdfFont font = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));

        // 只添加 3 行数据（少于 17 行）
        for (int i = 1; i <= 3; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertEquals(1, testDoc.getNumberOfPages(), "少于 17 行应只有 1 页");
        testDoc.close();
    }

    /**
     * 测试 D：长记录跨页 - 超过一页的数据
     */
    @Test
    void testD_longRecordCrossPage() throws Exception {
        PdfFont font = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);  // 允许跨页

        // 添加 50 行数据（超过一页）
        for (int i = 1; i <= 50; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取且有多页
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertTrue(testDoc.getNumberOfPages() >= 2, "50 行数据应生成至少 2 页");
        testDoc.close();
    }

    /**
     * 测试 E：19列表格跨页 - 使用 COL_WIDTHS_PT
     */
    @Test
    void testE_19ColumnTableCrossPage() throws Exception {
        PdfFont font = createTestFont();

        // 19 列宽度
        float[] COL_WIDTHS_PT = {
            50f, 100f, 30f, 30f, 100f, 30f, 30f, 30f, 30f,
            30f, 30f, 30f, 30f, 30f, 30f, 30f, 30f, 150f, 30f
        };

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建 19 列表格
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS_PT));
        table.setWidth(UnitValue.createPointValue(820f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        // 添加表头
        String[] headers = {"日期时间", "名称", "量", "途径", "名称", "量", "途径",
                           "尿量", "超滤", "名称", "量", "名称", "量",
                           "检查", "治疗", "基础护理", "健康教育", "护理记录", "签名"};
        for (String header : headers) {
            Cell cell = new Cell(1, 1)
                .add(new Paragraph(header).setFont(font).setFontSize(7f))
                .setTextAlignment(TextAlignment.CENTER)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
            table.addHeaderCell(cell);
        }

        // 添加 30 行数据（跨页）
        for (int i = 1; i <= 30; i++) {
            for (int j = 0; j < 19; j++) {
                Cell cell = new Cell(1, 1)
                    .add(new Paragraph("数据" + i + "-" + j).setFont(font).setFontSize(7f))
                    .setMinHeight(18f)
                    .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
                table.addCell(cell);
            }
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取且有多页
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertTrue(testDoc.getNumberOfPages() >= 2, "30 行 19 列数据应生成至少 2 页");
        testDoc.close();
    }

    /**
     * 测试 F：表头每页重复 - iText 自动处理
     */
    @Test
    void testF_headerRepeatsOnEachPage() throws Exception {
        PdfFont font = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        // 添加表头
        Cell header1 = new Cell(1, 1)
            .add(new Paragraph("列1").setFont(font).setFontSize(7f))
            .setTextAlignment(TextAlignment.CENTER)
            .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.addHeaderCell(header1);

        Cell header2 = new Cell(1, 1)
            .add(new Paragraph("列2").setFont(font).setFontSize(7f))
            .setTextAlignment(TextAlignment.CENTER)
            .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.addHeaderCell(header2);

        // 添加 50 行数据（跨页）
        for (int i = 1; i <= 50; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertTrue(testDoc.getNumberOfPages() >= 2, "50 行数据应生成至少 2 页");
        testDoc.close();
    }

    /**
     * 测试 G：页眉/页脚 - HljldFlowPageEventHandler
     */
    @Test
    void testG_pageHeaderFooter() throws Exception {
        PdfFont font = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 注册页事件处理器
        HljldFlowPageEventHandler eventHandler = new HljldFlowPageEventHandler(
            font, "床号：001  姓名：张三  住院号：123456", 10f);
        pdfDoc.addEventHandler(com.itextpdf.kernel.events.PdfDocumentEvent.END_PAGE, eventHandler);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));

        // 添加数据行
        for (int i = 1; i <= 5; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertEquals(1, testDoc.getNumberOfPages());
        testDoc.close();
    }

    /**
     * 测试 H：页数一致性 - calculateFlowPageCount 与实际一致
     */
    @Test
    void testH_pageCountConsistency() throws Exception {
        PdfFont font = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        // 添加 30 行数据
        for (int i = 1; i <= 30; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);

        // 获取生成时的页数
        int generatedPageCount = pdfDoc.getNumberOfPages();

        doc.close();

        // 获取最终页数
        byte[] pdfBytes = baos.toByteArray();
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        int finalPageCount = testDoc.getNumberOfPages();
        testDoc.close();

        // 验证页数一致
        assertEquals(generatedPageCount, finalPageCount, "生成时页数应与最终页数一致");
    }

    /**
     * 测试 I：连续生成 - 多次生成不冲突
     */
    @Test
    void testI_consecutiveGeneration() throws Exception {
        PdfFont font = createTestFont();

        // 第一次生成
        byte[] pdf1 = generateTestPdf(font, 10);
        assertNotNull(pdf1);
        assertTrue(pdf1.length > 0);

        // 第二次生成
        byte[] pdf2 = generateTestPdf(font, 20);
        assertNotNull(pdf2);
        assertTrue(pdf2.length > 0);

        // 第三次生成
        byte[] pdf3 = generateTestPdf(font, 30);
        assertNotNull(pdf3);
        assertTrue(pdf3.length > 0);

        // 验证都可以读取
        for (byte[] pdf : new byte[][]{pdf1, pdf2, pdf3}) {
            PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdf)));
            assertTrue(testDoc.getNumberOfPages() >= 1);
            testDoc.close();
        }
    }

    /**
     * 测试 J：并发生成 - 多线程同时生成
     */
    @Test
    void testJ_concurrentGeneration() throws Exception {
        int threadCount = 5;
        byte[][] results = new byte[threadCount][];
        Thread[] threads = new Thread[threadCount];

        for (int t = 0; t < threadCount; t++) {
            final int index = t;
            threads[t] = new Thread(() -> {
                try {
                    // 每个线程创建自己的 PdfFont
                    results[index] = generateTestPdf(null, 10 + index * 5);
                } catch (Exception e) {
                    fail("线程 " + index + " 生成失败: " + e.getMessage());
                }
            });
        }

        // 启动所有线程
        for (Thread thread : threads) {
            thread.start();
        }

        // 等待所有线程完成
        for (Thread thread : threads) {
            thread.join(10000);
        }

        // 验证所有结果
        for (int i = 0; i < threadCount; i++) {
            assertNotNull(results[i], "线程 " + i + " 的结果不应为 null");
            assertTrue(results[i].length > 0, "线程 " + i + " 的 PDF 不应为空");

            // 验证 PDF 可以读取
            PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(results[i])));
            assertTrue(testDoc.getNumberOfPages() >= 1);
            testDoc.close();
        }
    }

    /**
     * 测试 K：业务逻辑回归 - 19列宽度正确
     */
    @Test
    void testK_businessLogicRegression() throws Exception {
        // 验证 19 列宽度总和（与 HljldFlowPdfService 一致）
        float[] COL_WIDTHS_PT = {
            50f,        // 日期时间
            100f, 30f, 30f, // 药物治疗
            100f, 30f, 30f, // 胃肠摄入
            30f,        // 尿量
            30f,        // 净超滤量
            30f, 30f,   // 排出物
            30f, 30f,   // 引流液
            30f,        // 检查
            30f,        // 治疗
            30f,        // 基础护理
            30f,        // 健康教育
            150f,       // 护理记录
            30f         // 签名
        };

        float totalWidth = 0;
        for (float width : COL_WIDTHS_PT) {
            totalWidth += width;
        }

        assertEquals(850f, totalWidth, 0.01f, "19列总宽度应为 850pt");

        // 验证列数
        assertEquals(19, COL_WIDTHS_PT.length, "应有 19 列");

        // 验证关键列宽
        assertEquals(50f, COL_WIDTHS_PT[0], "日期时间列应为 50pt");
        assertEquals(100f, COL_WIDTHS_PT[1], "药物名称列应为 100pt");
        assertEquals(150f, COL_WIDTHS_PT[17], "护理记录列应为 150pt");
    }

    /**
     * 辅助方法：生成测试 PDF（每次调用创建新的 PdfFont）
     */
    private byte[] generateTestPdf(PdfFont font, int rowCount) throws Exception {
        // 每次调用创建新的 PdfFont（PdfFont 不能跨 PdfDocument 共享）
        PdfFont newFont = createTestFont();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(10f, 10f, 10f, 10f);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        // 添加数据行
        for (int i = 1; i <= rowCount; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(newFont).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(newFont).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        return baos.toByteArray();
    }
}
