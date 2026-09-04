import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.canvas.parser.PdfTextExtractor;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.AreaBreak;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.UnitValue;
import com.smartcare.backend.hljld.HljldDayEndMarker;
import com.smartcare.backend.hljld.HljldPdfFooterPolicy;
import com.smartcare.backend.hljld.HljldPdfLayoutConstants;
import com.smartcare.backend.hljld.HljldPdfRenderPurpose;
import com.smartcare.backend.hljld.HljldPdfRequestContext;
import com.smartcare.backend.service.HljldFlowPageEventHandler;
import com.smartcare.backend.service.HljldPdfFontBundle;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * 护理记录单 PDF 页脚渲染回归测试。
 *
 * <p>验证：
 * 1. 布局常量一致性
 * 2. 备注和审核护士签名仅在最终页显示
 * 3. 中间页不显示备注和签名
 * 4. FooterPolicy 在各场景下的正确性
 * 5. 07:00 边界计算
 * 6. PDF 文本提取验证
 */
public class TestHljldPdfRemarkLayout {

    // ══════════════════════════════════════════════════════════
    //  测试1：布局常量一致性
    // ══════════════════════════════════════════════════════════

    @Test
    public void testLayoutConstantsConsistency() {
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

        float col0Width = HljldPdfLayoutConstants.COL_WIDTHS_PT[0];
        float contentWidth = HljldPdfLayoutConstants.TABLE_WIDTH - col0Width;
        assertEquals(HljldPdfLayoutConstants.TABLE_WIDTH, col0Width + contentWidth, 0.01f,
            "备注Table宽度应等于主表宽度");

        assertEquals(4, HljldPdfLayoutConstants.REMARK_LINES.length, "应有4行备注");
        assertEquals(4, HljldPdfLayoutConstants.REMARK_ROWS, "REMARK_ROWS应为4");

        System.out.println("[PASS] testLayoutConstantsConsistency");
    }

    // ══════════════════════════════════════════════════════════
    //  测试2：单页PDF — 最终页有备注和签名
    // ══════════════════════════════════════════════════════════

