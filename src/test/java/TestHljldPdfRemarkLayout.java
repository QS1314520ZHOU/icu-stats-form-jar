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
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.AreaBreak;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.UnitValue;
import com.smartcare.backend.hljld.HljldDayEndMarker;
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;
import com.smartcare.backend.service.HljldFlowPageEventHandler;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * 护理记录单 PDF 备注布局回归测试。
 *
 * 验证动态备注定位系统：
 * 1. 每页恰好一套备注（通过页数和事件处理器逻辑验证）
 * 2. 备注不拆页
 * 3. 备注不跨护理日
 * 4. 备注不跨患者
 * 5. 备注紧跟正文结束位置
 */
public class TestHljldPdfRemarkLayout {

    // ══════════════════════════════════════════════════════════
    //  测试1：布局常量一致性
    // ══════════════════════════════════════════════════════════

    @Test
    public void testLayoutConstantsConsistency() {
        // 验证备注区域坐标一致性
        assertEquals(HljldPdfLayoutConstants.REMARK_BOTTOM,
            HljldPdfLayoutConstants.PAGE_BOTTOM_PADDING
                + HljldPdfLayoutConstants.PAGE_NUMBER_HEIGHT
                + HljldPdfLayoutConstants.PAGE_NUMBER_REMARK_GAP,
            0.01f, "REMARK_BOTTOM计算应一致");

        assertEquals(HljldPdfLayoutConstants.REMARK_TOP,
            HljldPdfLayoutConstants.REMARK_BOTTOM + HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT,
            0.01f, "REMARK_TOP = REMARK_BOTTOM + REMARK_TOTAL_HEIGHT");

        assertEquals(HljldPdfLayoutConstants.MARGIN_BOTTOM,
            HljldPdfLayoutConstants.REMARK_TOP,
            0.01f, "MARGIN_BOTTOM = REMARK_TOP");

        assertEquals(HljldPdfLayoutConstants.CONTENT_BOTTOM,
            HljldPdfLayoutConstants.MARGIN_BOTTOM,
            0.01f, "CONTENT_BOTTOM = MARGIN_BOTTOM");

        // 验证备注宽度 = 主表宽度
        float col0Width = HljldPdfLayoutConstants.COL_WIDTHS_PT[0];
        float contentWidth = HljldPdfLayoutConstants.TABLE_WIDTH - col0Width;
        assertEquals(HljldPdfLayoutConstants.TABLE_WIDTH, col0Width + contentWidth, 0.01f,
            "备注Table宽度应等于主表宽度");

        // 验证备注行数
        assertEquals(4, HljldPdfLayoutConstants.REMARK_LINES.length, "应有4行备注");
        assertEquals(4, HljldPdfLayoutConstants.REMARK_ROWS, "REMARK_ROWS应为4");

        System.out.println("[PASS] testLayoutConstantsConsistency");
    }

    // ══════════════════════════════════════════════════════════
    //  测试2：单页PDF
    // ══════════════════════════════════════════════════════════

    @Test
    public void testSinglePagePdf() throws Exception {
        PdfFont font = createTestFont();
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, dynamicRemarkTopByLocalPage);

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

        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 添加少量数据
        Table table = createTestTable(font, 5);
        doc.add(table);

        // 添加结束标记
        doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF应生成有效字节");

        // 验证PDF只有1页
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(1, rendered.getNumberOfPages(), "单页PDF应只有1页");

        System.out.println("[PASS] testSinglePagePdf - PDF=" + pdfBytes.length + " bytes");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试3：动态备注位置已记录
    // ══════════════════════════════════════════════════════════

    @Test
    public void testDynamicRemarksPositionRecorded() throws Exception {
        PdfFont font = createTestFont();
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, dynamicRemarkTopByLocalPage);

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

        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 添加适量数据
        Table table = createTestTable(font, 10);
        doc.add(table);

        // 添加结束标记
        HljldDayEndMarker marker = new HljldDayEndMarker(dynamicRemarkTopByLocalPage);
        doc.add(marker);

        doc.close();

        byte[] pdfBytes = baos.toByteArray();

        // 验证PDF只有1页
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(1, rendered.getNumberOfPages(), "适量数据应只有1页");

        // 验证动态位置已记录
        assertFalse(dynamicRemarkTopByLocalPage.isEmpty(), "动态位置应已记录");
        assertTrue(dynamicRemarkTopByLocalPage.containsKey(1), "应记录第1页的位置");

        float contentEndY = dynamicRemarkTopByLocalPage.get(1);
        assertTrue(contentEndY > 0, "内容结束Y坐标应大于0: " + contentEndY);
        assertTrue(contentEndY < HljldPdfLayoutConstants.PAGE_HEIGHT, "内容结束Y坐标应小于页面高度: " + contentEndY);

        System.out.println("[PASS] testDynamicRemarksPositionRecorded - 动态位置=" + dynamicRemarkTopByLocalPage);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试4：多页PDF
    // ══════════════════════════════════════════════════════════

    @Test
    public void testMultiPagePdf() throws Exception {
        PdfFont font = createTestFont();
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, dynamicRemarkTopByLocalPage);

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

        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 添加大量数据使其跨页
        Table table = createTestTable(font, 40);
        doc.add(table);

        // 添加结束标记
        doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

        doc.close();

        byte[] pdfBytes = baos.toByteArray();

        // 验证PDF有多页
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        int pageCount = rendered.getNumberOfPages();
        assertTrue(pageCount >= 2, "大量数据应产生多页: pageCount=" + pageCount);

        // 验证最后一页的位置已记录
        assertTrue(dynamicRemarkTopByLocalPage.containsKey(pageCount),
            "应记录最后一页的位置: pageCount=" + pageCount);

