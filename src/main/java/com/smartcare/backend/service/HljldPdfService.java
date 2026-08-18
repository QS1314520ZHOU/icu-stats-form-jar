package com.smartcare.backend.service;

import com.smartcare.backend.entity.HljldPageIndex;
import com.smartcare.backend.repository.HljldPageIndexRepository;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;

/**
 * ICU 护理记录单 PDF 生成服务
 */
@Service
public class HljldPdfService {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfService.class);

    private final MongoTemplate mongoTemplate;
    private final HljldPageIndexRepository pageIndexRepository;

    // A4 横向尺寸（像素，72 DPI）
    private static final float PAGE_WIDTH = 841.89f;  // 297mm
    private static final float PAGE_HEIGHT = 595.28f; // 210mm

    // 边距
    private static final float MARGIN_TOP = 28.35f;   // 10mm
    private static final float MARGIN_BOTTOM = 42.52f; // 15mm
    private static final float MARGIN_LEFT = 19.84f;  // 7mm
    private static final float MARGIN_RIGHT = 19.84f;

    // 表格区域
    private static final float TABLE_TOP = 130f;      // 表头下方
    private static final float TABLE_BOTTOM = PAGE_HEIGHT - 70f; // 页码上方
    private static final float ROW_HEIGHT = 18f;      // 默认行高

    // 列宽配置（总宽度 = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT）
    private static final float[] COL_WIDTHS = {
        55f,  // 日期时间
        38f,  // 药物名称
        28f,  // 药物量
        28f,  // 药物途径
        38f,  // 胃肠名称
        28f,  // 胃肠量
        28f,  // 胃肠途径
        28f,  // 尿量
        35f,  // 净超滤量
        38f,  // 排出物名称
        28f,  // 排出物量
        38f,  // 引流液名称
        28f,  // 引流液量
        32f,  // 检查
        32f,  // 治疗
        32f,  // 基础护理
        32f,  // 健康教育
        120f, // 护理记录
        35f   // 签名
    };

    // 字体
    private PDFont chineseFont;
    private PDFont chineseFontBold;

    @Autowired
    public HljldPdfService(MongoTemplate mongoTemplate, HljldPageIndexRepository pageIndexRepository) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
    }

    @PostConstruct
    public void init() {
        try {
            // 加载中文字体
            InputStream fontStream = getClass().getResourceAsStream("/fonts/simsun.ttf");
            if (fontStream == null) {
                // 尝试加载系统字体
                fontStream = getClass().getResourceAsStream("/fonts/Microsoft YaHei.ttf");
            }
            if (fontStream == null) {
                // 尝试加载项目中的其他字体
                fontStream = getClass().getResourceAsStream("/fonts/NotoSansCJKsc-Regular.otf");
            }
            if (fontStream == null) {
                log.warn("未找到中文字体文件，将使用默认字体。请将字体文件放到 src/main/resources/fonts/ 目录下");
                // 使用 Helvetica 作为后备
                chineseFont = PDType1Font.HELVETICA;
            } else {
                PDDocument tempDoc = new PDDocument();
                chineseFont = PDType0Font.load(tempDoc, fontStream);
                log.info("中文字体加载成功");
            }
        } catch (IOException e) {
            log.error("加载中文字体失败，使用默认字体", e);
            chineseFont = PDType1Font.HELVETICA;
        }
    }

    /**
     * 生成指定日期的护理记录 PDF
     */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("生成PDF: pid={}, date={}", pid, date);

        // 1. 查询当天数据
        List<Document> timeline = loadTimelineData(pid, date);
        if (timeline.isEmpty()) {
            return generateEmptyPagePdf(pid, date);
        }

        // 2. 查询患者信息
        Document patient = getPatientInfo(pid);

        // 3. 查询页码信息
        int startPageNo = getStartPageNo(pid, date);

        // 4. 创建 PDF 文档
        try (PDDocument doc = new PDDocument()) {
            // 5. 分页渲染
            List<List<Document>> pages = paginateData(timeline);

            for (int i = 0; i < pages.size(); i++) {
                PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
                doc.addPage(page);

                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    // 渲染固定部分
                    renderHeader(cs, patient);
                    renderTableHeader(cs);
                    renderFooter(cs, startPageNo + i, pages.size(), date);

                    // 渲染动态数据
                    renderTableData(cs, pages.get(i));
                }
            }

            // 6. 转换为字节数组
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        } catch (IOException e) {
            log.error("生成PDF失败", e);
            throw new RuntimeException("生成PDF失败: " + e.getMessage(), e);
        }
    }

    /**
     * 生成全部记录的 PDF
     */
    public byte[] generateAllPagesPdf(String pid) {
        log.info("生成全部PDF: pid={}", pid);

        // 1. 查询页码索引
        Optional<HljldPageIndex> indexOpt = pageIndexRepository.findByPid(pid);
        if (indexOpt.isEmpty() || indexOpt.get().getDailyPages().isEmpty()) {
            return generateEmptyPagePdf(pid, "全部");
        }

        HljldPageIndex index = indexOpt.get();

        // 2. 创建 PDF 文档
        try (PDDocument doc = new PDDocument()) {
            // 3. 按日期顺序生成每一页
            for (HljldPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
                List<Document> timeline = loadTimelineData(pid, dailyPage.getDate());
                Document patient = getPatientInfo(pid);

                if (timeline.isEmpty()) {
                    // 空白页
                    PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
                    doc.addPage(page);
                    try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                        renderHeader(cs, patient);
                        renderTableHeader(cs);
                        renderEmptyMessage(cs);
                        renderFooter(cs, dailyPage.getStartPageNo(), 1, dailyPage.getDate());
                    }
                } else {
                    // 数据页
                    List<List<Document>> pages = paginateData(timeline);
                    for (int i = 0; i < pages.size(); i++) {
                        PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
                        doc.addPage(page);
                        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                            renderHeader(cs, patient);
                            renderTableHeader(cs);
                            renderTableData(cs, pages.get(i));
                            renderFooter(cs, dailyPage.getStartPageNo() + i, pages.size(), dailyPage.getDate());
                        }
                    }
                }
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        } catch (IOException e) {
            log.error("生成全部PDF失败", e);
            throw new RuntimeException("生成全部PDF失败: " + e.getMessage(), e);
        }
    }

    /**
     * 加载时间线数据
     */
    private List<Document> loadTimelineData(String pid, String date) {
        Query query = new Query(Criteria.where("pid").is(pid).and("date").is(date));
        Document record = mongoTemplate.findOne(query, Document.class, "hljld_records");
        if (record == null) {
            return Collections.emptyList();
        }
        List<?> timeline = record.getList("timeline", Document.class);
        return timeline != null ? timeline.stream()
            .filter(Document.class::isInstance)
            .map(Document.class::cast)
            .collect(Collectors.toList()) : Collections.emptyList();
    }

    /**
     * 获取患者信息
     */
    private Document getPatientInfo(String pid) {
        Query query = new Query(Criteria.where("pid").is(pid));
        Document patient = mongoTemplate.findOne(query, Document.class, "patients");
        if (patient == null) {
            patient = new Document();
            patient.put("name", "未知");
            patient.put("bedNo", "");
            patient.put("mrn", "");
            patient.put("sex", "");
            patient.put("age", "");
        }
        return patient;
    }

    /**
     * 获取起始页码
     */
    private int getStartPageNo(String pid, String date) {
        Optional<HljldPageIndex> indexOpt = pageIndexRepository.findByPid(pid);
        if (indexOpt.isEmpty()) {
            return 1;
        }

        return indexOpt.get().getDailyPages().stream()
            .filter(d -> d.getDate().equals(date))
            .map(HljldPageIndex.DailyPageInfo::getStartPageNo)
            .findFirst()
            .orElse(1);
    }

    /**
     * 渲染页面头部（标题 + 患者信息）
     */
    private void renderHeader(PDPageContentStream cs, Document patient) throws IOException {
        if (chineseFont == null) {
            return;
        }

        float y = PAGE_HEIGHT - MARGIN_TOP;

        // 标题
        cs.beginText();
        cs.setFont(chineseFont, 16);
        float titleWidth = chineseFont.getStringWidth("重钢总医院重症医学科护理记录单") / 1000 * 16;
        cs.newLineAtOffset((PAGE_WIDTH - titleWidth) / 2, y - 20);
        cs.showText("重钢总医院重症医学科护理记录单");
        cs.endText();

        // 患者信息行
        y -= 45;
        cs.beginText();
        cs.setFont(chineseFont, 9);
        cs.newLineAtOffset(MARGIN_LEFT, y);

        StringBuilder info = new StringBuilder();
        info.append("床号：").append(getStringOrDefault(patient, "bedNo", "—"));
        info.append("  姓名：").append(getStringOrDefault(patient, "name", "—"));
        info.append("  住院号：").append(getStringOrDefault(patient, "mrn", "—"));
        info.append("  性别：").append(getStringOrDefault(patient, "sex", "—"));
        info.append("  年龄：").append(getStringOrDefault(patient, "age", "—"));
        info.append("  诊断：").append(getStringOrDefault(patient, "diagnosis", "—"));

        cs.showText(info.toString());
        cs.endText();

        // 分隔线
        y -= 15;
        cs.setStrokingColor(0, 0, 0);
        cs.setLineWidth(0.5f);
        cs.moveTo(MARGIN_LEFT, y);
        cs.lineTo(PAGE_WIDTH - MARGIN_RIGHT, y);
        cs.stroke();
    }

    /**
     * 渲染表头（固定）
     */
    private void renderTableHeader(PDPageContentStream cs) throws IOException {
        if (chineseFont == null) {
            return;
        }

        float y = TABLE_TOP;
        float x = MARGIN_LEFT;
        float totalWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

        // 表头背景
        cs.setNonStrokingColor(240, 240, 240);
        cs.addRect(MARGIN_LEFT, y - 35, totalWidth, 35);
        cs.fill();

        // 表头边框
        cs.setStrokingColor(0, 0, 0);
        cs.setLineWidth(0.5f);
        cs.addRect(MARGIN_LEFT, y - 35, totalWidth, 35);
        cs.stroke();

        // 第一行表头
        String[] headers1 = {"日期时间", "药物治疗", "", "", "胃肠摄入", "", "",
                            "尿量", "净超滤量", "排出物", "", "引流液", "",
                            "检查", "治疗", "基础护理", "健康教育", "护理记录", "签名"};

        cs.setFont(chineseFont, 7);
        cs.setNonStrokingColor(0, 0, 0);

        x = MARGIN_LEFT;
        for (int i = 0; i < headers1.length; i++) {
            if (!headers1[i].isEmpty()) {
                cs.beginText();
                cs.newLineAtOffset(x + 2, y - 12);
                cs.showText(headers1[i]);
                cs.endText();
            }
            x += COL_WIDTHS[i];
        }

        // 第二行表头（子列）
        String[] headers2 = {"", "名称", "量/ml", "途径", "名称", "量/ml", "途径",
                            "ml", "ml", "名称", "量/ml", "名称", "量/ml",
                            "", "", "", "", "", ""};

        cs.setFont(chineseFont, 6);
        x = MARGIN_LEFT;
        for (int i = 0; i < headers2.length; i++) {
            if (!headers2[i].isEmpty()) {
                cs.beginText();
                cs.newLineAtOffset(x + 2, y - 25);
                cs.showText(headers2[i]);
                cs.endText();
            }
            x += COL_WIDTHS[i];
        }

        // 绘制列分隔线
        x = MARGIN_LEFT;
        for (int i = 0; i < COL_WIDTHS.length - 1; i++) {
            x += COL_WIDTHS[i];
            cs.moveTo(x, y);
            cs.lineTo(x, y - 35);
            cs.stroke();
        }
    }

    /**
     * 渲染表格数据（动态）
     */
    private void renderTableData(PDPageContentStream cs, List<Document> items) throws IOException {
        if (chineseFont == null) {
            return;
        }

        float y = TABLE_TOP - 40; // 从表头下方开始

        for (Document item : items) {
            String kind = item.getString("kind");

            if ("time-group".equals(kind)) {
                List<?> rows = item.getList("rows", Document.class);
                if (rows != null) {
                    for (Object rowObj : rows) {
                        if (rowObj instanceof Document) {
                            Document row = (Document) rowObj;
                            renderDataRow(cs, y, row);
                            y -= ROW_HEIGHT;
                        }
                    }
                }
            } else if (kind != null && kind.contains("summary")) {
                Document summary = (Document) item.get("summary");
                if (summary != null) {
                    renderSummaryRow(cs, y, summary);
                    y -= ROW_HEIGHT * 2;
                }
            }

            // 检查是否需要换页
            if (y < TABLE_BOTTOM) {
                break;
            }
        }
    }

    /**
     * 渲染单行数据
     */
    private void renderDataRow(PDPageContentStream cs, float y, Document row) throws IOException {
        float x = MARGIN_LEFT;

        // 时间
        drawCellText(cs, x, y, getStringOrDefault(row, "timeText", ""));
        x += COL_WIDTHS[0];

        // 药物治疗
        Document medication = (Document) row.get("medication");
        drawCellText(cs, x, y, medication != null ? getStringOrDefault(medication, "name", "") : "");
        x += COL_WIDTHS[1];
        drawCellText(cs, x, y, medication != null ? getStringOrDefault(medication, "amount", "") : "");
        x += COL_WIDTHS[2];
        drawCellText(cs, x, y, medication != null ? getStringOrDefault(medication, "route", "") : "");
        x += COL_WIDTHS[3];

        // 胃肠摄入
        Document enteral = (Document) row.get("enteral");
        drawCellText(cs, x, y, enteral != null ? getStringOrDefault(enteral, "name", "") : "");
        x += COL_WIDTHS[4];
        drawCellText(cs, x, y, enteral != null ? getStringOrDefault(enteral, "amount", "") : "");
        x += COL_WIDTHS[5];
        drawCellText(cs, x, y, enteral != null ? getStringOrDefault(enteral, "route", "") : "");
        x += COL_WIDTHS[6];

        // 尿量
        drawCellText(cs, x, y, getStringOrDefault(row, "urine", ""));
        x += COL_WIDTHS[7];

        // 净超滤量
        drawCellText(cs, x, y, getStringOrDefault(row, "ultrafiltration", ""));
        x += COL_WIDTHS[8];

        // 排出物
        Document output = (Document) row.get("output");
        drawCellText(cs, x, y, output != null ? getStringOrDefault(output, "name", "") : "");
        x += COL_WIDTHS[9];
        drawCellText(cs, x, y, output != null ? getStringOrDefault(output, "amount", "") : "");
        x += COL_WIDTHS[10];

        // 引流液
        Document drain = (Document) row.get("drain");
        drawCellText(cs, x, y, drain != null ? getStringOrDefault(drain, "name", "") : "");
        x += COL_WIDTHS[11];
        drawCellText(cs, x, y, drain != null ? getStringOrDefault(drain, "amount", "") : "");
        x += COL_WIDTHS[12];

        // 检查、治疗、基础护理、健康教育
        drawCellText(cs, x, y, getStringOrDefault(row, "examination", ""));
        x += COL_WIDTHS[13];
        drawCellText(cs, x, y, getStringOrDefault(row, "treatment", ""));
        x += COL_WIDTHS[14];
        drawCellText(cs, x, y, getStringOrDefault(row, "basicCare", ""));
        x += COL_WIDTHS[15];
        drawCellText(cs, x, y, getStringOrDefault(row, "healthEducation", ""));
        x += COL_WIDTHS[16];

        // 护理记录
        drawCellText(cs, x, y, getStringOrDefault(row, "nursingRecord", ""));
        x += COL_WIDTHS[17];

        // 签名
        drawCellText(cs, x, y, getStringOrDefault(row, "signature", ""));

        // 绘制行边框
        cs.setStrokingColor(200, 200, 200);
        cs.setLineWidth(0.3f);
        cs.addRect(MARGIN_LEFT, y - 5, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, ROW_HEIGHT);
        cs.stroke();
    }

    /**
     * 渲染小结行
     */
    private void renderSummaryRow(PDPageContentStream cs, float y, Document summary) throws IOException {
        // 小结背景
        String kind = summary.getString("kind");
        PDColor bgColor;
        if ("day-summary".equals(kind)) {
            bgColor = new PDColor(new float[]{0.97f, 0.95f, 0.87f}, PDDeviceRGB.INSTANCE);
        } else if ("shift-summary".equals(kind)) {
            bgColor = new PDColor(new float[]{0.96f, 0.94f, 0.89f}, PDDeviceRGB.INSTANCE);
        } else {
            bgColor = new PDColor(new float[]{0.93f, 0.96f, 0.93f}, PDDeviceRGB.INSTANCE);
        }

        cs.setNonStrokingColor(bgColor);
        cs.addRect(MARGIN_LEFT, y - 30, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, 30);
        cs.fill();

        // 小结标题
        cs.setNonStrokingColor(0, 0, 0);
        cs.beginText();
        cs.setFont(chineseFont, 8);
        cs.newLineAtOffset(MARGIN_LEFT + 5, y - 12);
        cs.showText(summary.getString("label"));
        cs.endText();

        // 小结内容
        List<?> detailLines = summary.getList("detailLines", List.class);
        if (detailLines != null && !detailLines.isEmpty()) {
            cs.beginText();
            cs.setFont(chineseFont, 7);
            cs.newLineAtOffset(MARGIN_LEFT + 5, y - 24);
            // 简化处理：只显示第一行
            StringBuilder content = new StringBuilder();
            for (Object line : detailLines) {
                if (line instanceof List) {
                    for (Object token : (List<?>) line) {
                        if (token instanceof Document) {
                            content.append(((Document) token).getString("text"));
                        }
                    }
                }
                break; // 只取第一行
            }
            cs.showText(content.toString());
            cs.endText();
        }

        // 小结边框
        cs.setStrokingColor(180, 180, 180);
        cs.setLineWidth(0.5f);
        cs.addRect(MARGIN_LEFT, y - 30, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, 30);
        cs.stroke();
    }

    /**
     * 渲染页脚（备注 + 页码）
     */
    private void renderFooter(PDPageContentStream cs, int pageNo, int totalPages, String date) throws IOException {
        if (chineseFont == null) {
            return;
        }

        float y = MARGIN_BOTTOM + 20;

        // 备注区域
        cs.setStrokingColor(200, 200, 200);
        cs.setLineWidth(0.3f);
        cs.addRect(MARGIN_LEFT, y - 15, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, 15);
        cs.stroke();

        cs.beginText();
        cs.setFont(chineseFont, 8);
        cs.newLineAtOffset(MARGIN_LEFT + 5, y - 10);
        cs.showText("备注：");
        cs.endText();

        // 页码
        String pageText = String.format("第 %d 页", pageNo);
        float pageTextWidth = chineseFont.getStringWidth(pageText) / 1000 * 10;
        cs.beginText();
        cs.setFont(chineseFont, 10);
        cs.newLineAtOffset((PAGE_WIDTH - pageTextWidth) / 2, 25);
        cs.showText(pageText);
        cs.endText();

        // 日期（右下角）
        cs.beginText();
        cs.setFont(chineseFont, 7);
        cs.newLineAtOffset(PAGE_WIDTH - MARGIN_RIGHT - 80, 25);
        cs.showText("护理日：" + date);
        cs.endText();
    }

    /**
     * 渲染空白页消息
     */
    private void renderEmptyMessage(PDPageContentStream cs) throws IOException {
        if (chineseFont == null) {
            return;
        }

        float y = (PAGE_WIDTH - TABLE_TOP - TABLE_BOTTOM) / 2 + TABLE_BOTTOM;
        String message = "该护理日暂无记录";
        float messageWidth = chineseFont.getStringWidth(message) / 1000 * 12;

        cs.setNonStrokingColor(150, 150, 150);
        cs.beginText();
        cs.setFont(chineseFont, 12);
        cs.newLineAtOffset((PAGE_WIDTH - messageWidth) / 2, y);
        cs.showText(message);
        cs.endText();
    }

    /**
     * 生成空白页 PDF
     */
    private byte[] generateEmptyPagePdf(String pid, String date) {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
            doc.addPage(page);

            Document patient = getPatientInfo(pid);
            int startPageNo = getStartPageNo(pid, date);

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                renderHeader(cs, patient);
                renderTableHeader(cs);
                renderEmptyMessage(cs);
                renderFooter(cs, startPageNo, 1, date);
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException("生成空白页PDF失败", e);
        }
    }

    /**
     * 数据分页逻辑
     */
    private List<List<Document>> paginateData(List<Document> timeline) {
        List<List<Document>> pages = new ArrayList<>();
        List<Document> currentPage = new ArrayList<>();
        float currentHeight = 0;
        float maxHeight = TABLE_BOTTOM - TABLE_TOP - 40; // 减去表头和页脚

        for (Document item : timeline) {
            float itemHeight = estimateItemHeight(item);

            // 如果当前页放不下，先保存当前页
            if (currentHeight + itemHeight > maxHeight && !currentPage.isEmpty()) {
                pages.add(currentPage);
                currentPage = new ArrayList<>();
                currentHeight = 0;
            }

            currentPage.add(item);
            currentHeight += itemHeight;
        }

        // 添加最后一页
        if (!currentPage.isEmpty()) {
            pages.add(currentPage);
        }

        // 确保至少有一页
        if (pages.isEmpty()) {
            pages.add(new ArrayList<>());
        }

        return pages;
    }

    /**
     * 估算数据项高度
     */
    private float estimateItemHeight(Document item) {
        String kind = item.getString("kind");

        if ("time-group".equals(kind)) {
            List<?> rows = item.getList("rows", Document.class);
            return rows != null ? rows.size() * ROW_HEIGHT : ROW_HEIGHT;
        } else if (kind != null && kind.contains("summary")) {
            return ROW_HEIGHT * 2; // 小结占更多空间
        }

        return ROW_HEIGHT;
    }

    /**
     * 绘制单元格文本
     */
    private void drawCellText(PDPageContentStream cs, float x, float y, String text) throws IOException {
        if (text == null || text.isEmpty()) {
            return;
        }

        cs.beginText();
        cs.setFont(chineseFont, 7);
        cs.newLineAtOffset(x + 2, y - 12);

        // 截断过长的文本
        float maxWidth = 100; // 默认最大宽度
        String truncated = truncateText(text, maxWidth);
        cs.showText(truncated);
        cs.endText();
    }

    /**
     * 截断文本
     */
    private String truncateText(String text, float maxWidth) {
        if (text == null) {
            return "";
        }
        // 简单截断，实际应该根据字体计算宽度
        return text.length() > 20 ? text.substring(0, 17) + "..." : text;
    }

    /**
     * 获取字符串值
     */
    private String getStringOrDefault(Document doc, String key, String defaultValue) {
        Object value = doc.get(key);
        return value != null ? value.toString() : defaultValue;
    }
}
