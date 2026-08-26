package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.HorizontalAlignment;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.itextpdf.layout.properties.VerticalAlignment;
import com.smartcare.backend.entity.FormPageIndex;
import com.smartcare.backend.hljld.*;
import com.smartcare.backend.hljld.HljldPdfDataAssembler.HljldViewModel;
import com.smartcare.backend.repository.FormPageIndexRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * ICU 护理记录单 PDF 生成服务（流式分页版）
 *
 * 与 HljldPdfService 的区别：
 * - 使用 iText 原生跨页能力，不固定每页行数
 * - 动态行高：cell.setMinHeight() 代替 setHeight()
 * - 单一连续 Table 跨页，iText 自动处理分页
 * - 页眉/页脚通过 PdfDocumentEvent 在每页绘制
 * - 备注区只在最后一页底部显示
 * - 页面数量通过 PdfDocument.getNumberOfPages() 确定
 *
 * 保留 HljldPdfService 不变，通过 layout=flow 参数切换。
 */
@Service
public class HljldFlowPdfService {

    private static final Logger log = LoggerFactory.getLogger(HljldFlowPdfService.class);

    private final MongoTemplate mongoTemplate;
    private final FormPageIndexRepository pageIndexRepository;
    private final HljldPdfDataAssembler dataAssembler;

    // ── A4 横向尺寸 ──
    private static final float PAGE_WIDTH  = 842f;  // 297mm
    private static final float PAGE_HEIGHT = 595f;  // 210mm
    private static final float MARGIN = 10f;

    // ── 字体（只缓存路径，不缓存 PdfFont 实例） ──
    private volatile String cachedFontPath;
    private volatile boolean fontPathResolved = false;

    // ── 表格样式常量 ──
    private static final float HEADER_FONT_SIZE = 7f;
    private static final float DATA_FONT_SIZE = 7f;
    private static final float REMARK_FONT_SIZE = 6.5f;
    private static final float REMARK_LABEL_FONT_SIZE = 8f;

    // ── 动态行高：最小高度 ──
    private static final float DATA_ROW_MIN_HEIGHT = 18f;
    private static final float REMARK_ROW_HEIGHT = 14f;
    private static final float HEADER_ROW_HEIGHT = 16f;
    private static final float SUB_HEADER_ROW_HEIGHT = 18f;

    // ── 19 列宽度(pt) ──
    private static final float[] COL_WIDTHS_PT = {
        50f,        // 日期时间
        100f, 30f, 30f, // 药物治疗 (名称100, 量30, 途径30)
        100f, 30f, 30f, // 胃肠摄入 (名称100, 量30, 途径30)
        30f,        // 尿量
        30f,        // 净超滤量
        30f, 30f,   // 排出物 (名称30, 量30)
        30f, 30f,   // 引流液 (名称30, 量30)
        30f,        // 检查
        30f,        // 治疗
        30f,        // 基础护理
        30f,        // 健康教育
        150f,       // 护理记录
        30f         // 签名
    };

    // ── 备注内容 ──
    private static final String[] REMARK_LINES = {
        "检查：A：CT  B：核磁共振  C：胃镜  D：肠镜  E：超声检查  F：床旁胸片  G：心电图",
        "治疗：A：机械辅助排痰  B：气压治疗  C：雾化吸入  D：支气管镜灌洗  E：TDP照射  F：针灸治疗  G：运动治疗  H：肺复张",
        "基础护理：A：口腔护理  B：动/静脉置管护理  C：擦浴  D：会阴擦洗  E：肛周护理  F：更换引流袋  G：膀胱冲洗  H：压疮护理  I：床上洗头",
        "健康教育：A：入院指导  B：入科指导  C：疾病知识  D：药物指导  E：饮食指导  F：肢体活动指导  G：检查指导  H：安全指导  I：心理指导  J：术前指导  K：术后指导  L：转科/出院指导  M：用氧注意事项  N：通气配合指导  O：康复指导  P：VTE预防指导"
    };

