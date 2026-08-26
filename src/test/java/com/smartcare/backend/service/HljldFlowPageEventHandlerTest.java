package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.PdfDocumentEvent;
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
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldFlowPageEventHandler 单元测试。
 */
class HljldFlowPageEventHandlerTest {

    private static String findChineseFontPath() {
        String[] classpathFonts = {"/fonts/simsun.ttc", "/fonts/simsun.ttf"};
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
            ? new String[]{"C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/msyh.ttc"}
            : new String[]{"/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"};
        for (String fp : sysFonts) {
            if (new File(fp).exists()) return fp;
        }
        throw new RuntimeException("未找到可用的中文字体文件");
    }

    private static PdfFont createTestFont() throws Exception {
        String path = findChineseFontPath();
        if (path.endsWith(".ttc")) return PdfFontFactory.createFont(path + ",0", PdfEncodings.IDENTITY_H);
        return PdfFontFactory.createFont(path, PdfEncodings.IDENTITY_H);
    }

    @Test
    void testEventHandlerCreation() throws Exception {
        PdfFont font = createTestFont();
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(font, "测试患者", 1);
        assertNotNull(handler);
    }

    @Test
    void testEventHandlerWithMultiPage() throws Exception {
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

        // 先创建并注册事件处理器
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "床号：001  姓名：李四  住院号：789012  性别：女  年龄：45  诊断：脑梗死", 5);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 创建跨页表格
        float[] COL_WIDTHS = HljldPdfLayoutConstants.COL_WIDTHS_PT;
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS));
        table.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_OUTER));
        table.setKeepTogether(false);

        for (int i = 0; i < 50; i++) {
            for (int j = 0; j < 19; j++) {
                Cell cell = new Cell(1, 1)
                    .add(new Paragraph("行" + i).setFont(font).setFontSize(7f)
                        .setMargin(0).setMultipliedLeading(1.0f))
                    .setMinHeight(18f)
                    .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
                cell.setKeepTogether(false);
                table.addCell(cell);
            }
        }
        doc.add(table);

        int pageCount = pdfDoc.getNumberOfPages();
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertTrue(testDoc.getNumberOfPages() >= 2, "50行应生成至少2页");
        assertTrue(pdfBytes.length > 1000, "PDF文件应大于1KB");
        testDoc.close();
    }

    @Test
    void testPageLayoutConstants() {
        // 验证布局常量一致性
        assertEquals(842f, HljldPdfLayoutConstants.PAGE_WIDTH, "页面宽度");
        assertEquals(595f, HljldPdfLayoutConstants.PAGE_HEIGHT, "页面高度");
        assertTrue(HljldPdfLayoutConstants.CONTENT_TOP < HljldPdfLayoutConstants.PAGE_HEIGHT,
            "内容区域顶部应在页面高度之下");
        assertTrue(HljldPdfLayoutConstants.CONTENT_BOTTOM > 0, "内容区域底部应大于0");
        assertEquals(4, HljldPdfLayoutConstants.REMARK_ROWS, "备注行数");
    }
}
