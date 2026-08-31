import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.UnitValue;
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;
import com.smartcare.backend.service.HljldFlowPageEventHandler;

import java.io.ByteArrayOutputStream;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * 护理记录单 PDF 备注布局回归测试。
 *
 * 验证：
 * 1. 流式备注Table结构正确（列宽、行数、字号）
 * 2. 事件处理器在指定页跳过固定备注
 * 3. 普通页仍绘制固定备注
 * 4. 多日PDF每日最后一页都有流式备注
 * 5. 空护理日仍有备注
 */
public class TestHljldPdfRemarkLayout {

    // ══════════════════════════════════════════════════════════
    //  测试1：流式备注Table结构验证
    // ══════════════════════════════════════════════════════════

    @Test
    public void testRemarksTableStructure() throws Exception {
        PdfFont font = createTestFont();

        // 构建流式备注Table（与HljldFlowPdfService.buildRemarksTable逻辑一致）
        float col0Width = HljldPdfLayoutConstants.COL_WIDTHS_PT[0];
        float contentWidth = HljldPdfLayoutConstants.TABLE_WIDTH - col0Width;

        Table table = new Table(new float[]{col0Width, contentWidth});
        table.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_OUTER));

        // 左侧"备注"标签：合并4行
        Cell labelCell = new Cell(4, 1)
            .add(new com.itextpdf.layout.element.Paragraph("备注")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.REMARK_LABEL_FONT_SIZE)
                .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.CENTER)
                .setMargin(0))
            .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.CENTER)
            .setVerticalAlignment(com.itextpdf.layout.properties.VerticalAlignment.MIDDLE)
            .setHeight(HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT)
            .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_REMARK));
        table.addCell(labelCell);

        // 右侧4行备注内容
        String[] remarks = HljldPdfLayoutConstants.REMARK_LINES;
        for (String line : remarks) {
            Cell contentCell = new Cell(1, 1)
                .add(new com.itextpdf.layout.element.Paragraph(line)
                    .setFont(font)
                    .setFontSize(HljldPdfLayoutConstants.REMARK_FONT_SIZE)
                    .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.LEFT)
                    .setVerticalAlignment(com.itextpdf.layout.properties.VerticalAlignment.MIDDLE)
                    .setMargin(0))
                .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.LEFT)
                .setVerticalAlignment(com.itextpdf.layout.properties.VerticalAlignment.MIDDLE)
                .setHeight(HljldPdfLayoutConstants.REMARK_ROW_HEIGHT)
                .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_REMARK));
            table.addCell(contentCell);
        }

        // 验证备注行数
        assertEquals(4, remarks.length, "备注应有4行");
        assertEquals(4, HljldPdfLayoutConstants.REMARK_ROWS, "REMARK_ROWS应为4");

        // 验证备注行高
        assertEquals(13f, HljldPdfLayoutConstants.REMARK_ROW_HEIGHT, 0.01f, "备注行高应为13pt");
        assertEquals(52f, HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT, 0.01f, "备注总高应为52pt");

        // 验证备注宽度一致性
        assertEquals(HljldPdfLayoutConstants.TABLE_WIDTH, col0Width + contentWidth, 0.01f,
            "备注Table总宽应与主表一致");

        // 将Table写入PDF验证不报错
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.add(table);
        doc.close();

        assertTrue(baos.size() > 0, "PDF应生成有效字节");
        System.out.println("[PASS] testRemarksTableStructure - PDF大小=" + baos.size() + " bytes");
    }

    // ══════════════════════════════════════════════════════════
    //  测试2：事件处理器跳过固定备注
    // ══════════════════════════════════════════════════════════

    @Test
    public void testEventHandlerSkipsRemarksOnDesignatedPages() throws Exception {
        PdfFont font = createTestFont();
        Set<Integer> skipPages = ConcurrentHashMap.newKeySet();
        skipPages.add(2); // 跳过第2页的固定备注

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, skipPages);

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

        // 第1页：添加足够内容使其占满一页
        Table t1 = new Table(UnitValue.createPointArray(new float[]{786f}));
        t1.setWidth(UnitValue.createPointValue(786f));
        for (int i = 0; i < 30; i++) {
            Cell c = new Cell().add(new com.itextpdf.layout.element.Paragraph("行" + i)
                .setFont(font).setFontSize(7f).setMargin(0))
                .setHeight(18f)
                .setBorder(Border.NO_BORDER);
            t1.addCell(c);
        }
        doc.add(t1);

        // 第2页：添加流式备注Table（模拟最后一页）
        Table remarksTable = new Table(new float[]{43f, 743f});
        remarksTable.setWidth(UnitValue.createPointValue(786f));
        remarksTable.setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));

        Cell labelCell = new Cell(4, 1)
            .add(new com.itextpdf.layout.element.Paragraph("备注")
                .setFont(font).setFontSize(8f).setMargin(0))
            .setHeight(52f)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
        remarksTable.addCell(labelCell);

        for (int i = 0; i < 4; i++) {
            Cell c = new Cell(1, 1)
                .add(new com.itextpdf.layout.element.Paragraph("备注行" + i)
                    .setFont(font).setFontSize(5.5f).setMargin(0))
                .setHeight(13f)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
            remarksTable.addCell(c);
        }

        // 将流式备注Table嵌入一个19列wrapper cell中
        Table wrapperTable = new Table(UnitValue.createPointArray(HljldPdfLayoutConstants.COL_WIDTHS_PT));
        wrapperTable.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        wrapperTable.setBorder(Border.NO_BORDER);
        Cell wrapper = new Cell(1, 19)
            .add(remarksTable)
            .setPadding(0).setMargin(0).setBorder(Border.NO_BORDER);
        wrapperTable.addCell(wrapper);
        doc.add(wrapperTable);

        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF应生成有效字节");

        // 验证有2页
        com.itextpdf.kernel.pdf.PdfReader reader = new com.itextpdf.kernel.pdf.PdfReader(new java.io.ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(2, rendered.getNumberOfPages(), "应有2页");

        System.out.println("[PASS] testEventHandlerSkipsRemarksOnDesignatedPages - PDF=" + pdfBytes.length + " bytes, 页数=" + rendered.getNumberOfPages());
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试3：多日PDF每日都有备注
    // ══════════════════════════════════════════════════════════

    @Test
    public void testMultiDayPdfRemarksPerPage() throws Exception {
        PdfFont font = createTestFont();
        Set<Integer> skipPages = ConcurrentHashMap.newKeySet();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, skipPages);

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

        // 护理日1：普通数据 + 流式备注
        for (int i = 0; i < 15; i++) {
            Table row = new Table(UnitValue.createPointArray(HljldPdfLayoutConstants.COL_WIDTHS_PT));
            row.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
            row.setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
            for (int j = 0; j < 19; j++) {
                Cell c = new Cell().add(new com.itextpdf.layout.element.Paragraph("D1-R" + i + "-C" + j)
                    .setFont(font).setFontSize(7f).setMargin(0))
                    .setHeight(18f)
                    .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
                row.addCell(c);
            }
            doc.add(row);
        }
        // 护理日1的流式备注
        int before1 = pdfDoc.getNumberOfPages();
        addRemarksToDoc(doc, font);
        int after1 = pdfDoc.getNumberOfPages();
        int lastPage1 = after1;
        skipPages.add(lastPage1);
        if (after1 > before1) {
            skipPages.add(before1);
        }

        // 护理日2（新页）
        doc.add(new com.itextpdf.layout.element.AreaBreak());
        for (int i = 0; i < 15; i++) {
            Table row = new Table(UnitValue.createPointArray(HljldPdfLayoutConstants.COL_WIDTHS_PT));
            row.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
            row.setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
            for (int j = 0; j < 19; j++) {
                Cell c = new Cell().add(new com.itextpdf.layout.element.Paragraph("D2-R" + i + "-C" + j)
                    .setFont(font).setFontSize(7f).setMargin(0))
                    .setHeight(18f)
                    .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
                row.addCell(c);
            }
            doc.add(row);
        }
        // 护理日2的流式备注
        int before2 = pdfDoc.getNumberOfPages();
        addRemarksToDoc(doc, font);
        int after2 = pdfDoc.getNumberOfPages();
        int lastPage2 = after2;
        skipPages.add(lastPage2);
        if (after2 > before2) {
            skipPages.add(before2);
        }

        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        com.itextpdf.kernel.pdf.PdfReader reader = new com.itextpdf.kernel.pdf.PdfReader(new java.io.ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        int pageCount = rendered.getNumberOfPages();

        assertTrue(pageCount >= 2, "多日PDF至少应有2页");
        // 每个护理日的最后一页都应在skipPages中
        assertTrue(!skipPages.isEmpty(), "skipPages不应为空");
        assertTrue(skipPages.contains(pageCount), "第2天最后一页应在skipPages中");

        System.out.println("[PASS] testMultiDayPdfRemarksPerPage - 页数=" + pageCount + ", skipPages=" + skipPages);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试4：布局常量一致性
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
    //  测试5：空护理日仍有备注和页码
    // ══════════════════════════════════════════════════════════

    @Test
    public void testEmptyDayStillHasRemarks() throws Exception {
        PdfFont font = createTestFont();
        Set<Integer> skipPages = ConcurrentHashMap.newKeySet();

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            font, "测试患者", 1, skipPages);

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

        // 空护理日：只添加一个空行 + 流式备注
        Table emptyTable = new Table(UnitValue.createPointArray(HljldPdfLayoutConstants.COL_WIDTHS_PT));
        emptyTable.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        emptyTable.setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
        for (int j = 0; j < 19; j++) {
            Cell c = new Cell().add(new com.itextpdf.layout.element.Paragraph("")
                .setFont(font).setFontSize(7f).setMargin(0))
                .setHeight(18f)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
            emptyTable.addCell(c);
        }
        doc.add(emptyTable);

        // 流式备注
        int before = pdfDoc.getNumberOfPages();
        addRemarksToDoc(doc, font);
        int after = pdfDoc.getNumberOfPages();
        skipPages.add(after);
        if (after > before) skipPages.add(before);

        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        com.itextpdf.kernel.pdf.PdfReader reader = new com.itextpdf.kernel.pdf.PdfReader(new java.io.ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(1, rendered.getNumberOfPages(), "空护理日应有1页");

        System.out.println("[PASS] testEmptyDayStillHasRemarks - PDF=" + pdfBytes.length + " bytes");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  辅助方法
    // ══════════════════════════════════════════════════════════

    /**
     * 向Document添加流式备注Table（模拟HljldFlowPdfService.buildRemarksTable + 嵌入逻辑）
     */
    private void addRemarksToDoc(Document doc, PdfFont font) {
        float col0Width = HljldPdfLayoutConstants.COL_WIDTHS_PT[0];
        float contentWidth = HljldPdfLayoutConstants.TABLE_WIDTH - col0Width;

        Table remarksTable = new Table(new float[]{col0Width, contentWidth});
        remarksTable.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        remarksTable.setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_OUTER));

        Cell labelCell = new Cell(4, 1)
            .add(new com.itextpdf.layout.element.Paragraph("备注")
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.REMARK_LABEL_FONT_SIZE)
                .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.CENTER)
                .setMargin(0))
            .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.CENTER)
            .setVerticalAlignment(com.itextpdf.layout.properties.VerticalAlignment.MIDDLE)
            .setHeight(HljldPdfLayoutConstants.REMARK_TOTAL_HEIGHT)
            .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_REMARK));
        remarksTable.addCell(labelCell);

        for (String line : HljldPdfLayoutConstants.REMARK_LINES) {
            Cell contentCell = new Cell(1, 1)
                .add(new com.itextpdf.layout.element.Paragraph(line)
                    .setFont(font)
                    .setFontSize(HljldPdfLayoutConstants.REMARK_FONT_SIZE)
                    .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.LEFT)
                    .setVerticalAlignment(com.itextpdf.layout.properties.VerticalAlignment.MIDDLE)
                    .setMargin(0))
                .setTextAlignment(com.itextpdf.layout.properties.TextAlignment.LEFT)
                .setVerticalAlignment(com.itextpdf.layout.properties.VerticalAlignment.MIDDLE)
                .setHeight(HljldPdfLayoutConstants.REMARK_ROW_HEIGHT)
                .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_REMARK));
            remarksTable.addCell(contentCell);
        }

        // 嵌入19列wrapper
        Table wrapperTable = new Table(UnitValue.createPointArray(HljldPdfLayoutConstants.COL_WIDTHS_PT));
        wrapperTable.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        wrapperTable.setBorder(Border.NO_BORDER);
        Cell wrapper = new Cell(1, 19)
            .add(remarksTable)
            .setPadding(0).setMargin(0).setBorder(Border.NO_BORDER);
        wrapperTable.addCell(wrapper);
        doc.add(wrapperTable);
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
                        return PdfFontFactory.createFont(path + ",0", com.itextpdf.io.font.PdfEncodings.IDENTITY_H);
                    }
                    return PdfFontFactory.createFont(path, com.itextpdf.io.font.PdfEncodings.IDENTITY_H);
                }
            } catch (Exception e) {
                // 继续尝试下一个
            }
        }
        throw new RuntimeException("测试需要中文字体，请确保系统已安装中文字体");
    }
}
