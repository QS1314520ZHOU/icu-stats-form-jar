package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.time.ZoneId;
import java.util.*;

/**
 * ICU 护理记录单 PDF 生成服务（流式分页版）
 *
 * 核心特性：
 * - iText 原生跨页，不固定每页行数
 * - 动态行高：setMinHeight() 代替 setHeight()
 * - 两遍渲染获取可靠页数
 * - 每页：页眉+表头+备注+页码
 * - 单条超长记录允许跨页
 * - 多护理日用 AreaBreak 分隔
 * - 保留 legacy 模式不变
 */
@Service
public class HljldFlowPdfService {

    private static final Logger log = LoggerFactory.getLogger(HljldFlowPdfService.class);

    private final MongoTemplate mongoTemplate;
    private final FormPageIndexRepository pageIndexRepository;
    private final HljldPdfDataAssembler dataAssembler;

    // ── 字体（只缓存路径） ──
    private volatile String cachedFontPath;
    private volatile boolean fontPathResolved = false;

    // ── 表格样式 ──
    private static final float HEADER_FONT_SIZE = 7f;
    private static final float DATA_FONT_SIZE = 7f;
    private static final float DATA_ROW_MIN_HEIGHT = 18f;

    // ── 19列宽度 ──
    static final float[] COL_WIDTHS_PT = {
        50f, 100f, 30f, 30f, 100f, 30f, 30f, 30f, 30f,
        30f, 30f, 30f, 30f, 30f, 30f, 30f, 30f, 150f, 30f
    };
    static final float TABLE_WIDTH = 820f;

    @Autowired
    public HljldFlowPdfService(MongoTemplate mongoTemplate, FormPageIndexRepository pageIndexRepository,
                               HljldPdfDataAssembler dataAssembler) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
        this.dataAssembler = dataAssembler;
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
    //  统一渲染核心（两遍共用）
    // ══════════════════════════════════════════════════════════

    static class FlowPdfRenderResult {
        final int pageCount;
        final int renderedRowCount;
        FlowPdfRenderResult(int pageCount, int renderedRowCount) {
            this.pageCount = pageCount;
            this.renderedRowCount = renderedRowCount;
        }
    }

    /**
     * 统一渲染入口。finalRender=false 时只计算页数，finalRender=true 时写入 OutputStream。
     *
     * @param printableRowsPerDay 每个护理日的数据行列表（有序）
     * @param startPageNo         全局起始页码
     * @param output              输出流（finalRender=true 时使用）
     * @param finalRender         是否正式渲染
     * @param pid                 患者ID
     * @return 渲染结果
     */
    private FlowPdfRenderResult renderFlowPdf(
            List<List<Map<String, Object>>> printableRowsPerDay,
            int startPageNo,
            OutputStream output,
            boolean finalRender,
            String pid) {

        PdfFont font = createPdfFont();
        org.bson.Document patient = getPatientInfo(pid);
        String patientInfo = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s  诊断：%s",
            str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
            str(patient, "sex"), str(patient, "age"), str(patient, "diagnosis"));

