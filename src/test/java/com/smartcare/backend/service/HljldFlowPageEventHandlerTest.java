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
            font, "床号：001  姓名：测试  住院号：123456  性别：女  年龄：45  诊断：脑梗死", 5);
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

    // ══════════════════════════════════════════════════════════
    //  备注区坐标测试
    // ══════════════════════════════════════════════════════════

    @Test
    void testRemarkCoordinates() {
        // 验证CONTENT_BOTTOM等于REMARK_TOP
        assertEquals(HljldPdfLayoutConstants.CONTENT_BOTTOM,
            HljldPdfLayoutConstants.REMARK_TOP, 0.01f,
            "CONTENT_BOTTOM must equal REMARK_TOP");

        // 验证页码Y小于REMARK_BOTTOM
        assertTrue(HljldPdfLayoutConstants.PAGE_NUM_Y < HljldPdfLayoutConstants.REMARK_BOTTOM,
            "PAGE_NUM_Y must be less than REMARK_BOTTOM");

        // 验证REMARK_TOP等于REMARK_BOTTOM + REMARK_TOTAL_HEIGHT
        assertEquals(HljldPdfLayoutConstants.REMARK_TOP,
            HljldPdfLayoutConstants.REMARK_BOTTOM + HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT,
            0.01f, "REMARK_TOP must equal REMARK_BOTTOM + REMARK_TOTAL_HEIGHT");

        // 验证MARGIN_BOTTOM等于REMARK_TOP
        assertEquals(HljldPdfLayoutConstants.MARGIN_BOTTOM,
            HljldPdfLayoutConstants.REMARK_TOP, 0.01f,
            "MARGIN_BOTTOM must equal REMARK_TOP");
    }

    @Test
    void testPageNumberNotInRemarkArea() {
        // 页码Y必须在备注区下方
        assertTrue(HljldPdfLayoutConstants.PAGE_NUM_Y < HljldPdfLayoutConstants.REMARK_BOTTOM,
            "Page number must be below remark area");

        // 页码区域不能与备注区重叠
        float pageNumberTop = HljldPdfLayoutConstants.PAGE_NUM_Y + HljldPdfLayoutConstants.PAGE_NUMBER_HEIGHT / 2f;
        assertTrue(pageNumberTop <= HljldPdfLayoutConstants.REMARK_BOTTOM,
            "Page number top must not overlap with remark bottom");
    }

    // ══════════════════════════════════════════════════════════
    //  顶部布局坐标测试
    // ══════════════════════════════════════════════════════════

    @Test
    void testTopLayoutCoordinates() {
        // 验证顶部固定区域总高度
        float expectedTopHeight = HljldPdfLayoutConstants.PAGE_TOP_PADDING
            + HljldPdfLayoutConstants.TITLE_AREA_HEIGHT
            + HljldPdfLayoutConstants.TITLE_INFO_GAP
            + HljldPdfLayoutConstants.INFO_AREA_HEIGHT
            + HljldPdfLayoutConstants.INFO_TABLE_GAP;
        assertEquals(expectedTopHeight, HljldPdfLayoutConstants.TOP_FIXED_HEIGHT, 0.01f,
            "TOP_FIXED_HEIGHT must equal sum of top area components");

        // 验证MARGIN_TOP等于TOP_FIXED_HEIGHT
        assertEquals(HljldPdfLayoutConstants.MARGIN_TOP,
            HljldPdfLayoutConstants.TOP_FIXED_HEIGHT, 0.01f,
            "MARGIN_TOP must equal TOP_FIXED_HEIGHT");

        // 验证CONTENT_TOP等于PAGE_HEIGHT - MARGIN_TOP
        assertEquals(HljldPdfLayoutConstants.CONTENT_TOP,
            HljldPdfLayoutConstants.PAGE_HEIGHT - HljldPdfLayoutConstants.MARGIN_TOP,
            0.01f, "CONTENT_TOP must equal PAGE_HEIGHT - MARGIN_TOP");

        // 验证PAGE_TOP_PADDING大于0
        assertTrue(HljldPdfLayoutConstants.PAGE_TOP_PADDING > 0,
            "PAGE_TOP_PADDING must be greater than 0");

        // 验证TITLE_INFO_GAP为2pt
        assertEquals(2f, HljldPdfLayoutConstants.TITLE_INFO_GAP, 0.01f,
            "TITLE_INFO_GAP must be 2pt");

        // 验证INFO_TABLE_GAP为2pt
        assertEquals(2f, HljldPdfLayoutConstants.INFO_TABLE_GAP, 0.01f,
            "INFO_TABLE_GAP must be 2pt");
    }

    @Test
    void testTitleAndInfoRectangles() {
        // 验证标题区域坐标
        float titleTop = HljldPdfLayoutConstants.PAGE_HEIGHT - HljldPdfLayoutConstants.PAGE_TOP_PADDING;
        float titleBottom = titleTop - HljldPdfLayoutConstants.TITLE_AREA_HEIGHT;
        assertEquals(HljldPdfLayoutConstants.TITLE_TOP, titleTop, 0.01f, "TITLE_TOP calculation");
        assertEquals(HljldPdfLayoutConstants.TITLE_BOTTOM, titleBottom, 0.01f, "TITLE_BOTTOM calculation");

        // 验证患者信息区域坐标
        float infoTop = titleBottom - HljldPdfLayoutConstants.TITLE_INFO_GAP;
        float infoBottom = infoTop - HljldPdfLayoutConstants.INFO_AREA_HEIGHT;
        assertEquals(HljldPdfLayoutConstants.INFO_TOP, infoTop, 0.01f, "INFO_TOP calculation");
        assertEquals(HljldPdfLayoutConstants.INFO_BOTTOM, infoBottom, 0.01f, "INFO_BOTTOM calculation");

        // 验证表格顶部等于CONTENT_TOP
        float tableTop = infoBottom - HljldPdfLayoutConstants.INFO_TABLE_GAP;
        assertEquals(HljldPdfLayoutConstants.CONTENT_TOP, tableTop, 0.01f,
            "Table top must equal CONTENT_TOP");
    }

    // ══════════════════════════════════════════════════════════
    //  表格宽度测试
    // ══════════════════════════════════════════════════════════

    @Test
    void testTableWidth() {
        // 验证19列总宽度等于TABLE_WIDTH
        float sum = 0;
        for (float w : HljldPdfLayoutConstants.COL_WIDTHS_PT) {
            sum += w;
        }
        assertEquals(HljldPdfLayoutConstants.TABLE_WIDTH, sum, 0.01f,
            "Sum of column widths must equal TABLE_WIDTH");

        // 验证表格不超过页面可用宽度
        float availableWidth = HljldPdfLayoutConstants.PAGE_WIDTH
            - HljldPdfLayoutConstants.MARGIN_LEFT
            - HljldPdfLayoutConstants.MARGIN_RIGHT;
        assertTrue(HljldPdfLayoutConstants.TABLE_WIDTH <= availableWidth,
            "Table width must not exceed available width");

        // 验证列数为19
        assertEquals(19, HljldPdfLayoutConstants.COL_WIDTHS_PT.length,
            "Must have 19 columns");
    }
}
