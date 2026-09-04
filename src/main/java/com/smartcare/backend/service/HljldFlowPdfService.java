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
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.AreaBreak;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.itextpdf.layout.properties.VerticalAlignment;
import com.smartcare.backend.entity.FormPageIndex;
import com.smartcare.backend.hljld.*;
import com.smartcare.backend.hljld.HljldPdfDataAssembler.HljldViewModel;
import com.smartcare.backend.repository.FormPageIndexRepository;
import org.bson.Document;
import org.slf4j.Logger;
import java.io.ByteArrayInputStream;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ICU 护理记录单 PDF 生成服务（流式分页版）
 *
 * 架构：
 * - 每个护理日创建一张父级流式 Table（19列）
 * - 两层表头通过 addHeaderCell 添加，跨页自动重复
 * - 普通数据行和小结/总结容器行交错加入同一张父级 Table
 * - 小结作为 colspan=19 的容器行嵌入父级 Table，内部包含4行嵌套 Table
 * - 标题、患者信息、备注、页码由 HljldFlowPageEventHandler 在每页绘制
 * - 文档边距精确匹配事件处理器坐标，保证表格边框连续
 * - 页数通过最终关闭后的 PDF 字节数统计
 */
@Service
public class HljldFlowPdfService {

    private static final Logger log = LoggerFactory.getLogger(HljldFlowPdfService.class);

    /** 统一时区：Asia/Shanghai */
    private static final java.time.ZoneId SHANGHAI_ZONE = java.time.ZoneId.of("Asia/Shanghai");

    private final FormPageIndexRepository pageIndexRepository;
    private final HljldPdfDataAssembler dataAssembler;
    private final HljldPatientResolver patientResolver;

    // ── 字体（只缓存路径） ──
    private volatile String cachedFontPath;
    private volatile boolean fontPathResolved = false;

    @Autowired
    public HljldFlowPdfService(FormPageIndexRepository pageIndexRepository,
                               HljldPdfDataAssembler dataAssembler,
                               HljldPatientResolver patientResolver) {
        this.pageIndexRepository = pageIndexRepository;
        this.dataAssembler = dataAssembler;
        this.patientResolver = patientResolver;
    }

    // ══════════════════════════════════════════════════════════
    //  可打印项模型
    // ══════════════════════════════════════════════════════════

    enum PrintableItemType { NORMAL_ROW, DAY_SUMMARY, FULL_DAY_SUMMARY, DISCHARGE_SUMMARY }

    static class PrintableItem {
        long sortTime;
        int sortPriority;
        String stableId;
        long stableSequence;
        PrintableItemType type;
        Map<String, Object> normalRow;
        HljldSummary summary;
        String title;  // 小结/总结标题
    }

    // ══════════════════════════════════════════════════════════
    //  字体
    // ══════════════════════════════════════════════════════════

    private synchronized void resolveFontPath() {
        if (fontPathResolved) return;
        fontPathResolved = true;
        String[] fontResources = {
            "/fonts/simsun.ttc", "/fonts/simsun.ttf", "/fonts/simsunb.ttf",
            "/fonts/SimsunExtG.ttf", "/fonts/Microsoft YaHei.ttf",
            "/fonts/NotoSansCJKsc-Regular.otf"
        };
        for (String resPath : fontResources) {
            try {
                org.springframework.core.io.Resource resource = new org.springframework.core.io.ClassPathResource(resPath);
                if (!resource.exists()) continue;
                byte[] fontBytes = resource.getInputStream().readAllBytes();
                String suffix = resPath.substring(resPath.lastIndexOf('.'));
                java.io.File tempFont = java.io.File.createTempFile("icu_flow_font_", suffix);
                tempFont.deleteOnExit();
                java.nio.file.Files.write(tempFont.toPath(), fontBytes);
                cachedFontPath = tempFont.getAbsolutePath();
                log.info("Flow PDF 字体: {}", cachedFontPath);
                return;
            } catch (Exception e) {
                log.warn("classpath字体失败 {}: {}", resPath, e.getMessage());
            }
        }
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] sysFontPaths = os.contains("windows")
            ? new String[]{ "C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf" }
            : new String[]{ "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "/usr/share/fonts/truetype/simsun.ttc" };
        for (String fp : sysFontPaths) {
            if (new java.io.File(fp).exists()) { cachedFontPath = fp; return; }
        }
        log.error("Flow PDF 无可用中文字体");
    }