    @Test
    public void testSinglePageWithRemarkAndSignature() throws Exception {
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_ALL, LocalDate.now(), null);

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, 1, policy);

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

        Table table = createTestTable(fonts.getPrimaryFont(), 5);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF应生成有效字节");

        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        assertEquals(1, rendered.getNumberOfPages(), "单页PDF应只有1页");

        // 提取文本验证
        String text = PdfTextExtractor.getTextFromPage(rendered.getPage(1));
        assertTrue(text.contains("备注"), "最终页应包含'备注'");
        assertTrue(text.contains("审核护士签名"), "最终页应包含'审核护士签名'");
        assertTrue(text.contains("第 1 页"), "应包含页码");

        System.out.println("[PASS] testSinglePageWithRemarkAndSignature - PDF=" + pdfBytes.length + " bytes");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试3：多页PDF — 仅最终页有备注和签名
    // ══════════════════════════════════════════════════════════

    @Test
    public void testMultiPageOnlyFinalPageHasRemark() throws Exception {
        // 先预渲染获取页数（独立字体）
        int totalPages = 预渲染获取页数(null, 40);

        // 正式渲染（独立字体）
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_ALL, LocalDate.now(), null);

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

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, totalPages, policy);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        Table table = createTestTable(fonts.getPrimaryFont(), 40);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        int pageCount = rendered.getNumberOfPages();
        assertTrue(pageCount >= 2, "大量数据应产生多页: pageCount=" + pageCount);

        // 验证：只有最后一页有备注和签名
        for (int i = 1; i <= pageCount; i++) {
            String text = PdfTextExtractor.getTextFromPage(rendered.getPage(i));
            boolean isLastPage = (i == pageCount);
            if (isLastPage) {
                assertTrue(text.contains("备注"), "第" + i + "页(最终页)应包含'备注'");
                assertTrue(text.contains("审核护士签名"), "第" + i + "页(最终页)应包含'审核护士签名'");
            } else {
                assertFalse(text.contains("备注"), "第" + i + "页(中间页)不应包含'备注'");
                assertFalse(text.contains("审核护士签名"), "第" + i + "页(中间页)不应包含'审核护士签名'");
            }
            assertTrue(text.contains("第 " + i + " 页"), "第" + i + "页应有正确页码");
        }

        System.out.println("[PASS] testMultiPageOnlyFinalPageHasRemark - 页数=" + pageCount);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试4：中间页不出现备注
    // ══════════════════════════════════════════════════════════

    @Test
    public void testIntermediatePagesNoRemark() throws Exception {
        // 先预渲染获取页数（独立字体）
        int totalPages = 预渲染获取页数(null, 50);

        // 正式渲染（独立字体）
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_ALL, LocalDate.now(), null);

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

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, totalPages, policy);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        Table table = createTestTable(fonts.getPrimaryFont(), 50);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        int pageCount = rendered.getNumberOfPages();
        assertTrue(pageCount >= 3, "大量数据应产生3+页: pageCount=" + pageCount);

        // 中间页（1 到 pageCount-1）不应有备注
        for (int i = 1; i < pageCount; i++) {
            String text = PdfTextExtractor.getTextFromPage(rendered.getPage(i));
            assertFalse(text.contains("备注"), "中间页第" + i + "页不应包含'备注'");
            assertFalse(text.contains("审核护士签名"), "中间页第" + i + "页不应包含'审核护士签名'");
        }

        // 最后一页应有
        String lastText = PdfTextExtractor.getTextFromPage(rendered.getPage(pageCount));
        assertTrue(lastText.contains("备注"), "最终页应包含'备注'");
        assertTrue(lastText.contains("审核护士签名"), "最终页应包含'审核护士签名'");

        System.out.println("[PASS] testIntermediatePagesNoRemark - 页数=" + pageCount);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试5：PRINT_DAY 未出科 — 只有签名无备注
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPrintDayNotDischarged() throws Exception {
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        // 未出科：effectiveDischargeNursingDate = null
        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_DAY, today, null);

        assertFalse(policy.isShowRemarkOnFinalPage(), "PRINT_DAY未出科不应显示备注");
        assertTrue(policy.isShowAuditSignatureOnFinalPage(), "PRINT_DAY应显示签名");

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, 1, policy);

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
        Table table = createTestTable(fonts.getPrimaryFont(), 5);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        String text = PdfTextExtractor.getTextFromPage(rendered.getPage(1));

        assertFalse(text.contains("备注"), "PRINT_DAY未出科最终页不应包含'备注'");
        assertTrue(text.contains("审核护士签名"), "PRINT_DAY最终页应包含'审核护士签名'");

        System.out.println("[PASS] testPrintDayNotDischarged");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试6：PRINT_DAY 出科护理日 — 备注+签名
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPrintDayDischargedDay() throws Exception {
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        LocalDate dischargeDay = LocalDate.of(2026, 9, 3);
        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_DAY, dischargeDay, dischargeDay);

        assertTrue(policy.isShowRemarkOnFinalPage(), "PRINT_DAY出科护理日应显示备注");
        assertTrue(policy.isShowAuditSignatureOnFinalPage(), "PRINT_DAY应显示签名");

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, 1, policy);

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
        Table table = createTestTable(fonts.getPrimaryFont(), 5);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        String text = PdfTextExtractor.getTextFromPage(rendered.getPage(1));

        assertTrue(text.contains("备注"), "PRINT_DAY出科护理日最终页应包含'备注'");
        assertTrue(text.contains("审核护士签名"), "PRINT_DAY最终页应包含'审核护士签名'");

        System.out.println("[PASS] testPrintDayDischargedDay");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试7：PREVIEW 未出科历史日 — 无备注无签名
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPreviewHistoryNotDischarged() throws Exception {
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        LocalDate historyDay = LocalDate.of(2026, 8, 1);
        // 未出科：effectiveDischargeNursingDate = null
        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PREVIEW, historyDay, null);

        assertFalse(policy.isShowRemarkOnFinalPage(), "PREVIEW历史日未出科不应显示备注");
        assertFalse(policy.isShowAuditSignatureOnFinalPage(), "PREVIEW历史日未出科不应显示签名");

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, 1, policy);

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
        Table table = createTestTable(fonts.getPrimaryFont(), 5);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        String text = PdfTextExtractor.getTextFromPage(rendered.getPage(1));

        assertFalse(text.contains("备注"), "PREVIEW历史日最终页不应包含'备注'");
        assertFalse(text.contains("审核护士签名"), "PREVIEW历史日最终页不应包含'审核护士签名'");
        assertTrue(text.contains("第 1 页"), "应包含页码");

        System.out.println("[PASS] testPreviewHistoryNotDischarged");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试8：PRINT_ALL 多护理日 — 仅整份最后一页有二者
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPrintAllMultiDay() throws Exception {
        // 先预渲染获取页数（独立字体）
        int totalPages = 预渲染获取多Day页数(null);

        // 正式渲染（独立字体）
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_ALL, LocalDate.now(), null);

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

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, totalPages, policy);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        // 护理日1
        Table table1 = createTestTable(fonts.getPrimaryFont(), 10);
        doc.add(table1);
        // 不添加 DayEndMarker（中间护理日）

        // 护理日2
        doc.add(new AreaBreak());
        Table table2 = createTestTable(fonts.getPrimaryFont(), 10);
        doc.add(table2);
        doc.add(new HljldDayEndMarker(dynamicMap));

        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        int pageCount = rendered.getNumberOfPages();
        assertTrue(pageCount >= 2, "两个护理日应产生2+页");

        // 只有最后一页有备注和签名
        for (int i = 1; i <= pageCount; i++) {
            String text = PdfTextExtractor.getTextFromPage(rendered.getPage(i));
            boolean isLast = (i == pageCount);
            if (isLast) {
                assertTrue(text.contains("备注"), "PRINT_ALL最终页应包含'备注'");
                assertTrue(text.contains("审核护士签名"), "PRINT_ALL最终页应包含'审核护士签名'");
            } else {
                assertFalse(text.contains("备注"), "PRINT_ALL中间页第" + i + "页不应包含'备注'");
                assertFalse(text.contains("审核护士签名"), "PRINT_ALL中间页第" + i + "页不应包含'审核护士签名'");
            }
        }

        System.out.println("[PASS] testPrintAllMultiDay - 页数=" + pageCount);
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试9：PRINT_RANGE 结束日非出科日 — 只有签名无备注
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPrintRangeNotDischargeDay() {
        LocalDate rangeEnd = LocalDate.of(2026, 9, 2);
        LocalDate dischargeDay = LocalDate.of(2026, 9, 3);

        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.ofRange(rangeEnd, dischargeDay);

        assertFalse(policy.isShowRemarkOnFinalPage(), "PRINT_RANGE结束日非出科日不应显示备注");
        assertTrue(policy.isShowAuditSignatureOnFinalPage(), "PRINT_RANGE应显示签名");

        System.out.println("[PASS] testPrintRangeNotDischargeDay");
    }

    // ══════════════════════════════════════════════════════════
    //  测试10：PRINT_RANGE 结束日等于出科日 — 备注+签名
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPrintRangeDischargeDay() {
        LocalDate dischargeDay = LocalDate.of(2026, 9, 3);

        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.ofRange(dischargeDay, dischargeDay);

        assertTrue(policy.isShowRemarkOnFinalPage(), "PRINT_RANGE结束日等于出科日应显示备注");
        assertTrue(policy.isShowAuditSignatureOnFinalPage(), "PRINT_RANGE应显示签名");

        System.out.println("[PASS] testPrintRangeDischargeDay");
    }

    // ══════════════════════════════════════════════════════════
    //  测试11：07:00 边界计算
    // ══════════════════════════════════════════════════════════

    @Test
    public void testNursingDateBoundary() {
        ZoneId zone = ZoneId.of("Asia/Shanghai");

        // 2026-09-04 06:59:59 → 属于 2026-09-03 护理日
        Instant t1 = ZonedDateTime.of(2026, 9, 4, 6, 59, 59, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 3), HljldPdfRequestContext.nursingDateOf(t1),
            "06:59:59应属于前一天护理日");

        // 2026-09-04 07:00:00 → 属于 2026-09-04 护理日
        Instant t2 = ZonedDateTime.of(2026, 9, 4, 7, 0, 0, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 4), HljldPdfRequestContext.nursingDateOf(t2),
            "07:00:00应属于当天护理日");

        // 2026-09-04 23:59:59 → 属于 2026-09-04 护理日
        Instant t3 = ZonedDateTime.of(2026, 9, 4, 23, 59, 59, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 4), HljldPdfRequestContext.nursingDateOf(t3),
            "23:59:59应属于当天护理日");

        // 2026-09-05 00:00:00 → 属于 2026-09-04 护理日
        Instant t4 = ZonedDateTime.of(2026, 9, 5, 0, 0, 0, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 4), HljldPdfRequestContext.nursingDateOf(t4),
            "次日00:00应属于前一天护理日");

        // null → 当前护理日
        LocalDate today = LocalDate.now(zone);
        assertEquals(today, HljldPdfRequestContext.nursingDateOf(null),
            "null应返回当前护理日");

        System.out.println("[PASS] testNursingDateBoundary");
    }

    // ══════════════════════════════════════════════════════════
    //  测试12：FooterPolicy 各场景覆盖
    // ══════════════════════════════════════════════════════════

    @Test
    public void testFooterPolicyScenarios() {
        LocalDate day1 = LocalDate.of(2026, 9, 1);
        LocalDate day2 = LocalDate.of(2026, 9, 2);
        LocalDate dischargeDay = LocalDate.of(2026, 9, 3);
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));

        // PREVIEW，未出科，历史日（current != refTimeNursingDate）
        HljldPdfFooterPolicy p1 = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PREVIEW, day1, null, today);
        assertFalse(p1.isShowRemarkOnFinalPage(), "PREVIEW未出科历史日不显示备注");
        assertFalse(p1.isShowAuditSignatureOnFinalPage(), "PREVIEW未出科历史日不显示签名");

        // PREVIEW，未出科，当前日（current == refTimeNursingDate）
        HljldPdfFooterPolicy p2 = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PREVIEW, today, null, today);
        assertTrue(p2.isShowRemarkOnFinalPage(), "PREVIEW未出科当前日应显示备注");
        assertTrue(p2.isShowAuditSignatureOnFinalPage(), "PREVIEW未出科当前日应显示签名");

        // PREVIEW，已出科，非出科日
        HljldPdfFooterPolicy p3 = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PREVIEW, day1, dischargeDay, today);
        assertFalse(p3.isShowRemarkOnFinalPage(), "PREVIEW已出科非出科日不显示备注");
        assertFalse(p3.isShowAuditSignatureOnFinalPage(), "PREVIEW已出科非出科日不显示签名");

        // PREVIEW，已出科，出科日
        HljldPdfFooterPolicy p4 = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PREVIEW, dischargeDay, dischargeDay, today);
        assertTrue(p4.isShowRemarkOnFinalPage(), "PREVIEW已出科出科日应显示备注");
        assertTrue(p4.isShowAuditSignatureOnFinalPage(), "PREVIEW已出科出科日应显示签名");

        // PRINT_DAY，未出科，今天
        HljldPdfFooterPolicy p5 = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_DAY, day1, null);
        assertFalse(p5.isShowRemarkOnFinalPage(), "PRINT_DAY未出科不显示备注");
        assertTrue(p5.isShowAuditSignatureOnFinalPage(), "PRINT_DAY应显示签名");

        // PRINT_DAY，出科日
        HljldPdfFooterPolicy p6 = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_DAY, dischargeDay, dischargeDay);
        assertTrue(p6.isShowRemarkOnFinalPage(), "PRINT_DAY出科日应显示备注");
        assertTrue(p6.isShowAuditSignatureOnFinalPage(), "PRINT_DAY出科日应显示签名");

        // PRINT_ALL
        HljldPdfFooterPolicy p7 = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_ALL, day1, null);
        assertTrue(p7.isShowRemarkOnFinalPage(), "PRINT_ALL应显示备注");
        assertTrue(p7.isShowAuditSignatureOnFinalPage(), "PRINT_ALL应显示签名");

        // PRINT_RANGE，结束日非出科日
        HljldPdfFooterPolicy p8 = HljldPdfFooterPolicy.ofRange(day2, dischargeDay);
        assertFalse(p8.isShowRemarkOnFinalPage(), "PRINT_RANGE结束日非出科日不显示备注");
        assertTrue(p8.isShowAuditSignatureOnFinalPage(), "PRINT_RANGE应显示签名");

        // PRINT_RANGE，结束日等于出科日
        HljldPdfFooterPolicy p9 = HljldPdfFooterPolicy.ofRange(dischargeDay, dischargeDay);
        assertTrue(p9.isShowRemarkOnFinalPage(), "PRINT_RANGE结束日等于出科日应显示备注");
        assertTrue(p9.isShowAuditSignatureOnFinalPage(), "PRINT_RANGE应显示签名");

        System.out.println("[PASS] testFooterPolicyScenarios - 9 scenarios verified");
    }

    // ══════════════════════════════════════════════════════════
    //  测试13：空护理日 — 签名仍显示（PRINT_DAY）
    // ══════════════════════════════════════════════════════════

    @Test
    public void testEmptyDayPrintDayHasSignature() throws Exception {
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PRINT_DAY, LocalDate.now(), null);

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, 1, policy);

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
        Table table = createTestTable(fonts.getPrimaryFont(), 1);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        String text = PdfTextExtractor.getTextFromPage(rendered.getPage(1));

        assertFalse(text.contains("备注"), "空护理日PRINT_DAY不应包含'备注'");
        assertTrue(text.contains("审核护士签名"), "空护理日PRINT_DAY应包含'审核护士签名'");

        System.out.println("[PASS] testEmptyDayPrintDayHasSignature");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试14：PREVIEW 当前护理日未出科 — 最终页有二者
    // ══════════════════════════════════════════════════════════

    @Test
    public void testPreviewCurrentDayNotDischarged() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        // 未出科：effectiveDischargeNursingDate = null
        // referenceTimeNursingDate = today（当前护理日）
        HljldPdfFooterPolicy policy = HljldPdfFooterPolicy.of(
            HljldPdfRenderPurpose.PREVIEW, today, null, today);

        assertTrue(policy.isShowRemarkOnFinalPage(),
            "PREVIEW未出科当前护理日应显示备注");
        assertTrue(policy.isShowAuditSignatureOnFinalPage(),
            "PREVIEW未出科当前护理日应显示签名");

        System.out.println("[PASS] testPreviewCurrentDayNotDischarged");
    }

    // ══════════════════════════════════════════════════════════
    //  测试15：nursingDateOf(null) 返回正确护理日（07:00边界）
    // ══════════════════════════════════════════════════════════

    @Test
    public void testNursingDateOfNullUsesNow() {
        ZoneId zone = ZoneId.of("Asia/Shanghai");
        LocalDate today = LocalDate.now(zone);
        java.time.LocalTime now = java.time.LocalTime.now(zone);

        LocalDate result = HljldPdfRequestContext.nursingDateOf(null);
        assertNotNull(result, "nursingDateOf(null) 不应返回 null");

        if (now.getHour() < 7) {
            // 07:00之前应返回昨天
            assertEquals(today.minusDays(1), result,
                "07:00之前 nursingDateOf(null) 应返回昨天护理日");
        } else {
            // 07:00之后应返回今天
            assertEquals(today, result,
                "07:00之后 nursingDateOf(null) 应返回今天护理日");
        }

        System.out.println("[PASS] testNursingDateOfNullUsesNow - now=" + now + ", result=" + result);
    }

    // ══════════════════════════════════════════════════════════
    //  测试16：nursingDateOf 固定时间验证
    // ══════════════════════════════════════════════════════════

    @Test
    public void testNursingDateOfFixedTimes() {
        ZoneId zone = ZoneId.of("Asia/Shanghai");

        // 边界：06:59:59 → 前一天
        Instant t1 = ZonedDateTime.of(2026, 9, 4, 6, 59, 59, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 3), HljldPdfRequestContext.nursingDateOf(t1),
            "06:59:59 应属于前一天");

        // 边界：07:00:00 → 当天
        Instant t2 = ZonedDateTime.of(2026, 9, 4, 7, 0, 0, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 4), HljldPdfRequestContext.nursingDateOf(t2),
            "07:00:00 应属于当天");

        // 午夜：00:00:00 → 前一天
        Instant t3 = ZonedDateTime.of(2026, 9, 5, 0, 0, 0, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 4), HljldPdfRequestContext.nursingDateOf(t3),
            "00:00:00 应属于前一天");

        // 23:59:59 → 当天
        Instant t4 = ZonedDateTime.of(2026, 9, 4, 23, 59, 59, 0, zone).toInstant();
        assertEquals(LocalDate.of(2026, 9, 4), HljldPdfRequestContext.nursingDateOf(t4),
            "23:59:59 应属于当天");

        System.out.println("[PASS] testNursingDateOfFixedTimes");
    }

    // ══════════════════════════════════════════════════════════
    //  测试17：空数据 PDF 使用 6 参数构造函数
    // ══════════════════════════════════════════════════════════

    @Test
    public void testEmptyPdfUsesSixParamConstructor() throws Exception {
        HljldPdfFontBundle fonts = createTestFontBundle();
        Map<Integer, Float> dynamicMap = new ConcurrentHashMap<>();

        // 使用 6 参数构造函数，policy=null，totalPages=1
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            fonts, "测试患者", 1, dynamicMap, 1, null);

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
        Table table = createTestTable(fonts.getPrimaryFont(), 1);
        doc.add(table);
        doc.add(new HljldDayEndMarker(dynamicMap));
        doc.close();

        byte[] pdfBytes = baos.toByteArray();
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
        PdfDocument rendered = new PdfDocument(reader);
        String text = PdfTextExtractor.getTextFromPage(rendered.getPage(1));

        // policy=null → 不绘制备注和签名
        assertFalse(text.contains("备注"), "空数据PDF不应包含'备注'（policy=null）");
        assertFalse(text.contains("审核护士签名"), "空数据PDF不应包含'审核护士签名'（policy=null）");
        assertTrue(text.contains("第 1 页"), "应包含页码");

        System.out.println("[PASS] testEmptyPdfUsesSixParamConstructor");
        rendered.close();
    }

    // ══════════════════════════════════════════════════════════
    //  测试18：AUDIT_SIG_BELOW_REMARK_OFFSET 常量验证
    // ══════════════════════════════════════════════════════════

    @Test
    public void testAuditSigOffsetConstant() {
        // 验证偏移常量为 -10f（8pt 字体需要至少 10pt 间距避免与边框重叠）
        assertEquals(-10f, HljldPdfLayoutConstants.AUDIT_SIG_BELOW_REMARK_OFFSET,
            0.01f, "审核护士签名偏移应为 -10f");

        // 验证 Y_BASE = REMARK_BOTTOM + 4f
        assertEquals(HljldPdfLayoutConstants.REMARK_BOTTOM + 4f,
            HljldPdfLayoutConstants.AUDIT_SIG_Y_BASE,
            0.01f, "AUDIT_SIG_Y_BASE = REMARK_BOTTOM + 4f");

        System.out.println("[PASS] testAuditSigOffsetConstant");
    }

    // ══════════════════════════════════════════════════════════
    //  辅助方法
    // ══════════════════════════════════════════════════════════

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

    private HljldPdfFontBundle createTestFontBundle() {
        return HljldPdfFontBundle.createForDocument();
    }

    /**
     * 预渲染获取单Day页数（每次创建独立字体）
     */
    private int 预渲染获取页数(HljldPdfFontBundle unused, int rowCount) {
        HljldPdfFontBundle localFonts = createTestFontBundle();
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

        Map<Integer, Float> tempMap = new ConcurrentHashMap<>();
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            localFonts, "测试患者", 1, tempMap, 0, null);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        Table table = createTestTable(localFonts.getPrimaryFont(), rowCount);
        doc.add(table);
        doc.close();

        try {
            PdfReader reader = new PdfReader(new ByteArrayInputStream(baos.toByteArray()));
            PdfDocument rendered = new PdfDocument(reader);
            int count = rendered.getNumberOfPages();
            rendered.close();
            return count;
        } catch (Exception e) {
            return 1;
        }
    }

    /**
     * 预渲染获取多Day页数（每次创建独立字体）
     */
    private int 预渲染获取多Day页数(HljldPdfFontBundle unused) {
        HljldPdfFontBundle localFonts = createTestFontBundle();
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

        Map<Integer, Float> tempMap = new ConcurrentHashMap<>();
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
            localFonts, "测试患者", 1, tempMap, 0, null);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);

        Table table1 = createTestTable(localFonts.getPrimaryFont(), 10);
        doc.add(table1);
        doc.add(new AreaBreak());
        Table table2 = createTestTable(localFonts.getPrimaryFont(), 10);
        doc.add(table2);
        doc.close();

        try {
            PdfReader reader = new PdfReader(new ByteArrayInputStream(baos.toByteArray()));
            PdfDocument rendered = new PdfDocument(reader);
            int count = rendered.getNumberOfPages();
            rendered.close();
            return count;
        } catch (Exception e) {
            return 2;
        }
    }
}