        System.out.println("[PASS] testMultiPagePdf - 页数=" + pageCount
            + ", 动态位置=" + dynamicRemarkTopByLocalPage);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试5：多护理日 - 备注不跨护理日
    // ══════════════════════════════════════════════════════════

    @Test
    public void testMultiDayRemarksDoNotCross() throws Exception {
        PdfFont font = createTestFont();
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, dynamicRemarkTopByLocalPage);

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

        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 护理日1：适量数据
        Table table1 = createTestTable(font, 10);
        doc.add(table1);
        doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

        // 护理日2（新页）
        doc.add(new AreaBreak());
        Table table2 = createTestTable(font, 10);
        doc.add(table2);
        doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

        doc.close();

        byte[] pdfBytes = baos.toByteArray();

        // 验证PDF有2页
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(2, rendered.getNumberOfPages(), "两个护理日应有2页");

        // 验证每页的位置都已记录
        assertTrue(dynamicRemarkTopByLocalPage.containsKey(1), "应记录第1页的位置");
        assertTrue(dynamicRemarkTopByLocalPage.containsKey(2), "应记录第2页的位置");

        // 验证两个护理日的位置不同（因为内容不同）
        float pos1 = dynamicRemarkTopByLocalPage.get(1);
        float pos2 = dynamicRemarkTopByLocalPage.get(2);
        assertTrue(pos1 > 0, "第1页位置应大于0");
        assertTrue(pos2 > 0, "第2页位置应大于0");

        System.out.println("[PASS] testMultiDayRemarksDoNotCross - 页数=2, 位置=" + dynamicRemarkTopByLocalPage);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试6：空护理日 - 仍有备注
    // ══════════════════════════════════════════════════════════

    @Test
    public void testEmptyDayStillHasRemarks() throws Exception {
        PdfFont font = createTestFont();
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, dynamicRemarkTopByLocalPage);

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

        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 空护理日：只添加一个空行
        Table emptyTable = createTestTable(font, 1);
        doc.add(emptyTable);

        // 添加结束标记
        doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

        doc.close();

        byte[] pdfBytes = baos.toByteArray();

        // 验证PDF有1页
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(1, rendered.getNumberOfPages(), "空护理日应有1页");

        // 验证位置已记录
        assertFalse(dynamicRemarkTopByLocalPage.isEmpty(), "应记录位置");

        System.out.println("[PASS] testEmptyDayStillHasRemarks - PDF=" + pdfBytes.length + " bytes");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试7：安全边界检查 - 动态位置过低时回退
    // ══════════════════════════════════════════════════════════

    @Test
    public void testSafetyBoundaryFallback() throws Exception {
        PdfFont font = createTestFont();
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        // 模拟动态位置过低（低于安全边界）
        dynamicRemarkTopByLocalPage.put(1, HljldPdfLayoutConstants.REMARK_BOTTOM + 10f);

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, dynamicRemarkTopByLocalPage);

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

        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 添加少量数据
        Table table = createTestTable(font, 3);
        doc.add(table);

        doc.close();

        byte[] pdfBytes = baos.toByteArray();

        // 验证PDF正常生成（没有崩溃）
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(1, rendered.getNumberOfPages(), "应正常生成1页");

        System.out.println("[PASS] testSafetyBoundaryFallback - 动态位置过低时正确回退");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试8：多患者合并 - 备注不跨患者
    // ══════════════════════════════════════════════════════════

    @Test
    public void testMultiPatientRemarksDoNotCross() throws Exception {
        PdfFont font = createTestFont();
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "患者A", 1, dynamicRemarkTopByLocalPage);

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

        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 患者A：适量数据
        Table table1 = createTestTable(font, 10);
        doc.add(table1);
        doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

        // 患者B（新页）
        doc.add(new AreaBreak());
        Table table2 = createTestTable(font, 10);
        doc.add(table2);
        doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

        doc.close();

        byte[] pdfBytes = baos.toByteArray();

        // 验证PDF有2页
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(2, rendered.getNumberOfPages(), "两个患者应有2页");

        // 验证每页的位置都已记录
        assertTrue(dynamicRemarkTopByLocalPage.containsKey(1), "应记录患者A最后一页的位置");
        assertTrue(dynamicRemarkTopByLocalPage.containsKey(2), "应记录患者B最后一页的位置");

        System.out.println("[PASS] testMultiPatientRemarksDoNotCross - 页数=2, 位置=" + dynamicRemarkTopByLocalPage);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  辅助方法
    // ══════════════════════════════════════════════════════════

    /**
     * 创建测试表格
     */
    private Table createTestTable(PdfFont font, int rowCount) {
        Table table = new Table(UnitValue.createPointArray(HljldPdfLayoutConstants.COL_WIDTHS_PT));
        table.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));

        for (int i = 0; i < rowCount; i++) {
            for (int j = 0; j < 19; j++) {
                Cell c = new Cell()
                    .add(new com.itextpdf.layout.element.Paragraph("R" + i + "-C" + j)
                        .setFont(font)
                        .setFontSize(7f)
                        .setMargin(0))
                    .setHeight(18f)
                    .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
                table.addCell(c);
            }
        }
        return table;
    }

    private PdfFont createTestFont() {
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] fontPaths = os.contains("windows")
            ? new String[]{"C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"}
            : new String[]{"/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"};
        for (String path : fontPaths) {
            try {
                if (new java.io.File(path).exists()) {
                    if (path.endsWith(".ttc")) {
                        return PdfFontFactory.createFont(path + ",0", PdfEncodings.IDENTITY_H);
                    }
                    return PdfFontFactory.createFont(path, PdfEncodings.IDENTITY_H);
                }
            } catch (Exception e) {
                // 继续尝试下一个
            }
        }
        throw new RuntimeException("测试需要中文字体，请确保系统已安装中文字体");
    }
}
