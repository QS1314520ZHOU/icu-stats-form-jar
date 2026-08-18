package com.smartcare.backend.service;

import com.itextpdf.awt.PdfGraphics2D;
import com.itextpdf.text.Document;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.PageSize;
import com.itextpdf.text.pdf.PdfContentByte;
import com.itextpdf.text.pdf.PdfTemplate;
import com.itextpdf.text.pdf.PdfWriter;
import com.smartcare.backend.entity.HljldPageIndex;
import com.smartcare.backend.repository.HljldPageIndexRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.awt.*;
import java.awt.geom.Line2D;
import java.awt.geom.Rectangle2D;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.List;

/**
 * ICU 护理记录单 PDF 生成服务
 * 使用 iText Graphics2D 方案
 */
@Service
public class HljldPdfService {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfService.class);

    private final MongoTemplate mongoTemplate;
    private final HljldPageIndexRepository pageIndexRepository;

    // A4 横向尺寸（点，72 DPI）
    private static final float PAGE_WIDTH = 842f;   // 297mm
    private static final float PAGE_HEIGHT = 595f;  // 210mm

    // 边距
    private static final float MARGIN_TOP = 28f;    // 10mm
    private static final float MARGIN_BOTTOM = 42f; // 15mm
    private static final float MARGIN_LEFT = 20f;   // 7mm
    private static final float MARGIN_RIGHT = 20f;

    // 表格区域
    private static final float TABLE_TOP = 130f;
    private static final float ROW_HEIGHT = 18f;

    // 列宽配置
    private static final float[] COL_WIDTHS = {
        55f, 38f, 28f, 28f, 38f, 28f, 28f, 28f, 35f,
        38f, 28f, 38f, 28f, 32f, 32f, 32f, 32f, 120f, 35f
    };

    // 字体
    private Font chineseFont;
    private boolean fontInitialized = false;

    @Autowired
    public HljldPdfService(MongoTemplate mongoTemplate, HljldPageIndexRepository pageIndexRepository) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
    }

    /**
     * 初始化中文字体
     */
    private synchronized void initFont() {
        if (fontInitialized) return;
        fontInitialized = true;

        // 尝试从 classpath 加载
        String[] fontPaths = {
            "/fonts/simsun.ttc", "/fonts/simsun.ttf", "/fonts/simsunb.ttf",
            "/fonts/SimsunExtG.ttf", "/fonts/Microsoft YaHei.ttf", "/fonts/NotoSansCJKsc-Regular.otf"
        };

        for (String fontPath : fontPaths) {
            try (InputStream is = getClass().getResourceAsStream(fontPath)) {
                if (is != null) {
                    Font baseFont = Font.createFont(Font.TRUETYPE_FONT, is);
                    chineseFont = baseFont.deriveFont(Font.PLAIN, 12f);
                    log.info("中文字体加载成功: {}", fontPath);
                    return;
                }
            } catch (Exception e) {
                log.warn("字体加载失败 {}: {}", fontPath, e.getMessage());
            }
        }

        // 从系统路径加载
        String os = System.getProperty("os.name", "").toLowerCase();
        String sysFontPath = os.contains("windows")
            ? "C:/Windows/Fonts/simsun.ttc"
            : "/usr/share/fonts/truetype/simsun.ttc";
        try (InputStream is = new java.io.FileInputStream(sysFontPath)) {
            Font baseFont = Font.createFont(Font.TRUETYPE_FONT, is);
            chineseFont = baseFont.deriveFont(Font.PLAIN, 12f);
            log.info("系统字体加载成功: {}", sysFontPath);
        } catch (Exception e) {
            log.warn("未找到中文字体，PDF中文将无法正常显示");
        }
    }

    /**
     * 获取指定大小的中文字体
     */
    private Font getFont(float size) {
        if (!fontInitialized) initFont();
        if (chineseFont == null) return new Font("SansSerif", Font.PLAIN, (int) size);
        return chineseFont.deriveFont(Font.PLAIN, size);
    }

    /**
     * 生成指定日期的护理记录 PDF
     */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("生成PDF: pid={}, date={}", pid, date);

        org.bson.Document patient = getPatientInfo(pid);
        NursingDayData dayData = loadNursingDayData(pid, date);
        int startPageNo = getStartPageNo(pid, date);

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            Document pdfDoc = new Document(PageSize.A4.rotate(), 0, 0, 0, 0);
            PdfWriter writer = PdfWriter.getInstance(pdfDoc, baos);
            pdfDoc.open();

            float w = pdfDoc.getPageSize().getWidth();
            float h = pdfDoc.getPageSize().getHeight();

            if (dayData.isEmpty()) {
                PdfContentByte cb = writer.getDirectContent();
                PdfTemplate tp = cb.createTemplate(w, h);
                Graphics2D g2d = new PdfGraphics2D(cb, w, h);

                renderPage(g2d, patient, Collections.emptyList(), startPageNo, 1, date);
                g2d.dispose();
                tp.beginText();
                tp.endText();
            } else {
                List<List<Map<String, Object>>> pages = paginateData(dayData);
                for (int i = 0; i < pages.size(); i++) {
                    if (i > 0) pdfDoc.newPage();
                    PdfContentByte cb = writer.getDirectContent();
                    PdfTemplate tp = cb.createTemplate(w, h);
                    Graphics2D g2d = new PdfGraphics2D(cb, w, h);

                    renderPage(g2d, patient, pages.get(i), startPageNo + i, pages.size(), date);
                    g2d.dispose();
                    tp.beginText();
                    tp.endText();
                }
            }

            pdfDoc.close();
            return baos.toByteArray();
        } catch (DocumentException e) {
            log.error("生成PDF失败", e);
            throw new RuntimeException("生成PDF失败: " + e.getMessage(), e);
        }
    }

    /**
     * 生成全部记录的 PDF
     */
    public byte[] generateAllPagesPdf(String pid) {
        log.info("生成全部PDF: pid={}", pid);

        Optional<HljldPageIndex> indexOpt = pageIndexRepository.findByPid(pid);
        if (indexOpt.isEmpty() || indexOpt.get().getDailyPages().isEmpty()) {
            return generateEmptyPagePdf(pid, "全部");
        }

        HljldPageIndex index = indexOpt.get();
        org.bson.Document patient = getPatientInfo(pid);

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            Document pdfDoc = new Document(PageSize.A4.rotate(), 0, 0, 0, 0);
            PdfWriter writer = PdfWriter.getInstance(pdfDoc, baos);
            pdfDoc.open();

            float w = pdfDoc.getPageSize().getWidth();
            float h = pdfDoc.getPageSize().getHeight();
            boolean firstPage = true;

            for (HljldPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
                NursingDayData dayData = loadNursingDayData(pid, dailyPage.getDate());

                if (dayData.isEmpty()) {
                    if (!firstPage) pdfDoc.newPage();
                    firstPage = false;
                    PdfContentByte cb = writer.getDirectContent();
                    PdfTemplate tp = cb.createTemplate(w, h);
                    Graphics2D g2d = new PdfGraphics2D(cb, w, h);
                    renderPage(g2d, patient, Collections.emptyList(), dailyPage.getStartPageNo(), 1, dailyPage.getDate());
                    g2d.dispose();
                    tp.beginText();
                    tp.endText();
                } else {
                    List<List<Map<String, Object>>> pages = paginateData(dayData);
                    for (int i = 0; i < pages.size(); i++) {
                        if (!firstPage) pdfDoc.newPage();
                        firstPage = false;
                        PdfContentByte cb = writer.getDirectContent();
                        PdfTemplate tp = cb.createTemplate(w, h);
                        Graphics2D g2d = new PdfGraphics2D(cb, w, h);
                        renderPage(g2d, patient, pages.get(i), dailyPage.getStartPageNo() + i, pages.size(), dailyPage.getDate());
                        g2d.dispose();
                        tp.beginText();
                        tp.endText();
                    }
                }
            }

            pdfDoc.close();
            return baos.toByteArray();
        } catch (DocumentException e) {
            log.error("生成全部PDF失败", e);
            throw new RuntimeException("生成全部PDF失败: " + e.getMessage(), e);
        }
    }

    /**
     * 渲染完整页面（使用 translate 管理布局）
     */
    private void renderPage(Graphics2D g2d, org.bson.Document patient, List<Map<String, Object>> rows, int pageNo, int totalPages, String date) {
        // 启用抗锯齿
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        // 初始偏移
        g2d.translate(MARGIN_LEFT, MARGIN_TOP);

        // 1. 渲染标题和患者信息
        float headerH = renderHeader(g2d, patient);
        g2d.translate(0, headerH);

        // 2. 渲染表头
        float tableHeaderH = renderTableHeader(g2d);
        g2d.translate(0, tableHeaderH);

        // 3. 渲染数据行
        float tableBottom = PAGE_HEIGHT - MARGIN_BOTTOM - MARGIN_TOP - 60; // 留出页脚空间
        float dataH = renderTableData(g2d, rows, tableBottom - headerH - tableHeaderH);
        g2d.translate(0, dataH);

        // 4. 渲染空数据提示
        if (rows.isEmpty()) {
            renderEmptyMessage(g2d, tableBottom - headerH - tableHeaderH - dataH);
        }

        // 5. 渲染页脚（回到页面底部）
        g2d.translate(0, -(headerH + tableHeaderH + dataH)); // 回到顶部
        g2d.translate(0, PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - 20);
        renderFooter(g2d, pageNo, totalPages, date);
    }

    /**
     * 渲染页面头部，返回高度
     */
    private float renderHeader(Graphics2D g2d, org.bson.Document patient) {
        float y = 0;

        // 标题
        g2d.setFont(getFont(16f));
        g2d.setColor(Color.BLACK);
        String title = "重钢总医院重症医学科护理记录单";
        FontMetrics fm = g2d.getFontMetrics();
        int titleW = fm.stringWidth(title);
        g2d.drawString(title, (PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - titleW) / 2, y + 16);
        y += 30;

        // 患者信息
        g2d.setFont(getFont(9f));
        String info = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s",
            str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
            str(patient, "sex"), str(patient, "age"));
        g2d.drawString(info, 0, y + 10);
        y += 20;

        // 分隔线
        g2d.setColor(Color.BLACK);
        g2d.setStroke(new BasicStroke(0.5f));
        g2d.draw(new Line2D.Float(0, y, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, y));
        y += 5;

        return y;
    }

    /**
     * 渲染表头，返回高度
     */
    private float renderTableHeader(Graphics2D g2d) {
        float tableW = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
        float headerH = 35;

        // 背景
        g2d.setColor(new Color(240, 240, 240));
        g2d.fill(new Rectangle2D.Float(0, 0, tableW, headerH));

        // 边框
        g2d.setColor(Color.BLACK);
        g2d.setStroke(new BasicStroke(0.5f));
        g2d.draw(new Rectangle2D.Float(0, 0, tableW, headerH));

        // 表头文字
        String[] headers = {
            "日期时间", "药物治疗", "名称", "量/ml", "途径",
            "胃肠摄入", "名称", "量/ml", "途径",
            "尿量", "净超滤量", "排出物", "名称", "量/ml",
            "引流液", "名称", "量/ml",
            "检查", "治疗", "基础护理", "健康教育", "护理记录", "签名"
        };

        g2d.setFont(getFont(7f));
        g2d.setColor(Color.BLACK);
        float x = 0;
        for (int i = 0; i < Math.min(headers.length, COL_WIDTHS.length); i++) {
            if (!headers[i].isEmpty()) {
                g2d.drawString(headers[i], x + 2, 12);
            }
            x += COL_WIDTHS[i];
        }

        // 列分隔线
        x = 0;
        g2d.setStroke(new BasicStroke(0.3f));
        for (int i = 0; i < COL_WIDTHS.length - 1; i++) {
            x += COL_WIDTHS[i];
            g2d.draw(new Line2D.Float(x, 0, x, headerH));
        }

        return headerH;
    }

    /**
     * 渲染表格数据，返回高度
     */
    private float renderTableData(Graphics2D g2d, List<Map<String, Object>> rows, float maxHeight) {
        float y = 0;
        float tableW = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

        for (Map<String, Object> row : rows) {
            if (y + ROW_HEIGHT > maxHeight) break;

            // 绘制单元格文本
            g2d.setFont(getFont(7f));
            g2d.setColor(Color.BLACK);
            float x = 0;
            drawCell(g2d, x, y, row, "timeText");      x += COL_WIDTHS[0];
            drawCell(g2d, x, y, row, "medName");        x += COL_WIDTHS[1];
            drawCell(g2d, x, y, row, "medAmount");      x += COL_WIDTHS[2];
            drawCell(g2d, x, y, row, "medRoute");       x += COL_WIDTHS[3];
            drawCell(g2d, x, y, row, "enteralName");    x += COL_WIDTHS[4];
            drawCell(g2d, x, y, row, "enteralAmount");  x += COL_WIDTHS[5];
            drawCell(g2d, x, y, row, "enteralRoute");   x += COL_WIDTHS[6];
            drawCell(g2d, x, y, row, "urine");          x += COL_WIDTHS[7];
            drawCell(g2d, x, y, row, "ultrafiltration");x += COL_WIDTHS[8];
            drawCell(g2d, x, y, row, "outputName");     x += COL_WIDTHS[9];
            drawCell(g2d, x, y, row, "outputAmount");   x += COL_WIDTHS[10];
            drawCell(g2d, x, y, row, "drainName");      x += COL_WIDTHS[11];
            drawCell(g2d, x, y, row, "drainAmount");    x += COL_WIDTHS[12];
            drawCell(g2d, x, y, row, "examination");    x += COL_WIDTHS[13];
            drawCell(g2d, x, y, row, "treatment");      x += COL_WIDTHS[14];
            drawCell(g2d, x, y, row, "basicCare");      x += COL_WIDTHS[15];
            drawCell(g2d, x, y, row, "healthEducation");x += COL_WIDTHS[16];
            drawCell(g2d, x, y, row, "nursingRecord");  x += COL_WIDTHS[17];
            drawCell(g2d, x, y, row, "signature");

            // 行边框
            g2d.setColor(new Color(200, 200, 200));
            g2d.setStroke(new BasicStroke(0.3f));
            g2d.draw(new Rectangle2D.Float(0, y, tableW, ROW_HEIGHT));

            y += ROW_HEIGHT;
        }

        return y;
    }

    /**
     * 绘制单元格
     */
    private void drawCell(Graphics2D g2d, float x, float y, Map<String, Object> row, String key) {
        String text = mapStr(row, key);
        if (text != null && !text.isEmpty()) {
            g2d.drawString(truncate(text, 20), x + 2, y + 12);
        }
    }

    /**
     * 渲染空数据提示
     */
    private void renderEmptyMessage(Graphics2D g2d, float availableHeight) {
        g2d.setFont(getFont(12f));
        g2d.setColor(new Color(150, 150, 150));
        String msg = "该护理日暂无记录";
        FontMetrics fm = g2d.getFontMetrics();
        int msgW = fm.stringWidth(msg);
        g2d.drawString(msg, (PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - msgW) / 2, availableHeight / 2);
    }

    /**
     * 渲染页脚
     */
    private void renderFooter(Graphics2D g2d, int pageNo, int totalPages, String date) {
        float tableW = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

        // 备注区域
        g2d.setColor(new Color(200, 200, 200));
        g2d.setStroke(new BasicStroke(0.3f));
        g2d.draw(new Rectangle2D.Float(0, 0, tableW, 15));
        g2d.setFont(getFont(8f));
        g2d.setColor(Color.BLACK);
        g2d.drawString("备注：", 5, 10);

        // 页码
        g2d.setFont(getFont(10f));
        String pageText = String.format("第 %d 页", pageNo);
        FontMetrics fm = g2d.getFontMetrics();
        int pageW = fm.stringWidth(pageText);
        g2d.drawString(pageText, (tableW - pageW) / 2, 35);

        // 日期
        g2d.setFont(getFont(7f));
        g2d.drawString("护理日：" + date, tableW - 80, 35);
    }

    /**
     * 生成空白页 PDF
     */
    private byte[] generateEmptyPagePdf(String pid, String date) {
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            Document pdfDoc = new Document(PageSize.A4.rotate(), 0, 0, 0, 0);
            PdfWriter writer = PdfWriter.getInstance(pdfDoc, baos);
            pdfDoc.open();

            float w = pdfDoc.getPageSize().getWidth();
            float h = pdfDoc.getPageSize().getHeight();

            PdfContentByte cb = writer.getDirectContent();
            PdfTemplate tp = cb.createTemplate(w, h);
            Graphics2D g2d = new PdfGraphics2D(cb, w, h);

            org.bson.Document patient = getPatientInfo(pid);
            int startPageNo = getStartPageNo(pid, date);
            renderPage(g2d, patient, Collections.emptyList(), startPageNo, 1, date);
            g2d.dispose();
            tp.beginText();
            tp.endText();

            pdfDoc.close();
            return baos.toByteArray();
        } catch (DocumentException e) {
            throw new RuntimeException("生成空白页PDF失败", e);
        }
    }

    /**
     * 计算某天的页数（供 HljldPageIndexService 调用）
     */
    public int calculatePageCount(String pid, String date) {
        NursingDayData dayData = loadNursingDayData(pid, date);
        return paginateData(dayData).size();
    }

    // ==================== 数据加载 ====================

    private NursingDayData loadNursingDayData(String pid, String date) {
        LocalDate localDate = LocalDate.parse(date, DateTimeFormatter.ISO_LOCAL_DATE);
        ZoneId zone = ZoneId.systemDefault();
        Date startTime = Date.from(localDate.atTime(7, 0).atZone(zone).toInstant());
        Date endTime = Date.from(localDate.plusDays(1).atTime(7, 0).atZone(zone).toInstant());

        NursingDayData data = new NursingDayData();
        data.setVitals(loadVitals(pid, startTime, endTime));
        data.setDrugExecutions(loadDrugExecutions(pid, startTime, endTime));
        data.setNurseRecords(loadNurseRecords(pid, startTime, endTime));
        data.setTubeRecords(loadTubeRecords(pid, startTime, endTime));
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

    private List<org.bson.Document> loadTubeRecords(String pid, Date start, Date end) {
        Query q = new Query(Criteria.where("pid").is(pid).and("valid").ne(false)
            .and("status").ne("invalid").and("tubeRecordList").ne(null));
        q.with(Sort.by(Sort.Direction.ASC, "startTime"));
        return mongoTemplate.find(q, org.bson.Document.class, "tubeExe");
    }

    private org.bson.Document getPatientInfo(String pid) {
        Query q = new Query(new Criteria().orOperator(
            Criteria.where("_id").is(pid), Criteria.where("pid").is(pid)));
        org.bson.Document p = mongoTemplate.findOne(q, org.bson.Document.class, "patient");
        if (p == null) {
            p = new org.bson.Document();
            p.put("name", "未知"); p.put("bedNo", ""); p.put("mrn", "");
            p.put("sex", ""); p.put("age", "");
        }
        return p;
    }

    private int getStartPageNo(String pid, String date) {
        return pageIndexRepository.findByPid(pid)
            .flatMap(idx -> idx.getDailyPages().stream()
                .filter(d -> d.getDate().equals(date))
                .map(HljldPageIndex.DailyPageInfo::getStartPageNo)
                .findFirst())
            .orElse(1);
    }

    // ==================== 数据转换 ====================

    private List<List<Map<String, Object>>> paginateData(NursingDayData dayData) {
        List<Map<String, Object>> allRows = convertToRows(dayData);
        List<List<Map<String, Object>>> pages = new ArrayList<>();
        List<Map<String, Object>> current = new ArrayList<>();
        float h = 0, maxH = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - TABLE_TOP - 80;

        for (Map<String, Object> row : allRows) {
            if (h + ROW_HEIGHT > maxH && !current.isEmpty()) {
                pages.add(current);
                current = new ArrayList<>();
                h = 0;
            }
            current.add(row);
            h += ROW_HEIGHT;
        }
        if (!current.isEmpty()) pages.add(current);
        if (pages.isEmpty()) pages.add(new ArrayList<>());
        return pages;
    }

    private List<Map<String, Object>> convertToRows(NursingDayData dayData) {
        List<Map<String, Object>> rows = new ArrayList<>();
        SimpleDateFormat tf = new SimpleDateFormat("HH:mm");
        TreeMap<Date, Map<String, Object>> timeMap = new TreeMap<>();

        for (org.bson.Document v : dayData.getVitals()) {
            Date t = v.getDate("time");
            if (t == null) continue;
            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));
        }
        for (org.bson.Document r : dayData.getNurseRecords()) {
            Date t = r.getDate("time");
            if (t == null) continue;
            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));
            row.put("nursingRecord", str(r, "desc"));
            row.put("signature", str(r, "accountId"));
        }
        for (org.bson.Document d : dayData.getDrugExecutions()) {
            Date t = d.getDate("startTime");
            if (t == null) continue;
            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));
            row.put("medName", str(d, "drugName"));
            row.put("medAmount", str(d, "dose"));
            row.put("medRoute", str(d, "route"));
        }

        rows.addAll(timeMap.values());
        return rows;
    }

    // ==================== 工具方法 ====================

    private String str(org.bson.Document doc, String key) {
        Object v = doc.get(key);
        return v != null ? v.toString() : "";
    }

    private String mapStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : "";
    }

    private String truncate(String text, int max) {
        if (text == null) return "";
        return text.length() > max ? text.substring(0, max - 3) + "..." : text;
    }

    private static class NursingDayData {
        private List<org.bson.Document> vitals = new ArrayList<>();
        private List<org.bson.Document> drugExecutions = new ArrayList<>();
        private List<org.bson.Document> nurseRecords = new ArrayList<>();
        private List<org.bson.Document> tubeRecords = new ArrayList<>();

        boolean isEmpty() { return vitals.isEmpty() && drugExecutions.isEmpty() && nurseRecords.isEmpty(); }
        List<org.bson.Document> getVitals() { return vitals; }
        void setVitals(List<org.bson.Document> v) { this.vitals = v; }
        List<org.bson.Document> getDrugExecutions() { return drugExecutions; }
        void setDrugExecutions(List<org.bson.Document> v) { this.drugExecutions = v; }
        List<org.bson.Document> getNurseRecords() { return nurseRecords; }
        void setNurseRecords(List<org.bson.Document> v) { this.nurseRecords = v; }
        List<org.bson.Document> getTubeRecords() { return tubeRecords; }
        void setTubeRecords(List<org.bson.Document> v) { this.tubeRecords = v; }
    }
}
