package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.colors.DeviceGray;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.HorizontalAlignment;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.itextpdf.layout.properties.VerticalAlignment;
import com.smartcare.backend.entity.FormPageIndex;
import com.smartcare.backend.repository.FormPageIndexRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * ICU 护理记录单 PDF 生成服务
 * 使用 iText 7 Table + Cell 原生表格方案，支持 colspan/rowspan。
 *
 * 表格特征：
 * - 19 列双行层级表头（药物治疗/胃肠摄入/排出物/引流液 有子列）
 * - 动态行高：文本超宽自动换行
 * - 底部备注区 rowspan=4
 */
@Service
public class HljldPdfService {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfService.class);

    private final MongoTemplate mongoTemplate;
    private final FormPageIndexRepository pageIndexRepository;

    // 样式测试模式：只渲染表格结构，不渲染数据
    private static final boolean STYLE_TEST_MODE = true;

    // ── A4 横向尺寸 ──
    private static final float PAGE_WIDTH  = 842f;  // 297mm
    private static final float PAGE_HEIGHT = 595f;  // 210mm
    private static final float MARGIN = 10f;

    // ── 字体 ──
    private PdfFont baseFont;
    private boolean fontInitialized = false;

    // ── 表格样式常量 ──
    private static final float HEADER_FONT_SIZE = 7f;
    private static final float DATA_FONT_SIZE = 7f;
    private static final float REMARK_FONT_SIZE = 6.5f;
    private static final float TITLE_FONT_SIZE = 16f;
    private static final float INFO_FONT_SIZE = 9f;
    private static final float PAGE_NUM_FONT_SIZE = 10f;

    // ── 每页数据行数 ──
    private static final int MAX_ROWS_PER_PAGE = 17;

    // ── 19 列宽度(pt) ──
    // 总宽820pt: 日期50, 药物100+30+30=160, 胃肠100+30+30=160, 尿量30, 净超滤30, 排出物30+30=60, 引流液30+30=60, 检查30, 治疗30, 基础护理30, 健康教育30, 护理记录150, 签名30
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

    // ── 床旁数据编码白名单 ──
    private static final Set<String> DISPLAY_BEDSIDE_CODES = new HashSet<>(Arrays.asList(
        "param_带入药量", "param_kouFu", "param_biSi",
        "param_niaoLiang", "param_chaoLvLiang",
        "param_daBianAmount", "param_造瘘口量", "param_outuwuliang", "param_咯血", "param_tanLiang",
        "param_外出检查", "param_物理治疗", "param_基础护理1", "param_健康教育"
    ));

    private static final Set<String> LEGACY_DRAIN_CODES = new HashSet<>(Collections.singletonList(
        "param_tube_胃肠减压"
    ));

    private static final Map<String, String> OUTPUT_CODE_NAMES = new HashMap<>();
    static {
        OUTPUT_CODE_NAMES.put("param_daBianAmount", "大便量");
        OUTPUT_CODE_NAMES.put("param_造瘘口量", "造瘘口量");
        OUTPUT_CODE_NAMES.put("param_outuwuliang", "呕吐物量");
        OUTPUT_CODE_NAMES.put("param_咯血", "咯血");
        OUTPUT_CODE_NAMES.put("param_tanLiang", "痰液量");
    }

    // ── 备注内容 ──
    private static final String[] REMARK_LINES = {
        "检查：A：CT  B：核磁共振  C：胃镜  D：肠镜  E：超声检查  F：床旁胸片  G：心电图",
        "治疗：A：机械辅助排痰  B：气压治疗  C：雾化吸入  D：支气管镜灌洗  E：TDP照射  F：针灸治疗  G：运动治疗  H：肺复张",
        "基础护理：A：口腔护理  B：动/静脉置管护理  C：擦浴  D：会阴擦洗  E：肛周护理  F：更换引流袋  G：膀胱冲洗  H：压疮护理  I：床上洗头",
        "健康教育：A：入院指导  B：入科指导  C：疾病知识  D：药物指导  E：饮食指导  F：肢体活动指导  G：检查指导  H：安全指导  I：心理指导  J：术前指导  K：术后指导  L：转科/出院指导  M：用氧注意事项  N：通气配合指导  O：康复指导  P：VTE预防指导"
    };

    @Autowired
    public HljldPdfService(MongoTemplate mongoTemplate, FormPageIndexRepository pageIndexRepository) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
    }

    // ══════════════════════════════════════════════════════════
    //  字体初始化
    // ══════════════════════════════════════════════════════════

    private synchronized void initFont() {
        if (fontInitialized) return;
        fontInitialized = true;

        log.info("========== 字体初始化开始 ==========");

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
                log.info("classpath字体读取成功: {}, 字节数={}", resPath, fontBytes.length);

                String suffix = resPath.substring(resPath.lastIndexOf('.'));
                java.io.File tempFont = java.io.File.createTempFile("icu_font_", suffix);
                tempFont.deleteOnExit();
                java.nio.file.Files.write(tempFont.toPath(), fontBytes);
                log.info("字体已写入临时文件: {}, 大小={}bytes", tempFont.getAbsolutePath(), tempFont.length());

                // .ttc 文件需要指定索引
                String fontPath = tempFont.getAbsolutePath();
                if (fontPath.endsWith(".ttc")) {
                    baseFont = PdfFontFactory.createFont(fontPath + ",0", PdfEncodings.IDENTITY_H);
                } else {
                    baseFont = PdfFontFactory.createFont(fontPath, PdfEncodings.IDENTITY_H);
                }
                log.info("字体加载成功: name={}", baseFont.getFontProgram().getFontNames().getFontName());
                log.info("========== 字体初始化完成 ==========");
                return;
            } catch (Exception e) {
                log.warn("classpath字体加载失败 {}: {}", resPath, e.getMessage());
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

                if (fontPath.endsWith(".ttc")) {
                    baseFont = PdfFontFactory.createFont(fontPath + ",0", PdfEncodings.IDENTITY_H);
                } else {
                    baseFont = PdfFontFactory.createFont(fontPath, PdfEncodings.IDENTITY_H);
                }
                log.info("系统字体加载成功: {}", fontPath);
                log.info("========== 字体初始化完成(系统字体) ==========");
                return;
            } catch (Exception e) {
                log.warn("系统字体加载失败 {}: {}", fontPath, e.getMessage());
            }
        }

        log.error("========== 所有中文字体加载失败！PDF中文将无法正常显示 ==========");
    }

    // ══════════════════════════════════════════════════════════
    //  PDF 生成入口
    // ══════════════════════════════════════════════════════════

    /** 生成指定日期的护理记录 PDF */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("生成PDF: pid={}, date={}", pid, date);
        initFont();

        org.bson.Document patient = getPatientInfo(pid);
        NursingDayData dayData;

        if (STYLE_TEST_MODE) {
            log.info("PDF样式测试模式：使用空数据");
            dayData = new NursingDayData();
        } else {
            dayData = loadNursingDayData(pid, date);
        }

        int startPageNo = getStartPageNo(pid, date);
        log.info("PDF数据加载完成: patient={}, vitals={}, drugExe={}, nurseRecords={}, startPageNo={}",
            patient.getString("name"), dayData.getVitals().size(), dayData.getDrugExecutions().size(),
            dayData.getNurseRecords().size(), startPageNo);

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document doc = new Document(pdfDoc, PageSize.A4.rotate());
            doc.setMargins(MARGIN, MARGIN, MARGIN, MARGIN);

            if (dayData.isEmpty()) {
                addPageContent(doc, pdfDoc, patient, Collections.emptyList(), startPageNo, 1, date);
            } else {
                List<PageRows> pages = paginateData(dayData);
                log.info("PDF: 分页完成，共{}页", pages.size());
                for (int i = 0; i < pages.size(); i++) {
                    if (i > 0) pdfDoc.addNewPage();
                    addPageContent(doc, pdfDoc, patient, pages.get(i).rows, startPageNo + i, pages.size(), date);
                }
            }

            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            log.error("生成PDF失败", e);
            throw new RuntimeException("生成PDF失败: " + e.getMessage(), e);
        }
    }

    /** 生成全部记录的 PDF */
    public byte[] generateAllPagesPdf(String pid) {
        log.info("生成全部PDF: pid={}", pid);
        initFont();

        if (STYLE_TEST_MODE) {
            log.info("PDF样式测试模式：生成空白页");
            return generateEmptyPagePdf(pid, "全部");
        }

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

            boolean firstPage = true;
            for (FormPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
                NursingDayData dayData = loadNursingDayData(pid, dailyPage.getDate());
                if (dayData.isEmpty()) {
                    if (!firstPage) pdfDoc.addNewPage();
                    firstPage = false;
                    addPageContent(doc, pdfDoc, patient, Collections.emptyList(), dailyPage.getStartPageNo(), 1, dailyPage.getDate());
                } else {
                    List<PageRows> pages = paginateData(dayData);
                    for (int i = 0; i < pages.size(); i++) {
                        if (!firstPage) pdfDoc.addNewPage();
                        firstPage = false;
                        addPageContent(doc, pdfDoc, patient, pages.get(i).rows, dailyPage.getStartPageNo() + i, pages.size(), dailyPage.getDate());
                    }
                }
            }

            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            log.error("生成全部PDF失败", e);
            throw new RuntimeException("生成全部PDF失败: " + e.getMessage(), e);
        }
    }

    /** 计算某天的页数 */
    public int calculatePageCount(String pid, String date) {
        initFont();
        NursingDayData dayData = loadNursingDayData(pid, date);
        log.info("计算页数: pid={}, date={}, vitals={}, drugExe={}, nurseRecords={}",
            pid, date, dayData.getVitals().size(), dayData.getDrugExecutions().size(),
            dayData.getNurseRecords().size());
        int pageCount = paginateData(dayData).size();
        log.info("页数计算完成: pid={}, date={}, pageCount={}", pid, date, pageCount);
        return pageCount;
    }

    // ══════════════════════════════════════════════════════════
    //  页面内容构建
    // ══════════════════════════════════════════════════════════

    private void addPageContent(Document doc, PdfDocument pdfDoc, org.bson.Document patient,
                                List<Map<String, Object>> rows, int pageNo, int totalPages, String date) {
        // ===== 1. 标题 =====
        Paragraph titlePara = new Paragraph("重钢总医院重症医学科护理记录单")
            .setFont(baseFont)
            .setFontSize(TITLE_FONT_SIZE)
            .setTextAlignment(TextAlignment.CENTER)
            .setMarginBottom(2f);
        doc.add(titlePara);

        // ===== 2. 患者信息 =====
        String info = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s  诊断：%s",
            str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
            str(patient, "sex"), str(patient, "age"), str(patient, "diagnosis"));
        Paragraph infoPara = new Paragraph(info)
            .setFont(baseFont)
            .setFontSize(INFO_FONT_SIZE)
            .setMarginBottom(4f);
        doc.add(infoPara);

        // ===== 3. 表格（表头 + 数据 + 备注区） =====
        Table mainTable = buildMainTable(rows);
        doc.add(mainTable);

        // ===== 4. 页码 =====
        Paragraph pagePara = new Paragraph(String.format("第 %d 页", pageNo))
            .setFont(baseFont)
            .setFontSize(PAGE_NUM_FONT_SIZE)
            .setTextAlignment(TextAlignment.CENTER)
            .setMarginTop(8f);
        doc.add(pagePara);
    }

    // ══════════════════════════════════════════════════════════
    //  构建主表格（表头 + 数据行 + 备注区）
    // ══════════════════════════════════════════════════════════

    private Table buildMainTable(List<Map<String, Object>> rows) {
        // 创建19列表格，使用精确列宽
        Table table = new Table(UnitValue.createPointArray(COL_WIDTHS_PT));
        table.setWidth(UnitValue.createPointValue(820f));

        // 设置边框
        table.setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));

        // ── 表头（2行） ──
        addTableHeader(table);

        // ── 数据行（固定19行） ──
        int rowCount = 0;
        for (Map<String, Object> row : rows) {
            if (rowCount >= MAX_ROWS_PER_PAGE) break;
            addDataRow(table, row);
            rowCount++;
        }
        // 补充空行
        while (rowCount < MAX_ROWS_PER_PAGE) {
            addDataRow(table, null);
            rowCount++;
        }

        // ── 备注区（rowspan=4，集成在表格最后一行） ──
        addRemarkRow(table);

        return table;
    }

    // ══════════════════════════════════════════════════════════
    //  表头构建（层级 colspan + rowspan）
    // ══════════════════════════════════════════════════════════

    private void addTableHeader(Table table) {
        // ── 第一行 ──
        // 日期时间: rowspan=2 (1列)
        addHeaderCell(table, "日期时间", 1, 2);

        // 药物治疗: colspan=3, 无rowspan（有子列）
        addHeaderCell(table, "药物治疗", 3, 1);

        // 胃肠摄入: colspan=3, 无rowspan（有子列）
        addHeaderCell(table, "胃肠摄入", 3, 1);

        // 尿量: rowspan=2 (1列)，支持换行
        addHeaderCellWrap(table, "尿量(ml)", 1, 2);

        // 净超滤量: rowspan=2 (1列)，支持换行
        addHeaderCellWrap(table, "净超滤量(ml)", 1, 2);

        // 排出物: colspan=2, 无rowspan（有子列）
        addHeaderCell(table, "排出物", 2, 1);

        // 引流液: colspan=2, 无rowspan（有子列）
        addHeaderCell(table, "引流液", 2, 1);

        // 检查: rowspan=2 (1列)
        addHeaderCell(table, "检查", 1, 2);

        // 治疗: rowspan=2 (1列)
        addHeaderCell(table, "治疗", 1, 2);

        // 基础护理: rowspan=2 (1列)，支持换行
        addHeaderCellWrap(table, "基础护理", 1, 2);

        // 健康教育: rowspan=2 (1列)，支持换行
        addHeaderCellWrap(table, "健康教育", 1, 2);

        // 护理记录: rowspan=2 (1列)
        addHeaderCell(table, "护理记录", 1, 2);

        // 签名: rowspan=2 (1列)
        addHeaderCell(table, "签名", 1, 2);

        // ── 第二行（仅药物治疗、胃肠摄入、排出物、引流液有子列） ──
        // 药物治疗子列
        addSubHeaderCell(table, "名称");
        addSubHeaderCell(table, "量/ml");
        addSubHeaderCell(table, "途径");

        // 胃肠摄入子列
        addSubHeaderCell(table, "名称");
        addSubHeaderCell(table, "量/ml");
        addSubHeaderCell(table, "途径");

        // 排出物子列
        addSubHeaderCell(table, "名称");
        addSubHeaderCell(table, "量/ml");

        // 引流液子列
        addSubHeaderCell(table, "名称");
        addSubHeaderCell(table, "量/ml");
    }

    private void addHeaderCell(Table table, String text, int colspan, int rowspan) {
        Cell cell = new Cell(rowspan, colspan)
            .add(new Paragraph(text).setFont(baseFont).setFontSize(HEADER_FONT_SIZE))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(16f)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    private void addHeaderCellWrap(Table table, String text, int colspan, int rowspan) {
        // 不设置固定高度，让内容自动撑开实现换行
        Cell cell = new Cell(rowspan, colspan)
            .add(new Paragraph(text).setFont(baseFont).setFontSize(HEADER_FONT_SIZE))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    private void addSubHeaderCell(Table table, String text) {
        Cell cell = new Cell()
            .add(new Paragraph(text).setFont(baseFont).setFontSize(HEADER_FONT_SIZE - 0.5f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(18f)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f))
            .setBackgroundColor(ColorConstants.WHITE);
        table.addHeaderCell(cell);
    }

    // ══════════════════════════════════════════════════════════
    //  数据行
    // ══════════════════════════════════════════════════════════

    private void addDataRow(Table table, Map<String, Object> row) {
        // 19列数据字段映射
        String[] dataKeys = {
            "timeText",                      // 0: 日期时间
            "medName", "medAmount", "medRoute", // 1,2,3: 药物治疗
            "enteralName", "enteralAmount", "enteralRoute", // 4,5,6: 胃肠摄入
            "urine",                         // 7: 尿量
            "ultrafiltration",               // 8: 净超滤量
            "outputName", "outputAmount",    // 9,10: 排出物
            "drainName", "drainAmount",      // 11,12: 引流液
            "examination",                   // 13: 检查
            "treatment",                     // 14: 治疗
            "basicCare",                     // 15: 基础护理
            "healthEducation",               // 16: 健康教育
            "nursingRecord",                 // 17: 护理记录
            "signature"                      // 18: 签名
        };

        // 左对齐的字段索引
        Set<Integer> leftAlignFields = new HashSet<>(Arrays.asList(0, 1, 4, 7, 8, 9, 11));

        // 支持换行的字段索引
        Set<Integer> wrapFields = new HashSet<>(Arrays.asList(8, 15, 16)); // 净超滤量、基础护理、健康教育

        for (int i = 0; i < 19; i++) {
            String key = dataKeys[i];
            String text = (row != null) ? mapStr(row, key) : "";

            Cell cell = new Cell(1, 1)
                .add(new Paragraph(text).setFont(baseFont).setFontSize(DATA_FONT_SIZE))
                .setVerticalAlignment(VerticalAlignment.TOP)
                .setHeight(18f)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));

            if (leftAlignFields.contains(i)) {
                cell.setTextAlignment(TextAlignment.LEFT);
            } else {
                cell.setTextAlignment(TextAlignment.CENTER);
            }

            table.addCell(cell);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  备注区（rowspan=4）
    // ══════════════════════════════════════════════════════════

    private void addRemarkRow(Table table) {
        // 备注：第一列rowspan=4
        Cell labelCell = new Cell(4, 1)
            .add(new Paragraph("备注").setFont(baseFont).setFontSize(8f))
            .setTextAlignment(TextAlignment.CENTER)
            .setVerticalAlignment(VerticalAlignment.MIDDLE)
            .setHeight(14f)
            .setPadding(1f)
            .setBorder(new SolidBorder(ColorConstants.BLACK, 0.5f));
        table.addCell(labelCell);

        // 4行备注内容，每行18列（19-1=18）
        for (String line : REMARK_LINES) {
            Cell contentCell = new Cell(1, 18)
                .add(new Paragraph(line).setFont(baseFont).setFontSize(REMARK_FONT_SIZE))
                .setTextAlignment(TextAlignment.LEFT)
                .setVerticalAlignment(VerticalAlignment.MIDDLE)
                .setHeight(14f)
                .setPadding(1f)
                .setBorder(new SolidBorder(ColorConstants.BLACK, 0.3f));
            table.addCell(contentCell);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  分页
    // ══════════════════════════════════════════════════════════

    private List<PageRows> paginateData(NursingDayData dayData) {
        List<Map<String, Object>> allRows = convertToRows(dayData);
        log.info("分页计算: 总行数={}, 每页最大行数={}", allRows.size(), MAX_ROWS_PER_PAGE);

        List<PageRows> pages = new ArrayList<>();
        List<Map<String, Object>> current = new ArrayList<>();

        for (Map<String, Object> row : allRows) {
            current.add(row);
            if (current.size() >= MAX_ROWS_PER_PAGE) {
                pages.add(new PageRows(current));
                current = new ArrayList<>();
            }
        }
        if (!current.isEmpty()) pages.add(new PageRows(current));
        if (pages.isEmpty()) pages.add(new PageRows(Collections.emptyList()));

        log.info("分页完成: 页数={}, 每页行数={}", pages.size(),
            pages.stream().mapToInt(p -> p.rows.size()).toArray());
        return pages;
    }

    // ══════════════════════════════════════════════════════════
    //  数据加载（保留原有逻辑）
    // ══════════════════════════════════════════════════════════

    private NursingDayData loadNursingDayData(String pid, String date) {
        LocalDate localDate = LocalDate.parse(date, DateTimeFormatter.ISO_LOCAL_DATE);
        ZoneId zone = ZoneId.systemDefault();
        Date startTime = Date.from(localDate.atTime(7, 0).atZone(zone).toInstant());
        Date endTime = Date.from(localDate.plusDays(1).atTime(7, 0).atZone(zone).toInstant());

        log.info("加载护理日数据: pid={}, date={}, startTime={}, endTime={}", pid, date, startTime, endTime);

        NursingDayData data = new NursingDayData();
        data.setVitals(loadVitals(pid, startTime, endTime));
        data.setDrugExecutions(loadDrugExecutions(pid, startTime, endTime));
        data.setNurseRecords(loadNurseRecords(pid, startTime, endTime));

        log.info("护理日数据加载完成: vitals={}, drugExe={}, nurseRecords={}",
            data.getVitals().size(), data.getDrugExecutions().size(), data.getNurseRecords().size());
        return data;
    }

    private List<org.bson.Document> loadVitals(String pid, Date start, Date end) {
        Query q = new Query(Criteria.where("pid").is(pid).and("time").gte(start).lt(end));
        q.with(Sort.by(Sort.Direction.ASC, "time"));
        return mongoTemplate.find(q, org.bson.Document.class, "bedside");
    }

    private List<org.bson.Document> loadDrugExecutions(String pid, Date start, Date end) {
        Criteria overlap = new Criteria().andOperator(
            Criteria.where("startTime").lte(end),
            new Criteria().orOperator(
                Criteria.where("endTime").exists(false),
                Criteria.where("endTime").is(null),
                Criteria.where("endTime").gt(start)));
        Query q = new Query(Criteria.where("pid").is(pid).and("status").ne("invalid").andOperator(overlap));
        q.with(Sort.by(Sort.Direction.ASC, "startTime"));
        return mongoTemplate.find(q, org.bson.Document.class, "drugExe");
    }

    private List<org.bson.Document> loadNurseRecords(String pid, Date start, Date end) {
        Query q = new Query(Criteria.where("pid").is(pid.trim()).and("time").gte(start).lt(end)
            .and("valid").ne(false).and("desc").nin(null, ""));
        q.with(Sort.by(Sort.Direction.ASC, "time"));
        return mongoTemplate.find(q, org.bson.Document.class, "nurseRecords");
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
        // 强制从birthday计算年龄
        String age = calculateAgeFromBirthday(p);
        if (!age.isEmpty()) {
            p.put("age", age);
        } else {
            // 如果无法从birthday计算，尝试使用已有的age字段
            String existingAge = str(p, "age");
            if (existingAge.isEmpty()) {
                // 尝试其他可能的生日字段
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

        log.info("患者信息: pid={}, name={}, bedNo={}, mrn={}, sex={}, age={}, diagnosis={}",
            pid, str(p, "name"), str(p, "bedNo"), str(p, "mrn"),
            str(p, "sex"), str(p, "age"), str(p, "diagnosis"));
        return p;
    }

    // ══════════════════════════════════════════════════════════
    //  数据转换（保留原有逻辑）
    // ══════════════════════════════════════════════════════════

    private List<Map<String, Object>> convertToRows(NursingDayData dayData) {
        List<Map<String, Object>> rows = new ArrayList<>();
        SimpleDateFormat tf = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.CHINA);
        tf.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        TreeMap<Date, Map<String, Object>> timeMap = new TreeMap<>();

        log.info("数据转换开始: vitals={}, drugExe={}, nurseRecords={}",
            dayData.getVitals().size(), dayData.getDrugExecutions().size(),
            dayData.getNurseRecords().size());

        // 1. 床旁数据
        int bedsideRendered = 0;
        int bedsideSkipped = 0;
        for (org.bson.Document v : dayData.getVitals()) {
            if (!isRenderableBedsideRecord(v)) {
                bedsideSkipped++;
                continue;
            }
            Date t = v.getDate("time");
            if (t == null) continue;
            String code = str(v, "code");
            String val = str(v, "strVal");
            String remark = str(v, "remark");

            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));

            switch (code) {
                case "param_niaoLiang":
                    row.put("urine", val);
                    break;
                case "param_chaoLvLiang":
                    row.put("ultrafiltration", val);
                    break;
                case "param_daBianAmount": case "param_造瘘口量": case "param_outuwuliang":
                case "param_咯血": case "param_tanLiang":
                    row.put("outputName", getOutputName(code));
                    row.put("outputAmount", val);
                    break;
                case "param_带入药量": case "param_kouFu": case "param_biSi":
                    String route = "param_带入药量".equals(code) ? "带入" :
                                   "param_kouFu".equals(code) ? "po" : "鼻饲";
                    row.put("enteralName", remark != null ? remark.trim() : "");
                    row.put("enteralAmount", val);
                    row.put("enteralRoute", route);
                    break;
                case "param_外出检查":
                    row.put("examination", val);
                    break;
                case "param_物理治疗":
                    row.put("treatment", val);
                    break;
                case "param_基础护理1":
                    row.put("basicCare", val);
                    break;
                case "param_健康教育":
                    row.put("healthEducation", val);
                    break;
                default:
                    if (isDrainCode(code)) {
                        row.put("drainName", drainDisplayName(code));
                        row.put("drainAmount", val);
                    }
                    break;
            }
            bedsideRendered++;
        }
        log.info("床旁数据处理完成: 总数={}, 渲染={}, 跳过={}", dayData.getVitals().size(), bedsideRendered, bedsideSkipped);

        // 2. 护理记录
        int nurseRendered = 0;
        for (org.bson.Document r : dayData.getNurseRecords()) {
            Date t = r.getDate("time");
            if (t == null) continue;
            String desc = str(r, "desc");
            if (desc == null || desc.trim().isEmpty()) continue;

            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));
            String existing = mapStr(row, "nursingRecord");
            row.put("nursingRecord", existing.isEmpty() ? desc : existing + "\n" + desc);

            String signature = resolveNurseSignature(r);
            if (!signature.isEmpty()) row.put("signature", signature);
            nurseRendered++;
        }
        log.info("护理记录处理完成: 总数={}, 渲染={}", dayData.getNurseRecords().size(), nurseRendered);

        // 3. 药物执行
        int drugRendered = 0;
        for (org.bson.Document d : dayData.getDrugExecutions()) {
            Date t = d.getDate("startTime");
            if (t == null) continue;
            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));

            @SuppressWarnings("unchecked")
            List<org.bson.Document> drugList = (List<org.bson.Document>) d.get("drugList");
            if (drugList != null && !drugList.isEmpty()) {
                StringBuilder drugNames = new StringBuilder();
                for (org.bson.Document drug : drugList) {
                    String name = str(drug, "name");
                    String unit = str(drug, "unit");
                    if (!name.isEmpty()) {
                        if (drugNames.length() > 0) drugNames.append("、");
                        Object doseObj = drug.get("dose");
                        if (doseObj != null && !unit.isEmpty()) {
                            drugNames.append(name).append("(").append(doseObj).append(unit).append(")");
                        } else {
                            drugNames.append(name);
                        }
                    }
                }
                if (drugNames.length() > 0) row.put("medName", drugNames.toString());
            }

            String medAmount = resolveDrugAmount(d);
            if (!medAmount.isEmpty()) row.put("medAmount", medAmount);

            String route = str(d, "route");
            if (!route.isEmpty()) row.put("medRoute", route);
            drugRendered++;
        }
        log.info("药物执行处理完成: 总数={}, 渲染={}", dayData.getDrugExecutions().size(), drugRendered);

        rows.addAll(timeMap.values());
        log.info("数据转换完成: 合并后总行数={}", rows.size());
        return rows;
    }

    // ══════════════════════════════════════════════════════════
    //  工具方法（保留原有逻辑）
    // ══════════════════════════════════════════════════════════

    private boolean isDrainCode(String code) {
        if (code == null) return false;
        String normalizedCode = code.trim();
        return LEGACY_DRAIN_CODES.contains(normalizedCode) || normalizedCode.contains("引流");
    }

    private boolean isRenderableBedsideRecord(org.bson.Document record) {
        if (record == null) return false;
        String time = str(record, "time");
        String code = str(record, "code");
        if (time.isEmpty() || code.isEmpty()) return false;
        Object validObj = record.get("valid");
        if (validObj != null && validObj.equals(false)) return false;
        String status = str(record, "status").toLowerCase();
        if ("invalid".equals(status)) return false;
        if ("param_Yishi".equals(code)) return false;
        if (!DISPLAY_BEDSIDE_CODES.contains(code) && !isDrainCode(code)) return false;
        String strVal = str(record, "strVal");
        String remark = str(record, "remark");
        return !strVal.trim().isEmpty() || !remark.trim().isEmpty();
    }

    private String drainDisplayName(String code) {
        if (code == null) return "";
        String normalizedCode = code.trim();
        if ("param_tube_胃肠减压".equals(normalizedCode)) return "胃管负压引流量";
        String stripped = normalizedCode.replace("param_tube_", "").replace("param_", "");
        if (stripped.endsWith("管")) return stripped.substring(0, stripped.length() - 1) + "液";
        return stripped.replace("管", "液");
    }

    private String resolveDrugAmount(org.bson.Document execution) {
        Object topAmount = execution.get("liquidAmount");
        if (topAmount != null) {
            String val = topAmount.toString().trim();
            if (!val.isEmpty() && !"0".equals(val)) return val;
        }
        @SuppressWarnings("unchecked")
        List<org.bson.Document> drugList = (List<org.bson.Document>) execution.get("drugList");
        if (drugList != null) {
            double total = 0;
            for (org.bson.Document drug : drugList) {
                Object liquidAmount = drug.get("liquidAmount");
                if (liquidAmount != null) {
                    try { total += Double.parseDouble(liquidAmount.toString()); }
                    catch (NumberFormatException e) { /* ignore */ }
                }
            }
            if (total > 0) return String.valueOf(total);
        }
        return "";
    }

    private String resolveNurseSignature(org.bson.Document record) {
        String username = str(record, "username").trim();
        if (!username.isEmpty()) return username;
        String trueName = str(record, "trueName").trim();
        if (!trueName.isEmpty()) return trueName;
        String userId = str(record, "userId").trim();
        if (userId.isEmpty()) userId = str(record, "editUser").trim();
        return userId;
    }

    private String getOutputName(String code) {
        switch (code) {
            case "param_daBianAmount": return "大便量";
            case "param_造瘘口量": return "造瘘口量";
            case "param_outuwuliang": return "呕吐物量";
            case "param_咯血": return "咯血";
            case "param_tanLiang": return "痰液量";
            default: return "";
        }
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
        initFont();
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document doc = new Document(pdfDoc, PageSize.A4.rotate());
            doc.setMargins(MARGIN, MARGIN, MARGIN, MARGIN);

            org.bson.Document patient = getPatientInfo(pid);
            int startPageNo = getStartPageNo(pid, date);
            addPageContent(doc, pdfDoc, patient, Collections.emptyList(), startPageNo, 1, date);

            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("生成空白页PDF失败", e);
        }
    }

    // ── 内部类 ──

    private static class PageRows {
        final List<Map<String, Object>> rows;
        PageRows(List<Map<String, Object>> rows) { this.rows = rows; }
    }

    private static class NursingDayData {
        private List<org.bson.Document> vitals = new ArrayList<>();
        private List<org.bson.Document> drugExecutions = new ArrayList<>();
        private List<org.bson.Document> nurseRecords = new ArrayList<>();

        boolean isEmpty() { return vitals.isEmpty() && drugExecutions.isEmpty() && nurseRecords.isEmpty(); }
        List<org.bson.Document> getVitals() { return vitals; }
        void setVitals(List<org.bson.Document> v) { this.vitals = v; }
        List<org.bson.Document> getDrugExecutions() { return drugExecutions; }
        void setDrugExecutions(List<org.bson.Document> v) { this.drugExecutions = v; }
        List<org.bson.Document> getNurseRecords() { return nurseRecords; }
        void setNurseRecords(List<org.bson.Document> v) { this.nurseRecords = v; }
    }
}
