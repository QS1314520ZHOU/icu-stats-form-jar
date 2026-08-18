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
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
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

    // 字体 - 延迟初始化，避免静态字段触发系统字体扫描
    private PDFont chineseFont;
    private boolean fontInitialized = false;

    @Autowired
    public HljldPdfService(MongoTemplate mongoTemplate, HljldPageIndexRepository pageIndexRepository) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
        // 禁用 PDFBox 系统字体扫描，避免 Docker 环境中损坏字体文件导致 EOFException
        System.setProperty("pdfbox.fontcache", "/tmp/pdfbox-fontcache");
    }

    /**
     * 延迟初始化字体，首次调用时加载
     */
    private synchronized void initFont() {
        if (fontInitialized) {
            return;
        }
        fontInitialized = true;

        try {
            // 尝试加载中文字体
            InputStream fontStream = getClass().getResourceAsStream("/fonts/simsun.ttf");
            if (fontStream == null) {
                fontStream = getClass().getResourceAsStream("/fonts/simsun.ttc");
            }
            if (fontStream == null) {
                fontStream = getClass().getResourceAsStream("/fonts/Microsoft YaHei.ttf");
            }
            if (fontStream == null) {
                fontStream = getClass().getResourceAsStream("/fonts/NotoSansCJKsc-Regular.otf");
            }
            if (fontStream == null) {
                log.warn("未找到中文字体文件，PDF中文将无法正常显示。请将字体文件放到 src/main/resources/fonts/ 目录下");
                // 不设置 chineseFont，保持 null，render 方法会跳过文字渲染
            } else {
                PDDocument tempDoc = new PDDocument();
                chineseFont = PDType0Font.load(tempDoc, fontStream);
                tempDoc.close();
                log.info("中文字体加载成功");
            }
        } catch (Exception e) {
            log.error("加载中文字体失败，PDF中文将无法显示", e);
        }
    }

    /**
     * 获取字体，如果未初始化则返回 null
     */
    private PDFont getFont() {
        if (!fontInitialized) {
            initFont();
        }
        return chineseFont;
    }

    /**
     * 生成指定日期的护理记录 PDF
     */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("生成PDF: pid={}, date={}", pid, date);

        // 1. 查询患者信息
        Document patient = getPatientInfo(pid);

        // 2. 查询护理日数据
        NursingDayData dayData = loadNursingDayData(pid, date);

        // 3. 查询页码信息
        int startPageNo = getStartPageNo(pid, date);

        // 4. 创建 PDF 文档
        try (PDDocument doc = new PDDocument()) {
            if (dayData.isEmpty()) {
                // 空白页
                PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    renderHeader(cs, patient);
                    renderTableHeader(cs);
                    renderEmptyMessage(cs);
                    renderFooter(cs, startPageNo, 1, date);
                }
            } else {
                // 分页渲染
                List<List<Map<String, Object>>> pages = paginateData(dayData);

                for (int i = 0; i < pages.size(); i++) {
                    PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
                    doc.addPage(page);

                    try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                        renderHeader(cs, patient);
                        renderTableHeader(cs);
                        renderFooter(cs, startPageNo + i, pages.size(), date);
                        renderTableData(cs, pages.get(i));
                    }
                }
            }

            // 5. 转换为字节数组
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
        Document patient = getPatientInfo(pid);

        // 2. 创建 PDF 文档
        try (PDDocument doc = new PDDocument()) {
            // 3. 按日期顺序生成每一页
            for (HljldPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
                NursingDayData dayData = loadNursingDayData(pid, dailyPage.getDate());

                if (dayData.isEmpty()) {
                    PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
                    doc.addPage(page);
                    try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                        renderHeader(cs, patient);
                        renderTableHeader(cs);
                        renderEmptyMessage(cs);
                        renderFooter(cs, dailyPage.getStartPageNo(), 1, dailyPage.getDate());
                    }
                } else {
                    List<List<Map<String, Object>>> pages = paginateData(dayData);
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
     * 加载护理日数据
     */
    private NursingDayData loadNursingDayData(String pid, String date) {
        // 解析日期
        LocalDate localDate = LocalDate.parse(date, DateTimeFormatter.ISO_LOCAL_DATE);
        ZoneId zone = ZoneId.systemDefault();

        // 护理日：当天 07:00 到次日 07:00
        Date startTime = Date.from(localDate.atTime(7, 0).atZone(zone).toInstant());
        Date endTime = Date.from(localDate.plusDays(1).atTime(7, 0).atZone(zone).toInstant());

        NursingDayData data = new NursingDayData();

        // 1. 查询床旁数据（生命体征）
        data.setVitals(loadVitals(pid, startTime, endTime));

        // 2. 查询药物执行记录
        data.setDrugExecutions(loadDrugExecutions(pid, startTime, endTime));

        // 3. 查询护理记录
        data.setNurseRecords(loadNurseRecords(pid, startTime, endTime));

        // 4. 查询管道记录
        data.setTubeRecords(loadTubeRecords(pid, startTime, endTime));

        return data;
    }

    /**
     * 加载生命体征数据
     */
    private List<Document> loadVitals(String pid, Date startTime, Date endTime) {
        Query query = new Query();
        query.addCriteria(Criteria.where("pid").is(pid)
                .and("time").gte(startTime).lt(endTime));
        query.with(Sort.by(Sort.Direction.ASC, "time"));
        return mongoTemplate.find(query, Document.class, "bedside");
    }

    /**
     * 加载药物执行记录
     */
    private List<Document> loadDrugExecutions(String pid, Date startTime, Date endTime) {
        Criteria overlap = new Criteria().andOperator(
                Criteria.where("startTime").lte(endTime),
                new Criteria().orOperator(
                        Criteria.where("endTime").exists(false),
                        Criteria.where("endTime").is(null),
                        Criteria.where("endTime").gt(startTime)));

        Query query = new Query(Criteria.where("pid").is(pid)
                .and("status").ne("invalid")
                .andOperator(overlap));
        query.with(Sort.by(Sort.Direction.ASC, "startTime"));
        return mongoTemplate.find(query, Document.class, "drugExe");
    }

    /**
     * 加载护理记录
     */
    private List<Document> loadNurseRecords(String pid, Date startTime, Date endTime) {
        Query query = new Query();
        query.addCriteria(Criteria.where("pid").is(pid.trim())
                .and("time").gte(startTime).lt(endTime)
                .and("valid").ne(false)
                .and("desc").nin(null, ""));
        query.with(Sort.by(Sort.Direction.ASC, "time"));
        return mongoTemplate.find(query, Document.class, "nurseRecords");
    }

    /**
     * 加载管道记录
     */
    private List<Document> loadTubeRecords(String pid, Date startTime, Date endTime) {
        Query query = new Query();
        query.addCriteria(Criteria.where("pid").is(pid)
                .and("valid").ne(false)
                .and("status").ne("invalid")
                .and("tubeRecordList").ne(null));
        query.with(Sort.by(Sort.Direction.ASC, "startTime"));
        return mongoTemplate.find(query, Document.class, "tubeExe");
    }

    /**
     * 获取患者信息
     */
    private Document getPatientInfo(String pid) {
        Query query = new Query(Criteria.where("pid").is(pid));
        Document patient = mongoTemplate.findOne(query, Document.class, "patient");
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
     * 渲染页面头部
     */
    private void renderHeader(PDPageContentStream cs, Document patient) throws IOException {
        if (getFont() == null) {
            return;
        }

        float y = PAGE_HEIGHT - MARGIN_TOP;

        // 标题
        cs.beginText();
        cs.setFont(getFont(), 16);
        float titleWidth = getFont().getStringWidth("重钢总医院重症医学科护理记录单") / 1000 * 16;
        cs.newLineAtOffset((PAGE_WIDTH - titleWidth) / 2, y - 20);
        cs.showText("重钢总医院重症医学科护理记录单");
        cs.endText();

        // 患者信息行
        y -= 45;
        cs.beginText();
        cs.setFont(getFont(), 9);
        cs.newLineAtOffset(MARGIN_LEFT, y);

        StringBuilder info = new StringBuilder();
        info.append("床号：").append(getStringOrDefault(patient, "bedNo", "—"));
        info.append("  姓名：").append(getStringOrDefault(patient, "name", "—"));
        info.append("  住院号：").append(getStringOrDefault(patient, "mrn", "—"));
        info.append("  性别：").append(getStringOrDefault(patient, "sex", "—"));
        info.append("  年龄：").append(getStringOrDefault(patient, "age", "—"));

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
     * 渲染表头
     */
    private void renderTableHeader(PDPageContentStream cs) throws IOException {
        if (getFont() == null) {
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

        // 表头文字
        String[] headers = {"日期时间", "药物治疗", "名称", "量/ml", "途径",
                           "胃肠摄入", "名称", "量/ml", "途径",
                           "尿量", "净超滤量", "排出物", "名称", "量/ml",
                           "引流液", "名称", "量/ml",
                           "检查", "治疗", "基础护理", "健康教育", "护理记录", "签名"};

        cs.setFont(getFont(), 7);
        cs.setNonStrokingColor(0, 0, 0);

        x = MARGIN_LEFT;
        for (int i = 0; i < Math.min(headers.length, COL_WIDTHS.length); i++) {
            if (!headers[i].isEmpty()) {
                cs.beginText();
                cs.newLineAtOffset(x + 2, y - 12);
                cs.showText(headers[i]);
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
     * 渲染表格数据
     */
    private void renderTableData(PDPageContentStream cs, List<Map<String, Object>> rows) throws IOException {
        if (getFont() == null) {
            return;
        }

        float y = TABLE_TOP - 40;

        for (Map<String, Object> row : rows) {
            if (y < TABLE_BOTTOM) {
                break;
            }

            renderDataRow(cs, y, row);
            y -= ROW_HEIGHT;
        }
    }

    /**
     * 渲染单行数据
     */
    private void renderDataRow(PDPageContentStream cs, float y, Map<String, Object> row) throws IOException {
        float x = MARGIN_LEFT;

        // 时间
        drawCellText(cs, x, y, getStringFromMap(row, "timeText"));
        x += COL_WIDTHS[0];

        // 药物
        drawCellText(cs, x, y, getStringFromMap(row, "medName"));
        x += COL_WIDTHS[1];
        drawCellText(cs, x, y, getStringFromMap(row, "medAmount"));
        x += COL_WIDTHS[2];
        drawCellText(cs, x, y, getStringFromMap(row, "medRoute"));
        x += COL_WIDTHS[3];

        // 胃肠
        drawCellText(cs, x, y, getStringFromMap(row, "enteralName"));
        x += COL_WIDTHS[4];
        drawCellText(cs, x, y, getStringFromMap(row, "enteralAmount"));
        x += COL_WIDTHS[5];
        drawCellText(cs, x, y, getStringFromMap(row, "enteralRoute"));
        x += COL_WIDTHS[6];

        // 尿量
        drawCellText(cs, x, y, getStringFromMap(row, "urine"));
        x += COL_WIDTHS[7];

        // 净超滤量
        drawCellText(cs, x, y, getStringFromMap(row, "ultrafiltration"));
        x += COL_WIDTHS[8];

        // 排出物
        drawCellText(cs, x, y, getStringFromMap(row, "outputName"));
        x += COL_WIDTHS[9];
        drawCellText(cs, x, y, getStringFromMap(row, "outputAmount"));
        x += COL_WIDTHS[10];

        // 引流液
        drawCellText(cs, x, y, getStringFromMap(row, "drainName"));
        x += COL_WIDTHS[11];
        drawCellText(cs, x, y, getStringFromMap(row, "drainAmount"));
        x += COL_WIDTHS[12];

        // 其他
        drawCellText(cs, x, y, getStringFromMap(row, "examination"));
        x += COL_WIDTHS[13];
        drawCellText(cs, x, y, getStringFromMap(row, "treatment"));
        x += COL_WIDTHS[14];
        drawCellText(cs, x, y, getStringFromMap(row, "basicCare"));
        x += COL_WIDTHS[15];
        drawCellText(cs, x, y, getStringFromMap(row, "healthEducation"));
        x += COL_WIDTHS[16];
        drawCellText(cs, x, y, getStringFromMap(row, "nursingRecord"));
        x += COL_WIDTHS[17];
        drawCellText(cs, x, y, getStringFromMap(row, "signature"));

        // 绘制行边框
        cs.setStrokingColor(200, 200, 200);
        cs.setLineWidth(0.3f);
        cs.addRect(MARGIN_LEFT, y - 5, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, ROW_HEIGHT);
        cs.stroke();
    }

    /**
     * 渲染页脚
     */
    private void renderFooter(PDPageContentStream cs, int pageNo, int totalPages, String date) throws IOException {
        if (getFont() == null) {
            return;
        }

        float y = MARGIN_BOTTOM + 20;

        // 备注区域
        cs.setStrokingColor(200, 200, 200);
        cs.setLineWidth(0.3f);
        cs.addRect(MARGIN_LEFT, y - 15, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, 15);
        cs.stroke();

        cs.beginText();
        cs.setFont(getFont(), 8);
        cs.newLineAtOffset(MARGIN_LEFT + 5, y - 10);
        cs.showText("备注：");
        cs.endText();

        // 页码
        String pageText = String.format("第 %d 页", pageNo);
        float pageTextWidth = getFont().getStringWidth(pageText) / 1000 * 10;
        cs.beginText();
        cs.setFont(getFont(), 10);
        cs.newLineAtOffset((PAGE_WIDTH - pageTextWidth) / 2, 25);
        cs.showText(pageText);
        cs.endText();

        // 日期
        cs.beginText();
        cs.setFont(getFont(), 7);
        cs.newLineAtOffset(PAGE_WIDTH - MARGIN_RIGHT - 80, 25);
        cs.showText("护理日：" + date);
        cs.endText();
    }

    /**
     * 渲染空白页消息
     */
    private void renderEmptyMessage(PDPageContentStream cs) throws IOException {
        if (getFont() == null) {
            return;
        }

        float y = (TABLE_TOP + TABLE_BOTTOM) / 2;
        String message = "该护理日暂无记录";
        float messageWidth = getFont().getStringWidth(message) / 1000 * 12;

        cs.setNonStrokingColor(150, 150, 150);
        cs.beginText();
        cs.setFont(getFont(), 12);
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
     * 数据分页
     */
    private List<List<Map<String, Object>>> paginateData(NursingDayData dayData) {
        List<Map<String, Object>> allRows = convertToRows(dayData);
        List<List<Map<String, Object>>> pages = new ArrayList<>();
        List<Map<String, Object>> currentPage = new ArrayList<>();
        float currentHeight = 0;
        float maxHeight = TABLE_BOTTOM - TABLE_TOP - 40;

        for (Map<String, Object> row : allRows) {
            if (currentHeight + ROW_HEIGHT > maxHeight && !currentPage.isEmpty()) {
                pages.add(currentPage);
                currentPage = new ArrayList<>();
                currentHeight = 0;
            }
            currentPage.add(row);
            currentHeight += ROW_HEIGHT;
        }

        if (!currentPage.isEmpty()) {
            pages.add(currentPage);
        }

        if (pages.isEmpty()) {
            pages.add(new ArrayList<>());
        }

        return pages;
    }

    /**
     * 将数据转换为行
     */
    private List<Map<String, Object>> convertToRows(NursingDayData dayData) {
        List<Map<String, Object>> rows = new ArrayList<>();
        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm");

        // 合并所有数据源，按时间排序
        TreeMap<Date, Map<String, Object>> timeMap = new TreeMap<>();

        // 处理生命体征
        for (Document vital : dayData.getVitals()) {
            Date time = vital.getDate("time");
            if (time == null) continue;

            Map<String, Object> row = timeMap.computeIfAbsent(time, k -> new LinkedHashMap<>());
            row.put("timeText", timeFormat.format(time));
            row.put("t", getStringOrDefault(vital, "t", ""));
            row.put("hr", getStringOrDefault(vital, "hr", ""));
            row.put("rr", getStringOrDefault(vital, "rr", ""));
            row.put("bpSys", getStringOrDefault(vital, "bpSys", ""));
            row.put("bpDia", getStringOrDefault(vital, "bpDia", ""));
            row.put("spo2", getStringOrDefault(vital, "spo2", ""));
            row.put("cvp", getStringOrDefault(vital, "cvp", ""));
        }

        // 处理护理记录
        for (Document record : dayData.getNurseRecords()) {
            Date time = record.getDate("time");
            if (time == null) continue;

            Map<String, Object> row = timeMap.computeIfAbsent(time, k -> new LinkedHashMap<>());
            row.put("timeText", timeFormat.format(time));
            row.put("nursingRecord", getStringOrDefault(record, "desc", ""));
            row.put("signature", getStringOrDefault(record, "accountId", ""));
        }

        // 处理药物执行
        for (Document drug : dayData.getDrugExecutions()) {
            Date time = drug.getDate("startTime");
            if (time == null) continue;

            Map<String, Object> row = timeMap.computeIfAbsent(time, k -> new LinkedHashMap<>());
            row.put("timeText", timeFormat.format(time));
            row.put("medName", getStringOrDefault(drug, "drugName", ""));
            row.put("medAmount", getStringOrDefault(drug, "dose", ""));
            row.put("medRoute", getStringOrDefault(drug, "route", ""));
        }

        rows.addAll(timeMap.values());
        return rows;
    }

    /**
     * 绘制单元格文本
     */
    private void drawCellText(PDPageContentStream cs, float x, float y, String text) throws IOException {
        if (text == null || text.isEmpty()) {
            return;
        }

        cs.beginText();
        cs.setFont(getFont(), 7);
        cs.newLineAtOffset(x + 2, y - 12);
        cs.showText(truncateText(text, 20));
        cs.endText();
    }

    /**
     * 截断文本
     */
    private String truncateText(String text, int maxLength) {
        if (text == null) return "";
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }

    /**
     * 获取字符串值
     */
    private String getStringOrDefault(Document doc, String key, String defaultValue) {
        Object value = doc.get(key);
        return value != null ? value.toString() : defaultValue;
    }

    /**
     * 从 Map 获取字符串值
     */
    private String getStringFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value != null ? value.toString() : "";
    }

    /**
     * 护理日数据
     */
    private static class NursingDayData {
        private List<Document> vitals = new ArrayList<>();
        private List<Document> drugExecutions = new ArrayList<>();
        private List<Document> nurseRecords = new ArrayList<>();
        private List<Document> tubeRecords = new ArrayList<>();

        public boolean isEmpty() {
            return vitals.isEmpty() && drugExecutions.isEmpty() && nurseRecords.isEmpty();
        }

        // Getters and Setters
        public List<Document> getVitals() { return vitals; }
        public void setVitals(List<Document> vitals) { this.vitals = vitals; }
        public List<Document> getDrugExecutions() { return drugExecutions; }
        public void setDrugExecutions(List<Document> drugExecutions) { this.drugExecutions = drugExecutions; }
        public List<Document> getNurseRecords() { return nurseRecords; }
        public void setNurseRecords(List<Document> nurseRecords) { this.nurseRecords = nurseRecords; }
        public List<Document> getTubeRecords() { return tubeRecords; }
        public void setTubeRecords(List<Document> tubeRecords) { this.tubeRecords = tubeRecords; }
    }
}