    PdfFont createPdfFont() {
        resolveFontPath();
        if (cachedFontPath == null) throw new IllegalStateException("未找到可用的中文字体文件");
        try {
            String path = cachedFontPath;
            if (path.endsWith(".ttc")) {
                return PdfFontFactory.createFont(path + ",0", PdfEncodings.IDENTITY_H);
            }
            return PdfFontFactory.createFont(path, PdfEncodings.IDENTITY_H);
        } catch (Exception e) {
            throw new IllegalStateException("创建PdfFont失败: " + cachedFontPath, e);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  渲染结果
    // ══════════════════════════════════════════════════════════

    static class FlowPdfRenderResult {
        final byte[] pdfBytes;
        final int pageCount;
        final int renderedItemCount;
        FlowPdfRenderResult(byte[] pdfBytes, int pageCount, int renderedItemCount) {
            this.pdfBytes = pdfBytes;
            this.pageCount = pageCount;
            this.renderedItemCount = renderedItemCount;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  统一渲染核心
    // ══════════════════════════════════════════════════════════

    /**
     * 统一渲染入口。一次渲染同时得到 bytes 和 pageCount。
     * 页数通过最终关闭后的 PDF 字节数统计，不从未关闭的布局文档读取。
     *
     * @param itemsPerDay   每个护理日的可打印项列表（有序，包含普通行和小结/总结）
     * @param startPageNo   全局起始页码
     * @param pid           患者ID
     * @param referenceDate 参考日期（护理日日期）
     * @return 渲染结果（包含 pdfBytes 和 pageCount）
     */
    private FlowPdfRenderResult renderFlowPdf(
            List<List<PrintableItem>> itemsPerDay,
            int startPageNo,
            String pid,
            LocalDate referenceDate) {

        // 使用字体包（主字体 + 回退字体）
        HljldPdfFontBundle fonts = HljldPdfFontBundle.createForDocument();
        PdfFont font = fonts.getPrimaryFont();
        if (font == null) {
            throw new IllegalStateException("主字体加载失败，无法生成 PDF");
        }
        String patientInfo = getPatientInfoString(pid, referenceDate);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        com.itextpdf.layout.Document doc = new com.itextpdf.layout.Document(pdfDoc, PageSize.A4.rotate());

        // 设置边距：精确匹配事件处理器绘制区域
        // topMargin = 标题+患者信息高度 → 内容从 CONTENT_TOP 开始
        // bottomMargin = 备注+页码高度 → 内容到 CONTENT_BOTTOM 结束
        doc.setMargins(
            HljldPdfLayoutConstants.MARGIN_TOP,
            HljldPdfLayoutConstants.MARGIN_RIGHT,
            HljldPdfLayoutConstants.MARGIN_BOTTOM,
            HljldPdfLayoutConstants.MARGIN_LEFT
        );

        // 动态备注位置映射：记录每个护理日最后一页的正文结束Y坐标
        // 使用 ConcurrentHashMap 支持并发安全，键为本地物理页码
        Map<Integer, Float> dynamicRemarkTopByLocalPage = new ConcurrentHashMap<>();

        // 创建事件处理器并注册（在添加内容之前）
        HljldFlowPageEventHandler eventHandler = new HljldFlowPageEventHandler(
            fonts, patientInfo, startPageNo, dynamicRemarkTopByLocalPage);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, eventHandler);

        int totalRowCount = 0;
        boolean firstDay = true;

        for (List<PrintableItem> dayItems : itemsPerDay) {
            if (!firstDay) {
                doc.add(new AreaBreak());
            }
            firstDay = false;

            // 构建单张父级流式 Table（普通行 + 小结/总结容器行交错输出）
            Table dailyTable = buildDailyStreamingTable(dayItems, fonts);

            // 将 dailyTable 添加到文档（不添加流式备注）
            doc.add(dailyTable);

            // 添加零高度护理日结束标记，记录当前页码和内容结束Y坐标
            doc.add(new HljldDayEndMarker(dynamicRemarkTopByLocalPage));

            totalRowCount += dayItems.size();
        }

        // 关闭文档（触发 END_PAGE 事件，绘制页眉/备注/页码）
        doc.close();

        // 通过最终关闭后的 PDF 字节数统计物理页数
        byte[] pdfBytes = baos.toByteArray();
        int pageCount;
        try (PdfReader reader = new PdfReader(new ByteArrayInputStream(pdfBytes));
             PdfDocument rendered = new PdfDocument(reader)) {
            pageCount = rendered.getNumberOfPages();
        } catch (Exception e) {
            log.error("统计PDF页数失败", e);
            pageCount = 1;
        }

        return new FlowPdfRenderResult(pdfBytes, pageCount, totalRowCount);
    }

    // ══════════════════════════════════════════════════════════
    //  PDF 生成入口
    // ══════════════════════════════════════════════════════════

    /** 生成指定日期的护理记录 PDF（流式分页） */
    public byte[] generateDailyPdf(String pid, String date, String referenceTime) {
        log.info("Flow PDF 生成: pid={}, date={}, referenceTime={}", pid, date, referenceTime);

        LocalDate referenceDate = LocalDate.parse(date);
        List<PrintableItem> items = buildPrintableItems(date, pid, referenceTime);
        List<List<PrintableItem>> itemsPerDay = Collections.singletonList(items);
        int startPageNo = getStartPageNo(pid, date, "hljld2-flow");

        FlowPdfRenderResult result = renderFlowPdf(itemsPerDay, startPageNo, pid, referenceDate);
        log.info("Flow PDF 完成: pid={}, date={}, pageCount={}, items={}", pid, date, result.pageCount, items.size());
        return result.pdfBytes;
    }

    /** 生成全部记录的 PDF（流式分页，多护理日用 AreaBreak 分隔） */
    public byte[] generateAllPagesPdf(String pid, String referenceTime) {
        log.info("Flow PDF 生成全部: pid={}, referenceTime={}", pid, referenceTime);

        Optional<FormPageIndex> indexOpt = pageIndexRepository.findTopByPidAndFormType(pid, "hljld2-flow");
        if (indexOpt.isEmpty() || indexOpt.get().getDailyPages().isEmpty()) {
            log.warn("Flow PDF 索引不存在或为空: pid={}", pid);
            return generateEmptyPagePdf(pid, "全部");
        }

        FormPageIndex index = indexOpt.get();
        List<List<PrintableItem>> itemsPerDay = new ArrayList<>();
        List<LocalDate> dates = new ArrayList<>();

        for (FormPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
            dates.add(LocalDate.parse(dailyPage.getDate()));
            itemsPerDay.add(buildPrintableItems(dailyPage.getDate(), pid, referenceTime));
        }

        int startPageNo = 1;
        if (!index.getDailyPages().isEmpty()) {
            startPageNo = index.getDailyPages().get(0).getStartPageNo();
        }

        // 使用第一个护理日作为参考日期
        LocalDate referenceDate = dates.isEmpty() ? LocalDate.now() : dates.get(0);

        FlowPdfRenderResult result = renderFlowPdf(itemsPerDay, startPageNo, pid, referenceDate);
        log.info("Flow PDF 全部完成: pid={}, days={}, pageCount={}", pid, itemsPerDay.size(), result.pageCount);
        return result.pdfBytes;
    }

    /** 计算某天的页数（使用真实渲染） */
    public int calculateFlowPageCount(String pid, String date, String referenceTime) {
        LocalDate referenceDate = LocalDate.parse(date);
        List<PrintableItem> items = buildPrintableItems(date, pid, referenceTime);
        List<List<PrintableItem>> itemsPerDay = Collections.singletonList(items);
        FlowPdfRenderResult result = renderFlowPdf(itemsPerDay, 1, pid, referenceDate);
        log.info("Flow PDF 页数: pid={}, date={}, pageCount={}", pid, date, result.pageCount);
        return result.pageCount;
    }

    /** 生成空白页 PDF */
    private byte[] generateEmptyPagePdf(String pid, String date) {
        HljldPdfFontBundle fonts = HljldPdfFontBundle.createForDocument();
        PdfFont font = fonts.getPrimaryFont();
        if (font == null) {
            throw new IllegalStateException("主字体加载失败，无法生成空白页 PDF");
        }
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            com.itextpdf.layout.Document doc = new com.itextpdf.layout.Document(pdfDoc, PageSize.A4.rotate());

            doc.setMargins(
                HljldPdfLayoutConstants.MARGIN_TOP,
                HljldPdfLayoutConstants.MARGIN_RIGHT,
                HljldPdfLayoutConstants.MARGIN_BOTTOM,
                HljldPdfLayoutConstants.MARGIN_LEFT
            );

            LocalDate referenceDate = "全部".equals(date) ? LocalDate.now() : LocalDate.parse(date);
            String patientInfo = getPatientInfoString(pid, referenceDate);

            // 空数据：创建带表头的空表格
            Table table = createMainTable();
            addTableHeader(table, font);
            addDataRow(table, null, fonts);
            doc.add(table);

            HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(
                fonts, patientInfo, 1, Collections.emptyMap());
            pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);
            doc.close();

            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Flow PDF 空白页失败", e);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  单张父级流式 Table 架构
    // ══════════════════════════════════════════════════════════

    /**
     * 构建单张父级流式 Table。
     * 包含两层表头 + 所有普通数据行 + 小结/总结容器行。
     * 跨页时 iText 自动重复表头。
     */
    private Table buildDailyStreamingTable(List<PrintableItem> items, HljldPdfFontBundle fonts) {
        PdfFont font = fonts.getPrimaryFont();
        Table table = createMainTable();

        // 双层表头（通过 addHeaderCell 添加，跨页自动重复）
        addTableHeader(table, font);

        // 按时间轴顺序交错输出普通行和小结/总结容器行
        for (PrintableItem item : items) {
            if (item.type == PrintableItemType.NORMAL_ROW) {
                addDataRow(table, item.normalRow, fonts);
            } else {
                addSummaryContainerRow(table, item, font);
            }
        }

        return table;
    }

    /**
     * 创建主表格（19列，统一样式）
     */
    private Table createMainTable() {
        float[] widths = HljldPdfLayoutConstants.COL_WIDTHS_PT;
        Table table = new Table(UnitValue.createPointArray(widths));
        table.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_OUTER));
        table.setKeepTogether(false);
        return table;
    }

    // ══════════════════════════════════════════════════════════
    //  小结/总结容器行（嵌入父级 Table）
    // ══════════════════════════════════════════════════════════

    /**
     * 将小结/总结作为 colspan=19 的容器行嵌入父级 Table。
     * 内部包含一个4行嵌套 Table，整体 keep-together。
     */
    private void addSummaryContainerRow(Table parentTable, PrintableItem item, PdfFont font) {
        Table nestedSummary = buildNestedSummaryTable(item, font);
        Cell wrapper = new Cell(1, 19)
            .add(nestedSummary)
            .setPadding(0)
            .setMargin(0)
            .setKeepTogether(true)
            .setBorder(Border.NO_BORDER);
        parentTable.addCell(wrapper);
    }

    /**
     * 构建嵌套小结 Table（4行，keep-together）
     */
    private Table buildNestedSummaryTable(PrintableItem item, PdfFont font) {
        float[] widths = HljldPdfLayoutConstants.COL_WIDTHS_PT;
        Table table = new Table(UnitValue.createPointArray(widths));
        table.setWidth(UnitValue.createPointValue(HljldPdfLayoutConstants.TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_SUMMARY));
        table.setKeepTogether(true);
        table.setMarginTop(0);
        table.setMarginBottom(0);

        HljldSummary summary = item.summary;
        String title = item.title;  // 使用预设的标题

        String line2 = buildSummaryLine2(summary);
        String line3 = buildSummaryLine3(summary);
        String line4 = buildSummaryLine4(summary);

        // 第1行：标题，合并19列，居中
        Cell titleCell = new Cell(1, 19)
            .add(new Paragraph(title)
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.SUMMARY_TITLE_FONT_SIZE)
                .setTextAlignment(TextAlignment.CENTER)
                .setMargin(0))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(14f)
            .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_SUMMARY));
        table.addCell(titleCell);

        // 第2~4行：内容，合并19列，左对齐
        for (String line : new String[]{line2, line3, line4}) {
            Cell contentCell = new Cell(1, 19)
                .add(new Paragraph(line)
                    .setFont(font)
                    .setFontSize(HljldPdfLayoutConstants.SUMMARY_FONT_SIZE)
                    .setTextAlignment(TextAlignment.LEFT)
                    .setMargin(0))
                .setTextAlignment(TextAlignment.LEFT)
                .setVerticalAlignment(VerticalAlignment.MIDDLE)
                .setMinHeight(14f)
                .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_SUMMARY));
            table.addCell(contentCell);
        }

        return table;
    }

    /** 构建小结/总结第2行：入量相关 - 匹配前端格式 */
    private String buildSummaryLine2(HljldSummary s) {
        StringBuilder sb = new StringBuilder();
        sb.append("总入量：").append(formatVal(s.getInputSum())).append(" ml；");

        // 药物治疗 + 静脉入量明细
        if (s.getMedicationSum() > 0) {
            sb.append("药物治疗：").append(formatVal(s.getMedicationSum())).append(" ml");
            // 静脉入量明细
            if (s.getVeinItems() != null && !s.getVeinItems().isEmpty()) {
                sb.append("（");
                List<String> veinDetails = new ArrayList<>();
                for (SummaryItem item : s.getVeinItems()) {
                    veinDetails.add(item.getKey() + "：" + formatVal(item.getAmount()) + " ml");
                }
                sb.append(String.join("、", veinDetails));
                sb.append("）");
            }
        }

        // 胃肠入量 + 明细
        if (s.getEnteralSum() > 0) {
            sb.append("；胃肠入量：").append(formatVal(s.getEnteralSum())).append(" ml");
            if (s.getEnteralItems() != null && !s.getEnteralItems().isEmpty()) {
                sb.append("（");
                List<String> enteralDetails = new ArrayList<>();
                for (SummaryItem item : s.getEnteralItems()) {
                    enteralDetails.add(item.getKey() + "：" + formatVal(item.getAmount()) + " ml");
                }
                sb.append(String.join("、", enteralDetails));
                sb.append("）");
            }
        }

        return sb.toString();
    }

    /** 构建小结/总结第3行：出量相关 - 匹配前端格式 */
    private String buildSummaryLine3(HljldSummary s) {
        StringBuilder sb = new StringBuilder();
        sb.append("总出量：").append(formatVal(s.getOutputSum())).append(" ml；");

        // 尿量
        if (s.getUrineSum() > 0) {
            sb.append("尿量：").append(formatVal(s.getUrineSum())).append(" ml；");
        }

        // 净超滤量
        if (s.getUltrafiltrationSum() > 0) {
            sb.append("净超滤量：").append(formatVal(s.getUltrafiltrationSum())).append(" ml；");
        }

        // 排出物（痰液量、大便量等）
        if (s.getOutputItems() != null && !s.getOutputItems().isEmpty()) {
            double outputTotal = s.getOutputItems().stream()
                .mapToDouble(item -> item.getAmount())
                .sum();
            if (outputTotal > 0) {
                sb.append("排出物：").append(formatVal(outputTotal)).append(" ml（");

                List<String> outputDetails = new ArrayList<>();
                for (SummaryItem item : s.getOutputItems()) {
                    outputDetails.add(item.getKey() + "：" + formatVal(item.getAmount()) + " ml");
                }
                sb.append(String.join("、", outputDetails));
                sb.append("）；");
            }
        }

        // 引流液
        if (s.getDrainItems() != null && !s.getDrainItems().isEmpty()) {
            double drainTotal = s.getDrainItems().stream()
                .mapToDouble(item -> item.getAmount())
                .sum();
            if (drainTotal > 0) {
                sb.append("引流液：").append(formatVal(drainTotal)).append(" ml（");

                List<String> drainDetails = new ArrayList<>();
                for (SummaryItem item : s.getDrainItems()) {
                    drainDetails.add(item.getKey() + "：" + formatVal(item.getAmount()) + " ml");
                }
                sb.append(String.join("、", drainDetails));
                sb.append("）");
            }
        }

        return sb.toString();
    }

    /** 构建小结/总结第4行：平衡量 */
    private String buildSummaryLine4(HljldSummary s) {
        return "平衡量：" + String.format("%.0f", s.getBalance()) + " ml";
    }

    private String formatVal(double v) {
        return String.format("%.0f", v);
    }

    // ══════════════════════════════════════════════════════════
    //  表头构建（层级 colspan + rowspan）
    // ══════════════════════════════════════════════════════════

    private void addTableHeader(Table table, PdfFont font) {
        // ── 第一行 ──
        addHeaderCell(table, "日期时间", 1, 2, font);
        addHeaderCell(table, "药物治疗", 3, 1, font);
        addHeaderCell(table, "胃肠摄入", 3, 1, font);
        addHeaderCell(table, "尿量(ml)", 1, 2, font);
        addHeaderCell(table, "净超滤量(ml)", 1, 2, font);
        addHeaderCell(table, "排出物", 2, 1, font);
        addHeaderCell(table, "引流液", 2, 1, font);
        addHeaderCell(table, "检查", 1, 2, font);
        addHeaderCell(table, "治疗", 1, 2, font);
        addHeaderCell(table, "基础护理", 1, 2, font);
        addHeaderCell(table, "健康教育", 1, 2, font);
        addHeaderCell(table, "护理记录", 1, 2, font);
        addHeaderCell(table, "签名", 1, 2, font);

        // ── 第二行（子列） ──
        addSubHeaderCell(table, "名称", font);
        addSubHeaderCell(table, "量/ml", font);
        addSubHeaderCell(table, "途径", font);
        addSubHeaderCell(table, "名称", font);
        addSubHeaderCell(table, "量/ml", font);
        addSubHeaderCell(table, "途径", font);
        addSubHeaderCell(table, "名称", font);
        addSubHeaderCell(table, "量/ml", font);
        addSubHeaderCell(table, "名称", font);
        addSubHeaderCell(table, "量/ml", font);
    }

    private void addHeaderCell(Table table, String text, int colspan, int rowspan, PdfFont font) {
        addHeaderCell(table, text, colspan, rowspan, font, HljldPdfLayoutConstants.HEADER_FONT_SIZE);
    }

    private void addHeaderCell(Table table, String text, int colspan, int rowspan, PdfFont font, float fontSize) {
        Cell cell = new Cell(rowspan, colspan)
            .add(new Paragraph(text)
                .setFont(font)
                .setFontSize(fontSize)
                .setMargin(0)
                .setMultipliedLeading(1.0f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(HljldPdfLayoutConstants.HEADER_ROW_HEIGHT)
            .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_HEADER_INNER))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    private void addSubHeaderCell(Table table, String text, PdfFont font) {
        Cell cell = new Cell()
            .add(new Paragraph(text)
                .setFont(font)
                .setFontSize(HljldPdfLayoutConstants.SUB_HEADER_FONT_SIZE)
                .setMargin(0)
                .setMultipliedLeading(1.0f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(HljldPdfLayoutConstants.SUB_HEADER_ROW_HEIGHT)
            .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_HEADER_INNER))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    // ══════════════════════════════════════════════════════════
    //  数据行（动态行高 + 跨页）
    // ══════════════════════════════════════════════════════════

    private void addDataRow(Table table, Map<String, Object> row, HljldPdfFontBundle fonts) {
        String[] keys = HljldPdfLayoutConstants.DATA_KEYS;

        // Debug: 追踪氨溴索药物所在行
        if (row != null) {
            String medName = mapStr(row, "medName");
            String timeText = mapStr(row, "timeText");
            if (medName.contains("氨溴索")) {
                log.info("[hljld] addDataRow: timeText={}, medName={}", timeText, medName);
            }
        }

        for (int i = 0; i < 19; i++) {
            String text = (row != null) ? mapStr(row, keys[i]) : "";

            Cell cell = createDataCell(text, fonts, i);
            table.addCell(cell);
        }
    }

    /**
     * 创建数据单元格。
     * - 索引17（护理记录）：LEFT + TOP，自动换行
     * - 其他18列：CENTER + MIDDLE
     *
     * @param text         文本内容
     * @param fonts        字体包（支持 Unicode 下标/上标回退）
     * @param columnIndex  列索引
     * @return 数据单元格
     */
    private Cell createDataCell(String text, HljldPdfFontBundle fonts, int columnIndex) {
        boolean nursingRecord = columnIndex == HljldPdfLayoutConstants.NURSING_RECORD_COLUMN_INDEX;
        TextAlignment horizontal = nursingRecord ? TextAlignment.LEFT : TextAlignment.CENTER;
        VerticalAlignment vertical = nursingRecord ? VerticalAlignment.TOP : VerticalAlignment.MIDDLE;

        // 使用富文本渲染器，支持 Unicode 下标/上标
        Paragraph paragraph = HljldPdfTextRenderer.createParagraph(
            text,
            fonts,
            HljldPdfLayoutConstants.DATA_FONT_SIZE,
            horizontal
        );
        paragraph.setMargin(0)
            .setPadding(0)
            .setMultipliedLeading(1.0f);

        Cell cell = new Cell(1, 1)
            .add(paragraph)
            .setTextAlignment(horizontal)
            .setVerticalAlignment(vertical)
            .setMinHeight(HljldPdfLayoutConstants.DATA_ROW_MIN_HEIGHT)
            .setBorder(new SolidBorder(ColorConstants.BLACK, HljldPdfLayoutConstants.BORDER_DATA));
        cell.setKeepTogether(false);
        return cell;
    }

    // ══════════════════════════════════════════════════════════
    //  构建可打印项列表（时间轴交错输出）
    // ══════════════════════════════════════════════════════════

    List<PrintableItem> buildPrintableItems(String nursingDay, String pid, String referenceTime) {
        HljldViewModel viewModel = dataAssembler.buildPrintViewModel(nursingDay, pid, pid, referenceTime);
        HljldPdfRequestContext context = viewModel.getContext();
        List<PrintableItem> items = new ArrayList<>();

        List<HljldTimelineItem> timeline = viewModel.getTimeline();
        long seqCounter = 0; // 数字型稳定序号，避免字符串排序跨位数边界错乱

        if (timeline != null) {
            for (int ti = 0; ti < timeline.size(); ti++) {
                HljldTimelineItem tItem = timeline.get(ti);
                String tsPrefix = String.format("%04d", ti);

                if ((tItem.getKind() == HljldTimelineItem.Kind.TIME_GROUP
                    || tItem.getKind() == HljldTimelineItem.Kind.CONTINUATION)
                    && tItem.getGroup() != null) {
                    for (HljldDisplayRow row : tItem.getGroup().getRows()) {
                        if (row.getMedication() != null && row.getMedication().getName() != null
                            && row.getMedication().getName().contains("氨溴索")) {
                            log.info("[hljld] PDF行渲染: timeText={}, sortTime={}, medName={}",
                                row.getTimeText(), tItem.getTimestamp(), row.getMedication().getName());
                        }
                        PrintableItem pi = new PrintableItem();
                        pi.sortTime = tItem.getTimestamp();
                        pi.sortPriority = 20;
                        pi.stableId = tsPrefix + "-row-" + items.size();
                        pi.stableSequence = seqCounter++;
                        pi.type = PrintableItemType.NORMAL_ROW;
                        pi.normalRow = displayRowToMap(row);
                        items.add(pi);
                    }
                } else if (tItem.getKind() == HljldTimelineItem.Kind.DAY_SETTLEMENT && tItem.getGroup() != null) {
                    for (HljldDisplayRow row : tItem.getGroup().getRows()) {
                        PrintableItem pi = new PrintableItem();
                        pi.sortTime = tItem.getTimestamp();
                        pi.sortPriority = 25;
                        pi.stableId = tsPrefix + "-settlement-" + items.size();
                        pi.stableSequence = seqCounter++;
                        pi.type = PrintableItemType.NORMAL_ROW;
                        pi.normalRow = displayRowToMap(row);
                        items.add(pi);
                    }
                } else if (tItem.getSummary() != null) {
                    PrintableItem pi = new PrintableItem();
                    pi.sortTime = tItem.getTimestamp();
                    pi.stableId = tsPrefix + "-summary-" + tItem.getKind().name();
                    pi.stableSequence = seqCounter++;
                    if (tItem.getKind() == HljldTimelineItem.Kind.DAY_SUMMARY) {
                        pi.type = PrintableItemType.DAY_SUMMARY;
                        pi.sortPriority = 30;
                        pi.title = (context != null) ? context.getDaySummaryTitle() : "日间小结";
                    } else if (tItem.getKind() == HljldTimelineItem.Kind.FULL_DAY_SUMMARY) {
                        pi.type = PrintableItemType.FULL_DAY_SUMMARY;
                        pi.sortPriority = 50;
                        pi.title = (context != null) ? context.getFullDaySummaryTitle() : "24小时总结";
                    } else if (tItem.getKind() == HljldTimelineItem.Kind.DISCHARGE_SUMMARY) {
                        pi.type = PrintableItemType.DISCHARGE_SUMMARY;
                        pi.sortPriority = 60;
                        pi.title = (context != null) ? context.getDischargeSummaryTitle() : "出科总结";
                    } else {
                        continue;
                    }
                    pi.summary = tItem.getSummary();
                    items.add(pi);
                }
            }
        } else {
            // 回退：使用 displayGroups
            for (HljldTimeGroup group : viewModel.getDisplayGroups()) {
                for (HljldDisplayRow row : group.getRows()) {
                    PrintableItem pi = new PrintableItem();
                    pi.sortTime = group.getTimestamp();
                    pi.sortPriority = 20;
                    pi.stableId = "row-" + items.size();
                    pi.stableSequence = seqCounter++;
                    pi.type = PrintableItemType.NORMAL_ROW;
                    pi.normalRow = displayRowToMap(row);
                    items.add(pi);
                }
            }
        }

        // 稳定排序：sortTime → sortPriority → stableSequence（数字序号，避免字符串跨位数边界错乱）
        items.sort(Comparator
            .comparingLong((PrintableItem p) -> p.sortTime)
            .thenComparingInt((PrintableItem p) -> p.sortPriority)
            .thenComparingLong((PrintableItem p) -> p.stableSequence));

        return items;
    }

    private Map<String, Object> displayRowToMap(HljldDisplayRow row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("timeText", row.getTimeText() != null ? row.getTimeText() : "");
        // Debug: 追踪氨溴索药物的timeText映射
        if (row.getMedication() != null && row.getMedication().getName() != null
            && row.getMedication().getName().contains("氨溴索")) {
            log.info("[hljld] displayRowToMap: timeText={}, timestamp={}, medName={}",
                row.getTimeText(), row.getTimestamp(), row.getMedication().getName());
        }
        if (row.getMedication() != null && row.getMedication().hasNameOrAmount()) {
            map.put("medName", row.getMedication().getName());
            map.put("medAmount", row.getMedication().getAmount());
            map.put("medRoute", row.getMedication().getRoute());
        }
        if (row.getEnteral() != null && row.getEnteral().hasNameOrAmount()) {
            map.put("enteralName", row.getEnteral().getName());
            map.put("enteralAmount", row.getEnteral().getAmount());
            map.put("enteralRoute", row.getEnteral().getRoute());
        }
        map.put("urine", row.getUrine() != null ? row.getUrine() : "");
        map.put("ultrafiltration", row.getUltrafiltration() != null ? row.getUltrafiltration() : "");
        if (row.getOutput() != null && row.getOutput().hasAmountValue()) {
            map.put("outputName", row.getOutput().getName());
            map.put("outputAmount", row.getOutput().getAmount());
        }
        if (row.getDrain() != null && row.getDrain().hasAmountValue()) {
            map.put("drainName", row.getDrain().getName());
            map.put("drainAmount", row.getDrain().getAmount());
        }
        map.put("examination", row.getExamination() != null ? row.getExamination() : "");
        map.put("treatment", row.getTreatment() != null ? row.getTreatment() : "");
        map.put("basicCare", row.getBasicCare() != null ? row.getBasicCare() : "");
        map.put("healthEducation", row.getHealthEducation() != null ? row.getHealthEducation() : "");
        map.put("nursingRecord", row.getNursingRecord() != null ? row.getNursingRecord() : "");
        map.put("signature", row.getSignature() != null ? row.getSignature() : "");
        return map;
    }

    // ══════════════════════════════════════════════════════════
    //  患者信息
    // ══════════════════════════════════════════════════════════

    /**
     * 获取患者信息字符串。
     *
     * @param pid           患者标识
     * @param referenceDate 参考日期（护理日日期）
     * @return 格式化的患者信息字符串
     */
    private String getPatientInfoString(String pid, LocalDate referenceDate) {
        Document patient = patientResolver.findPatient(pid);
        if (patient == null) {
            patient = new Document();
            patient.put("name", "未知");
            patient.put("bedNo", "");
            patient.put("mrn", "");
            patient.put("sex", "");
            patient.put("age", "");
            patient.put("diagnosis", "");
        }

        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);
        return patientResolver.buildPatientInfo(patient, age);
    }

    int getStartPageNo(String pid, String date, String formType) {
        return pageIndexRepository.findTopByPidAndFormType(pid, formType)
            .flatMap(idx -> idx.getDailyPages().stream()
                .filter(d -> d.getDate().equals(date))
                .map(FormPageIndex.DailyPageInfo::getStartPageNo)
                .findFirst())
            .orElse(1);
    }

    String mapStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : "";
    }
}