        PdfWriter writer = finalRender ? new PdfWriter(output) : new PdfWriter(new ByteArrayOutputStream());
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());

        // 正确计算边距：CONTENT_TOP是从页面底部算起的Y坐标，topMargin是从页面顶部算起的距离
        float topMargin = HljldFlowPageEventHandler.PAGE_HEIGHT - HljldFlowPageEventHandler.CONTENT_TOP;
        doc.setMargins(
            topMargin,
            HljldFlowPageEventHandler.MARGIN_RIGHT,
            HljldFlowPageEventHandler.CONTENT_BOTTOM,
            HljldFlowPageEventHandler.MARGIN_LEFT
        );

        int totalRowCount = 0;
        boolean firstDay = true;

        for (List<Map<String, Object>> dayRows : printableRowsPerDay) {
            if (!firstDay) {
                doc.add(new AreaBreak());
            }
            firstDay = false;

            Table table = buildContinuousTable(dayRows, font);
            doc.add(table);
            totalRowCount += dayRows.size();
        }

        // 获取真实页数（doc.close之前）
        int pageCount = pdfDoc.getNumberOfPages();

        // 注册页事件处理器（在doc.close之前）
        HljldFlowPageEventHandler eventHandler = new HljldFlowPageEventHandler(font, patientInfo, pageCount, startPageNo);
        pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, eventHandler);

        // 关闭文档（触发END_PAGE事件，绘制页眉/备注/页码）
        doc.close();

        return new FlowPdfRenderResult(pageCount, totalRowCount);
    }

    // ══════════════════════════════════════════════════════════
    //  PDF 生成入口
    // ══════════════════════════════════════════════════════════

    /** 生成指定日期的护理记录 PDF（流式分页） */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("Flow PDF 生成: pid={}, date={}", pid, date);

        HljldViewModel viewModel = dataAssembler.buildPrintViewModel(date, pid, pid);
        List<Map<String, Object>> rows = timelineToPrintableRows(viewModel);
        List<List<Map<String, Object>>> rowsPerDay = Collections.singletonList(rows);
        int startPageNo = getStartPageNo(pid, date, "hljld2-flow");

        // 第一遍：计算页数
        FlowPdfRenderResult pass1 = renderFlowPdf(rowsPerDay, startPageNo, null, false, pid);
        log.info("Flow PDF pass1: pageCount={}", pass1.pageCount);

        // 第二遍：正式渲染
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        renderFlowPdf(rowsPerDay, startPageNo, baos, true, pid);

        log.info("Flow PDF 完成: pid={}, date={}, pageCount={}, rows={}", pid, date, pass1.pageCount, rows.size());
        return baos.toByteArray();
    }

    /** 生成全部记录的 PDF（流式分页，多护理日用 AreaBreak 分隔） */
    public byte[] generateAllPagesPdf(String pid) {
        log.info("Flow PDF 生成全部: pid={}", pid);

        Optional<FormPageIndex> indexOpt = pageIndexRepository.findByPidAndFormType(pid, "hljld2-flow");
        if (indexOpt.isEmpty() || indexOpt.get().getDailyPages().isEmpty()) {
            indexOpt = pageIndexRepository.findByPidAndFormType(pid, "hljld2");
        }
        if (indexOpt.isEmpty() || indexOpt.get().getDailyPages().isEmpty()) {
            return generateEmptyPagePdf(pid, "全部");
        }

        FormPageIndex index = indexOpt.get();
        List<List<Map<String, Object>>> rowsPerDay = new ArrayList<>();

        for (FormPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
            HljldViewModel viewModel = dataAssembler.buildPrintViewModel(dailyPage.getDate(), pid, pid);
            rowsPerDay.add(timelineToPrintableRows(viewModel));
        }

        int startPageNo = 1;
        if (!index.getDailyPages().isEmpty()) {
            startPageNo = index.getDailyPages().get(0).getStartPageNo();
        }

        // 第一遍
        FlowPdfRenderResult pass1 = renderFlowPdf(rowsPerDay, startPageNo, null, false, pid);

        // 第二遍
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        renderFlowPdf(rowsPerDay, startPageNo, baos, true, pid);

        log.info("Flow PDF 全部完成: pid={}, days={}, pageCount={}", pid, rowsPerDay.size(), pass1.pageCount);
        return baos.toByteArray();
    }

    /** 计算某天的页数（使用真实渲染） */
    public int calculateFlowPageCount(String pid, String date) {
        HljldViewModel viewModel = dataAssembler.buildPrintViewModel(date, pid, pid);
        List<Map<String, Object>> rows = timelineToPrintableRows(viewModel);
        List<List<Map<String, Object>>> rowsPerDay = Collections.singletonList(rows);
        FlowPdfRenderResult result = renderFlowPdf(rowsPerDay, 1, null, false, pid);
        log.info("Flow PDF 页数: pid={}, date={}, pageCount={}", pid, date, result.pageCount);
        return result.pageCount;
    }

    /** 生成空白页 PDF */
    private byte[] generateEmptyPagePdf(String pid, String date) {
        PdfFont font = createPdfFont();
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document doc = new Document(pdfDoc, PageSize.A4.rotate());

            // 正确计算边距
            float topMargin = HljldFlowPageEventHandler.PAGE_HEIGHT - HljldFlowPageEventHandler.CONTENT_TOP;
            doc.setMargins(
                topMargin,
                HljldFlowPageEventHandler.MARGIN_RIGHT,
                HljldFlowPageEventHandler.CONTENT_BOTTOM,
                HljldFlowPageEventHandler.MARGIN_LEFT
            );

            org.bson.Document patient = getPatientInfo(pid);
            String patientInfo = String.format("床号：%s  姓名：%s  住院号：%s",
                str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"));

            Table table = buildContinuousTable(Collections.emptyList(), font);
            doc.add(table);

            int pageCount = pdfDoc.getNumberOfPages();
            HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(font, patientInfo, pageCount, 1);
            pdfDoc.addEventHandler(PdfDocumentEvent.END_PAGE, handler);
            doc.close();

            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Flow PDF 空白页失败", e);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  构建连续表格
    // ══════════════════════════════════════════════════════════

    Table buildContinuousTable(List<Map<String, Object>> rows, PdfFont font) {
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS_PT));
        table.setWidth(UnitValue.createPointValue(TABLE_WIDTH));
        table.setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        addTableHeader(table, font);

        if (rows.isEmpty()) {
            addDataRow(table, null, font);
        } else {
            for (Map<String, Object> row : rows) {
                addDataRow(table, row, font);
            }
        }
        return table;
    }

    // ══════════════════════════════════════════════════════════
    //  表头
    // ══════════════════════════════════════════════════════════

    private void addTableHeader(Table table, PdfFont font) {
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
            .add(new Paragraph(text).setFont(font).setFontSize(HEADER_FONT_SIZE)
                .setMargin(0).setMultipliedLeading(1.0f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(16f)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    private void addHeaderCellWrap(Table table, String text, int colspan, int rowspan, PdfFont font) {
        Cell cell = new Cell(rowspan, colspan)
            .add(new Paragraph(text).setFont(font).setFontSize(HEADER_FONT_SIZE)
                .setMargin(0).setMultipliedLeading(1.0f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    private void addSubHeaderCell(Table table, String text, PdfFont font) {
        Cell cell = new Cell()
            .add(new Paragraph(text).setFont(font).setFontSize(HEADER_FONT_SIZE - 0.5f)
                .setMargin(0).setMultipliedLeading(1.0f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(18f)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    // ══════════════════════════════════════════════════════════
    //  数据行（动态行高 + 跨页）
    // ══════════════════════════════════════════════════════════

    private void addDataRow(Table table, Map<String, Object> row, PdfFont font) {
        String[] dataKeys = {
            "timeText", "medName", "medAmount", "medRoute",
            "enteralName", "enteralAmount", "enteralRoute",
            "urine", "ultrafiltration",
            "outputName", "outputAmount", "drainName", "drainAmount",
            "examination", "treatment", "basicCare", "healthEducation",
            "nursingRecord", "signature"
        };

        Set<Integer> leftAlign = new HashSet<>(Arrays.asList(0, 1, 4, 9, 11, 17));

        for (int i = 0; i < 19; i++) {
            String text = (row != null) ? mapStr(row, dataKeys[i]) : "";

            Cell cell = new Cell(1, 1)
                .add(new Paragraph(text).setFont(font).setFontSize(DATA_FONT_SIZE)
                    .setMargin(0).setPadding(0).setMultipliedLeading(1.0f))
                .setVerticalAlignment(VerticalAlignment.TOP)
                .setMinHeight(DATA_ROW_MIN_HEIGHT)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
            cell.setKeepTogether(false);

            cell.setTextAlignment(leftAlign.contains(i) ? TextAlignment.LEFT : TextAlignment.CENTER);
            table.addCell(cell);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Timeline → 可打印行
    // ══════════════════════════════════════════════════════════

    List<Map<String, Object>> timelineToPrintableRows(HljldViewModel viewModel) {
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
        row.put("timeText", getSummaryLabel(item.getKind()));
        StringBuilder d = new StringBuilder();
        if (summary.getInputSum() > 0) d.append("总入量：").append(String.format("%.1f", summary.getInputSum())).append(" ml");
        if (summary.getMedicationSum() > 0) d.append("；药物治疗：").append(String.format("%.1f", summary.getMedicationSum())).append(" ml");
        if (summary.getEnteralSum() > 0) d.append("；胃肠摄入：").append(String.format("%.1f", summary.getEnteralSum())).append(" ml");
        if (summary.getOutputSum() > 0) d.append("；总出量：").append(String.format("%.1f", summary.getOutputSum())).append(" ml");
        if (summary.getUrineSum() > 0) d.append("；尿量：").append(String.format("%.1f", summary.getUrineSum())).append(" ml");
        if (summary.getUltrafiltrationSum() > 0) d.append("；净超滤量：").append(String.format("%.1f", summary.getUltrafiltrationSum())).append(" ml");
        d.append("；平衡量：").append(String.format("%.1f", summary.getBalance())).append(" ml");
        row.put("nursingRecord", d.toString());
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

    // ══════════════════════════════════════════════════════════
    //  工具方法
    // ══════════════════════════════════════════════════════════

    private org.bson.Document getPatientInfo(String pid) {
        Query q = new Query(new Criteria().orOperator(
            Criteria.where("_id").is(pid), Criteria.where("pid").is(pid)));
        org.bson.Document p = mongoTemplate.findOne(q, org.bson.Document.class, "patient");
        if (p == null) {
            p = new org.bson.Document();
            p.put("name", "未知"); p.put("bedNo", ""); p.put("mrn", "");
            p.put("sex", ""); p.put("age", ""); p.put("diagnosis", "");
        }
        if (isEmpty(p, "bedNo")) { String v = getFirstNonEmpty(p, "hisBed", "bedCode"); if (!v.isEmpty()) p.put("bedNo", v); }
        if (isEmpty(p, "name")) { String v = getFirstNonEmpty(p, "patientName"); if (!v.isEmpty()) p.put("name", v); }
        if (isEmpty(p, "mrn")) { String v = getFirstNonEmpty(p, "hospitalNo"); if (!v.isEmpty()) p.put("mrn", v); }
        String rawSex = str(p, "sex");
        if (rawSex.isEmpty()) rawSex = str(p, "gender");
        p.put("sex", convertGenderText(rawSex));
        String age = calculateAgeFromBirthday(p);
        if (!age.isEmpty()) p.put("age", age);
        else { String ea = str(p, "age"); if (ea.isEmpty()) { for (String f : new String[]{"patientBirthday","birthDay","birthdayStr"}) { String b = str(p,f); if (!b.isEmpty()) { p.put("birthday",b); age = calculateAgeFromBirthday(p); if (!age.isEmpty()) { p.put("age",age); break; }}}}}
        String diag = str(p, "diagnosis"); if (diag.isEmpty()) diag = str(p, "clinicalDiagnosis");
        p.put("diagnosis", truncateDiagnosis(diag));
        return p;
    }

    int getStartPageNo(String pid, String date, String formType) {
        return pageIndexRepository.findByPidAndFormType(pid, formType)
            .flatMap(idx -> idx.getDailyPages().stream()
                .filter(d -> d.getDate().equals(date))
                .map(FormPageIndex.DailyPageInfo::getStartPageNo)
                .findFirst())
            .orElse(1);
    }

    boolean isEmpty(org.bson.Document doc, String key) { Object v = doc.get(key); return v == null || v.toString().trim().isEmpty(); }
    String getFirstNonEmpty(org.bson.Document doc, String... keys) { for (String k : keys) { Object v = doc.get(k); if (v != null) { String val = v.toString().trim(); if (!val.isEmpty()) return val; }} return ""; }
    String str(org.bson.Document doc, String key) { Object v = doc.get(key); return v != null ? v.toString() : ""; }
    String mapStr(Map<String, Object> map, String key) { Object v = map.get(key); return v != null ? v.toString() : ""; }

    private String convertGenderText(String g) {
        if (g == null) return ""; String v = g.trim();
        if ("Male".equalsIgnoreCase(v)||"M".equalsIgnoreCase(v)||"男".equals(v)) return "男";
        if ("Female".equalsIgnoreCase(v)||"F".equalsIgnoreCase(v)||"女".equals(v)) return "女";
        return v;
    }

    private String truncateDiagnosis(String d) {
        if (d == null) return ""; String v = d.trim(); if (v.isEmpty()) return "";
        int idx = -1;
        for (char sep : new char[]{';','；',',','，'}) { int c = v.indexOf(sep); if (c >= 0 && (idx < 0 || c < idx)) idx = c; }
        return idx >= 0 ? v.substring(0, idx).trim() : v;
    }

    private String calculateAgeFromBirthday(org.bson.Document patient) {
        String bs = str(patient, "birthday"); if (bs.isEmpty()) bs = str(patient, "birthDate"); if (bs.isEmpty()) bs = str(patient, "birth");
        if (bs.isEmpty()) return "";
        try {
            java.time.Instant instant;
            if (bs.contains("T") && bs.endsWith("Z")) instant = java.time.Instant.parse(bs);
            else if (bs.contains("-")) { java.time.LocalDate bd = java.time.LocalDate.parse(bs.substring(0,10)); instant = bd.atStartOfDay(ZoneId.systemDefault()).toInstant(); }
            else return "";
            java.time.LocalDate bd = java.time.LocalDate.ofInstant(instant, ZoneId.of("Asia/Shanghai"));
            java.time.LocalDate today = java.time.LocalDate.now(ZoneId.of("Asia/Shanghai"));
            return String.valueOf(java.time.Period.between(bd, today).getYears());
        } catch (Exception e) { return ""; }
    }
}