    @Autowired
    public HljldFlowPdfService(MongoTemplate mongoTemplate, FormPageIndexRepository pageIndexRepository,
                               HljldPdfDataAssembler dataAssembler) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
        this.dataAssembler = dataAssembler;
    }

    // ══════════════════════════════════════════════════════════
    //  字体路径解析（只缓存路径，每次 PDF 生成创建新 PdfFont）
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
                log.info("Flow PDF 字体路径解析完成: {}", cachedFontPath);
                return;
            } catch (Exception e) {
                log.warn("classpath字体读取失败 {}: {}", resPath, e.getMessage());
            }
        }

        // 回退：系统字体
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] sysFontPaths = os.contains("windows")
            ? new String[]{ "C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf" }
            : new String[]{ "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "/usr/share/fonts/truetype/simsun.ttc" };

        for (String fontPath : sysFontPaths) {
            try {
                java.io.File fontFile = new java.io.File(fontPath);
                if (!fontFile.exists()) continue;
                cachedFontPath = fontPath;
                log.info("Flow PDF 字体路径解析完成(系统字体): {}", fontPath);
                return;
            } catch (Exception e) {
                log.warn("系统字体检查失败 {}: {}", fontPath, e.getMessage());
            }
        }

        log.error("Flow PDF 所有中文字体加载失败！");
    }

    private PdfFont createPdfFont() {
        resolveFontPath();
        if (cachedFontPath == null) {
            throw new IllegalStateException("未找到可用的中文字体文件");
        }
        try {
            String path = cachedFontPath;
            if (path.endsWith(".ttc")) {
                return PdfFontFactory.createFont(path + ",0", PdfEncodings.IDENTITY_H);
            } else {
                return PdfFontFactory.createFont(path, PdfEncodings.IDENTITY_H);
            }
        } catch (Exception e) {
            throw new IllegalStateException("创建PdfFont失败: " + cachedFontPath, e);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  PDF 生成入口
    // ══════════════════════════════════════════════════════════

    /** 生成指定日期的护理记录 PDF（流式分页） */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("Flow PDF 生成: pid={}, date={}", pid, date);
        PdfFont font = createPdfFont();

        org.bson.Document patient = getPatientInfo(pid);
        HljldViewModel viewModel = dataAssembler.buildPrintViewModel(date, pid, pid);
        int startPageNo = getStartPageNo(pid, date);

        log.info("Flow PDF 数据加载完成: patient={}, timeline={}, daySummary={}, startPageNo={}",
            patient.getString("name"),
            viewModel.getTimeline() != null ? viewModel.getTimeline().size() : 0,
            viewModel.getDaySummary() != null,
            startPageNo);

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document doc = new Document(pdfDoc, PageSize.A4.rotate());
            doc.setMargins(MARGIN, MARGIN, MARGIN, MARGIN);

            // 构建患者信息字符串（用于页眉）
            String patientInfo = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s  诊断：%s",
                str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
                str(patient, "sex"), str(patient, "age"), str(patient, "diagnosis"));

            // 从 timeline 提取可打印行
            List<Map<String, Object>> printableRows = timelineToPrintableRows(viewModel);

            // 注册页事件处理器（页眉/页脚）
            HljldFlowPageEventHandler eventHandler = new HljldFlowPageEventHandler(font, patientInfo, MARGIN);
            pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, eventHandler);

            // 构建单一连续表格（iText 自动跨页）
            Table continuousTable = buildContinuousTable(printableRows, font);
            doc.add(continuousTable);

            // 在最后一页添加备注区（通过 setFixedPosition 固定在底部）
            addRemarksToLastPage(pdfDoc, font);

            doc.close();

            // 使用真实页数
            int realPageCount = pdfDoc.getNumberOfPages();
            log.info("Flow PDF 生成完成: pid={}, date={}, realPageCount={}, rows={}",
                pid, date, realPageCount, printableRows.size());

            return baos.toByteArray();
        } catch (Exception e) {
            log.error("Flow PDF 生成失败", e);
            throw new RuntimeException("Flow PDF 生成失败: " + e.getMessage(), e);
        }
    }

    /** 生成全部记录的 PDF（流式分页） */
    public byte[] generateAllPagesPdf(String pid) {
        log.info("Flow PDF 生成全部: pid={}", pid);
        PdfFont font = createPdfFont();

        Optional<FormPageIndex> indexOpt = pageIndexRepository.findByPidAndFormType(pid, "hljld2");
        if (indexOpt.isEmpty() || indexOpt.get().getDailyPages().isEmpty()) {
            return generateEmptyPagePdf(pid, "全部");
        }

        FormPageIndex index = indexOpt.get();
        org.bson.Document patient = getPatientInfo(pid);

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document doc = new Document(pdfDoc, PageSize.A4.rotate());
            doc.setMargins(MARGIN, MARGIN, MARGIN, MARGIN);

            String patientInfo = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s  诊断：%s",
                str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
                str(patient, "sex"), str(patient, "age"), str(patient, "diagnosis"));

            HljldFlowPageEventHandler eventHandler = new HljldFlowPageEventHandler(font, patientInfo, MARGIN);
            pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, eventHandler);

            // 收集所有天的数据行
            List<Map<String, Object>> allRows = new ArrayList<>();
            for (FormPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
                HljldViewModel viewModel = dataAssembler.buildPrintViewModel(dailyPage.getDate(), pid, pid);
                allRows.addAll(timelineToPrintableRows(viewModel));
            }

            // 构建单一连续表格
            Table continuousTable = buildContinuousTable(allRows, font);
            doc.add(continuousTable);

            // 备注区
            addRemarksToLastPage(pdfDoc, font);

            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            log.error("Flow PDF 生成全部失败", e);
            throw new RuntimeException("Flow PDF 生成全部失败: " + e.getMessage(), e);
        }
    }

    /** 计算某天的页数（使用真实的 PDF 渲染后页数） */
    public int calculateFlowPageCount(String pid, String date) {
        // 先生成 PDF，再读取真实页数
        byte[] pdfBytes = generateDailyPdf(pid, date);
        try {
            PdfDocument pdfDoc = new PdfDocument(new com.itextpdf.kernel.pdf.PdfReader(
                new java.io.ByteArrayInputStream(pdfBytes)));
            int pageCount = pdfDoc.getNumberOfPages();
            pdfDoc.close();
            log.info("Flow PDF 页数计算完成: pid={}, date={}, pageCount={}", pid, date, pageCount);
            return pageCount;
        } catch (Exception e) {
            log.error("Flow PDF 页数计算失败", e);
            throw new RuntimeException("计算页数失败: " + e.getMessage(), e);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  构建连续表格（核心：iText 自动跨页）
    // ══════════════════════════════════════════════════════════

    /**
     * 构建单一连续表格，iText 自动处理跨页。
     * - setKeepTogether(false) 允许行跨页
     * - setMinHeight() 实现动态行高
     */
    private Table buildContinuousTable(List<Map<String, Object>> rows, PdfFont font) {
        // 创建19列表格
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS_PT));
        table.setWidth(UnitValue.createPointValue(820f));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));

        // 允许表格跨页
        table.setKeepTogether(false);

        // ── 表头（2行） ──
        addTableHeader(table, font);

        // ── 数据行 ──
        if (rows.isEmpty()) {
            // 空数据：添加一行空行
            addDataRow(table, null, font);
        } else {
            for (Map<String, Object> row : rows) {
                addDataRow(table, row, font);
            }
        }

        return table;
    }

    // ══════════════════════════════════════════════════════════
    //  表头构建（层级 colspan + rowspan）
    // ══════════════════════════════════════════════════════════

    private void addTableHeader(Table table, PdfFont font) {
        // ── 第一行 ──
        addHeaderCell(table, "日期时间", 1, 2, font);
        addHeaderCell(table, "药物治疗", 3, 1, font);
        addHeaderCell(table, "胃肠摄入", 3, 1, font);
        addHeaderCellWrap(table, "尿量(ml)", 1, 2, font);
        addHeaderCellWrap(table, "净超滤量(ml)", 1, 2, font);
        addHeaderCell(table, "排出物", 2, 1, font);
        addHeaderCell(table, "引流液", 2, 1, font);
        addHeaderCell(table, "检查", 1, 2, font);
        addHeaderCell(table, "治疗", 1, 2, font);
        addHeaderCellWrap(table, "基础护理", 1, 2, font);
        addHeaderCellWrap(table, "健康教育", 1, 2, font);
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
        Cell cell = new Cell(rowspan, colspan)
            .add(new Paragraph(text).setFont(font).setFontSize(HEADER_FONT_SIZE))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(HEADER_ROW_HEIGHT)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    private void addHeaderCellWrap(Table table, String text, int colspan, int rowspan, PdfFont font) {
        Cell cell = new Cell(rowspan, colspan)
            .add(new Paragraph(text).setFont(font).setFontSize(HEADER_FONT_SIZE))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    private void addSubHeaderCell(Table table, String text, PdfFont font) {
        Cell cell = new Cell()
            .add(new Paragraph(text).setFont(font).setFontSize(HEADER_FONT_SIZE - 0.5f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(SUB_HEADER_ROW_HEIGHT)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    // ══════════════════════════════════════════════════════════
    //  数据行（动态行高 + 跨页）
    // ══════════════════════════════════════════════════════════

    private void addDataRow(Table table, Map<String, Object> row, PdfFont font) {
        String[] dataKeys = {
            "timeText",
            "medName", "medAmount", "medRoute",
            "enteralName", "enteralAmount", "enteralRoute",
            "urine",
            "ultrafiltration",
            "outputName", "outputAmount",
            "drainName", "drainAmount",
            "examination",
            "treatment",
            "basicCare",
            "healthEducation",
            "nursingRecord",
            "signature"
        };

        Set<Integer> leftAlignFields = new HashSet<>(Arrays.asList(0, 1, 4, 9, 11, 17));

        for (int i = 0; i < 19; i++) {
            String key = dataKeys[i];
            String text = (row != null) ? mapStr(row, key) : "";

            // 使用 setMinHeight 实现动态行高
            Cell cell = new Cell(1, 1)
                .add(new Paragraph(text).setFont(font).setFontSize(DATA_FONT_SIZE))
                .setVerticalAlignment(VerticalAlignment.TOP)
                .setMinHeight(DATA_ROW_MIN_HEIGHT)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));

            // 允许单元格跨页
            cell.setKeepTogether(false);

            if (leftAlignFields.contains(i)) {
                cell.setTextAlignment(TextAlignment.LEFT);
            } else {
                cell.setTextAlignment(TextAlignment.CENTER);
            }

            table.addCell(cell);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  备注区（添加到最后一页底部）
    // ══════════════════════════════════════════════════════════

    private void addRemarksToLastPage(PdfDocument pdfDoc, PdfFont font) {
        int lastPageIndex = pdfDoc.getNumberOfPages();
        if (lastPageIndex < 1) return;

        com.itextpdf.kernel.pdf.PdfPage lastPage = pdfDoc.getPage(lastPageIndex);

        // 备注区总高度：1行标签 + 4行内容 = 5行 * 14pt = 70pt
        float remarkTotalHeight = 5 * REMARK_ROW_HEIGHT + 10f; // 额外10pt间距
        float remarkY = MARGIN + 20f; // 距底部20pt（页码上方）

        try (Canvas canvas = new Canvas(lastPage,
                new Rectangle(MARGIN, remarkY, PAGE_WIDTH - 2 * MARGIN, remarkTotalHeight))) {

            // 备注表格：1列标签 + 18列内容
            Table remarkTable = new Table(UnitValue.createPointArray(
                new float[]{40f}  // 标签列
            ));
            remarkTable.setWidth(UnitValue.createPointValue(PAGE_WIDTH - 2 * MARGIN));

            // 备注标签（rowspan=4）
            Cell labelCell = new Cell(4, 1)
                .add(new Paragraph("备注").setFont(font).setFontSize(REMARK_LABEL_FONT_SIZE))
                .setTextAlignment(TextAlignment.CENTER)
                .setVerticalAlignment(VerticalAlignment.MIDDLE)
                .setHeight(REMARK_ROW_HEIGHT)
                .setPadding(1f)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
            remarkTable.addCell(labelCell);

            // 4行备注内容
            for (String line : REMARK_LINES) {
                Cell contentCell = new Cell(1, 1)
                    .add(new Paragraph(line).setFont(font).setFontSize(REMARK_FONT_SIZE))
                    .setTextAlignment(TextAlignment.LEFT)
                    .setVerticalAlignment(VerticalAlignment.MIDDLE)
                    .setHeight(REMARK_ROW_HEIGHT)
                    .setPadding(1f)
                    .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
                remarkTable.addCell(contentCell);
            }

            // 使用 canvas.add() 添加表格，而不是 showTextAligned
            canvas.add(remarkTable);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Timeline → 可打印行
    // ══════════════════════════════════════════════════════════

    private List<Map<String, Object>> timelineToPrintableRows(HljldViewModel viewModel) {
        List<Map<String, Object>> rows = new ArrayList<>();
        List<HljldTimelineItem> timeline = viewModel.getTimeline();
        if (timeline == null) {
            for (HljldTimeGroup group : viewModel.getDisplayGroups()) {
                for (HljldDisplayRow row : group.getRows()) {
                    rows.add(displayRowToMap(row));
                }
            }
            return rows;
        }

        for (HljldTimelineItem item : timeline) {
            if (item.getKind() == HljldTimelineItem.Kind.TIME_GROUP && item.getGroup() != null) {
                for (HljldDisplayRow row : item.getGroup().getRows()) {
                    rows.add(displayRowToMap(row));
                }
            } else if (item.getSummary() != null) {
                rows.add(summaryToPrintableRow(item));
            }
        }
        return rows;
    }

    private Map<String, Object> summaryToPrintableRow(HljldTimelineItem item) {
        HljldSummary summary = item.getSummary();
        Map<String, Object> row = new LinkedHashMap<>();

        String label = getSummaryLabel(item.getKind());
        row.put("timeText", label);

        StringBuilder detail = new StringBuilder();
        if (summary.getInputSum() > 0) {
            detail.append("总入量：").append(String.format("%.1f", summary.getInputSum())).append(" ml");
        }
        if (summary.getMedicationSum() > 0) {
            detail.append("；药物治疗：").append(String.format("%.1f", summary.getMedicationSum())).append(" ml");
        }
        if (summary.getEnteralSum() > 0) {
            detail.append("；胃肠摄入：").append(String.format("%.1f", summary.getEnteralSum())).append(" ml");
        }
        if (summary.getOutputSum() > 0) {
            detail.append("；总出量：").append(String.format("%.1f", summary.getOutputSum())).append(" ml");
        }
        if (summary.getUrineSum() > 0) {
            detail.append("；尿量：").append(String.format("%.1f", summary.getUrineSum())).append(" ml");
        }
        if (summary.getUltrafiltrationSum() > 0) {
            detail.append("；净超滤量：").append(String.format("%.1f", summary.getUltrafiltrationSum())).append(" ml");
        }
        detail.append("；平衡量：").append(String.format("%.1f", summary.getBalance())).append(" ml");

        row.put("nursingRecord", detail.toString());
        return row;
    }

    private String getSummaryLabel(HljldTimelineItem.Kind kind) {
        switch (kind) {
            case DAY_SUMMARY: return "日间小结";
            case SHIFT_SUMMARY: return "班段小结";
            case FULL_DAY_SUMMARY: return "24小时总结";
            case DISCHARGE_SUMMARY: return "出科总结";
            default: return "小结";
        }
    }

    // ══════════════════════════════════════════════════════════
    //  工具方法
    // ══════════════════════════════════════════════════════════

    private Map<String, Object> displayRowToMap(HljldDisplayRow row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("timeText", row.getTimeText() != null ? row.getTimeText() : "");

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

    private org.bson.Document getPatientInfo(String pid) {
        Query q = new Query(new Criteria().orOperator(
            Criteria.where("_id").is(pid), Criteria.where("pid").is(pid)));
        org.bson.Document p = mongoTemplate.findOne(q, org.bson.Document.class, "patient");
        if (p == null) {
            p = new org.bson.Document();
            p.put("name", "未知"); p.put("bedNo", ""); p.put("mrn", "");
            p.put("sex", ""); p.put("age", ""); p.put("diagnosis", "");
        }

        if (isEmpty(p, "bedNo")) {
            String bedNo = getFirstNonEmpty(p, "hisBed", "bedCode");
            if (!bedNo.isEmpty()) p.put("bedNo", bedNo);
        }
        if (isEmpty(p, "name")) {
            String name = getFirstNonEmpty(p, "patientName");
            if (!name.isEmpty()) p.put("name", name);
        }
        if (isEmpty(p, "mrn")) {
            String mrn = getFirstNonEmpty(p, "hospitalNo");
            if (!mrn.isEmpty()) p.put("mrn", mrn);
        }
        String rawSex = str(p, "sex");
        if (rawSex.isEmpty()) rawSex = str(p, "gender");
        p.put("sex", convertGenderText(rawSex));
        String age = calculateAgeFromBirthday(p);
        if (!age.isEmpty()) {
            p.put("age", age);
        } else {
            String existingAge = str(p, "age");
            if (existingAge.isEmpty()) {
                String[] otherBirthdayFields = {"patientBirthday", "birthDay", "birthdayStr"};
                for (String field : otherBirthdayFields) {
                    String birthday = str(p, field);
                    if (!birthday.isEmpty()) {
                        p.put("birthday", birthday);
                        age = calculateAgeFromBirthday(p);
                        if (!age.isEmpty()) {
                            p.put("age", age);
                            break;
                        }
                    }
                }
            }
        }
        String diagnosis = str(p, "diagnosis");
        if (diagnosis.isEmpty()) diagnosis = str(p, "clinicalDiagnosis");
        p.put("diagnosis", truncateDiagnosis(diagnosis));

        return p;
    }

    private boolean isEmpty(org.bson.Document doc, String key) {
        Object v = doc.get(key);
        return v == null || v.toString().trim().isEmpty();
    }

    private String getFirstNonEmpty(org.bson.Document doc, String... keys) {
        for (String key : keys) {
            Object v = doc.get(key);
            if (v != null) {
                String val = v.toString().trim();
                if (!val.isEmpty()) return val;
            }
        }
        return "";
    }

    private String convertGenderText(String gender) {
        if (gender == null) return "";
        String value = gender.trim();
        if ("Male".equalsIgnoreCase(value) || "M".equalsIgnoreCase(value) || "男".equals(value)) return "男";
        if ("Female".equalsIgnoreCase(value) || "F".equalsIgnoreCase(value) || "女".equals(value)) return "女";
        return value;
    }

    private String truncateDiagnosis(String diagnosis) {
        if (diagnosis == null) return "";
        String value = diagnosis.trim();
        if (value.isEmpty()) return "";
        int idx = -1;
        for (char sep : new char[]{';', '；', ',', '，'}) {
            int cur = value.indexOf(sep);
            if (cur >= 0 && (idx < 0 || cur < idx)) idx = cur;
        }
        return idx >= 0 ? value.substring(0, idx).trim() : value;
    }

    private String calculateAgeFromBirthday(org.bson.Document patient) {
        String birthdayStr = str(patient, "birthday");
        if (birthdayStr.isEmpty()) birthdayStr = str(patient, "birthDate");
        if (birthdayStr.isEmpty()) birthdayStr = str(patient, "birth");
        if (birthdayStr.isEmpty()) return "";

        try {
            java.time.Instant instant;
            if (birthdayStr.contains("T") && birthdayStr.endsWith("Z")) {
                instant = java.time.Instant.parse(birthdayStr);
            } else if (birthdayStr.contains("-")) {
                java.time.LocalDate birthDate = java.time.LocalDate.parse(birthdayStr.substring(0, 10));
                instant = birthDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            } else {
                return "";
            }
            java.time.LocalDate birthDate = java.time.LocalDate.ofInstant(instant, ZoneId.of("Asia/Shanghai"));
            java.time.LocalDate today = java.time.LocalDate.now(ZoneId.of("Asia/Shanghai"));
            int age = java.time.Period.between(birthDate, today).getYears();
            return String.valueOf(age);
        } catch (Exception e) {
            log.warn("计算年龄失败: birthday={}, error={}", birthdayStr, e.getMessage());
            return "";
        }
    }

    private int getStartPageNo(String pid, String date) {
        return pageIndexRepository.findByPidAndFormType(pid, "hljld2")
            .flatMap(idx -> idx.getDailyPages().stream()
                .filter(d -> d.getDate().equals(date))
                .map(FormPageIndex.DailyPageInfo::getStartPageNo)
                .findFirst())
            .orElse(1);
    }

    private String str(org.bson.Document doc, String key) {
        Object v = doc.get(key);
        return v != null ? v.toString() : "";
    }

    private String mapStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : "";
    }

    private byte[] generateEmptyPagePdf(String pid, String date) {
        PdfFont font = createPdfFont();
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document doc = new Document(pdfDoc, PageSize.A4.rotate());
            doc.setMargins(MARGIN, MARGIN, MARGIN, MARGIN);

            org.bson.Document patient = getPatientInfo(pid);
            String patientInfo = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s  诊断：%s",
                str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
                str(patient, "sex"), str(patient, "age"), str(patient, "diagnosis"));

            HljldFlowPageEventHandler eventHandler = new HljldFlowPageEventHandler(font, patientInfo, MARGIN);
            pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, eventHandler);

            // 空表格
            Table table = buildContinuousTable(Collections.emptyList(), font);
            doc.add(table);

            addRemarksToLastPage(pdfDoc, font);

            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Flow PDF 生成空白页失败", e);
        }
    }

}
