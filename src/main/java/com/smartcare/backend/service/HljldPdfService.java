package com.smartcare.backend.service;

import com.itextpdf.awt.PdfGraphics2D;
import com.itextpdf.text.Document;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.PageSize;
import com.itextpdf.awt.DefaultFontMapper;
import com.itextpdf.text.pdf.BaseFont;
import com.itextpdf.text.pdf.PdfWriter;
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
    private final FormPageIndexRepository pageIndexRepository;

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
    private static final float LINE_HEIGHT = 12f; // 多行文本行高

    // 列宽配置
    private static final float[] COL_WIDTHS = {
        55f, 38f, 28f, 28f, 38f, 28f, 28f, 28f, 35f,
        38f, 28f, 38f, 28f, 32f, 32f, 32f, 32f, 120f, 35f
    };

    // 字体
    private Font chineseFont;
    private boolean fontInitialized = false;
    private DefaultFontMapper fontMapper;

    @Autowired
    public HljldPdfService(MongoTemplate mongoTemplate, FormPageIndexRepository pageIndexRepository) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
    }

    /**
     * 初始化中文字体
     * 使用 iText FontMapper 确保 PdfGraphics2D 能正确渲染中文
     */
    private synchronized void initFont() {
        if (fontInitialized) return;
        fontInitialized = true;
        fontMapper = new DefaultFontMapper();

        // 优先从 classpath 加载（JAR 内自带，跨平台可靠）
        String[] fontPaths = {
            "/fonts/simsun.ttc",
            "/fonts/simsun.ttf",
            "/fonts/simsunb.ttf",
            "/fonts/SimsunExtG.ttf",
            "/fonts/Microsoft YaHei.ttf",
            "/fonts/NotoSansCJKsc-Regular.otf"
        };

        for (String fontPath : fontPaths) {
            try (InputStream is = getClass().getResourceAsStream(fontPath)) {
                if (is != null) {
                    // 验证 BaseFont 能加载
                    BaseFont bf = BaseFont.createFont(fontPath + ",0", BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
                    String bfName = bf.getFullFontName()[0][3];
                    // 注册到 FontMapper —— PdfGraphics2D 内部通过 awtToPdf() 查找
                    DefaultFontMapper.BaseFontParameters params = new DefaultFontMapper.BaseFontParameters(fontPath + ",0");
                    params.encoding = BaseFont.IDENTITY_H;
                    params.embedded = BaseFont.EMBEDDED;
                    fontMapper.putName(bfName.toLowerCase(), params);
                    fontMapper.putAlias(bfName, bfName.toLowerCase());
                    // AWT Font 用于 g2d.setFont()
                    chineseFont = new Font(bfName, Font.PLAIN, 12);
                    log.info("字体加载成功(classpath): {}, BaseFont名称={}", fontPath, bfName);
                    return;
                }
            } catch (Exception e) {
                log.warn("classpath字体加载失败 {}: {}", fontPath, e.getMessage());
            }
        }

        // classpath 没有字体时，尝试系统字体目录（仅开发环境有用）
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] sysFontPaths;
        if (os.contains("windows")) {
            sysFontPaths = new String[]{
                "C:/Windows/Fonts/simsun.ttc",
                "C:/Windows/Fonts/msyh.ttc",
                "C:/Windows/Fonts/simhei.ttf"
            };
        } else {
            sysFontPaths = new String[]{
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                "/usr/share/fonts/truetype/simsun.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
            };
        }

        for (String fontPath : sysFontPaths) {
            try {
                java.io.File fontFile = new java.io.File(fontPath);
                if (fontFile.exists()) {
                    fontMapper.insertFile(fontFile);
                    Font awtFont = Font.createFont(Font.TRUETYPE_FONT, fontFile);
                    GraphicsEnvironment.getLocalGraphicsEnvironment().registerFont(awtFont);
                    chineseFont = awtFont.deriveFont(Font.PLAIN, 12f);
                    log.info("字体加载成功(系统): {}", fontPath);
                    return;
                }
            } catch (Exception e) {
                log.warn("系统字体加载失败 {}: {}", fontPath, e.getMessage());
            }
        }

        log.error("所有中文字体加载失败，PDF中文将无法正常显示！");
    }

    /**
     * 获取指定大小的中文字体
     */
    private Font getFont(float size) {
        if (!fontInitialized) initFont();
        if (chineseFont == null) {
            log.warn("中文字体未加载，使用默认字体");
            return new Font("SansSerif", Font.PLAIN, (int) size);
        }
        return chineseFont.deriveFont(Font.PLAIN, size);
    }

    /**
     * 生成指定日期的护理记录 PDF
     */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("生成PDF: pid={}, date={}", pid, date);
        initFont(); // 确保 fontMapper 已初始化

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
                Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
                renderPage(g2d, patient, Collections.emptyList(), startPageNo, 1, date);
                g2d.dispose();
            } else {
                List<List<Map<String, Object>>> pages = paginateData(dayData);
                for (int i = 0; i < pages.size(); i++) {
                    if (i > 0) pdfDoc.newPage();
                    Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
                    renderPage(g2d, patient, pages.get(i), startPageNo + i, pages.size(), date);
                    g2d.dispose();
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
        initFont(); // 确保 fontMapper 已初始化

        Optional<FormPageIndex> indexOpt = pageIndexRepository.findByPidAndFormType(pid, "hljld2");
        if (indexOpt.isEmpty() || indexOpt.get().getDailyPages().isEmpty()) {
            return generateEmptyPagePdf(pid, "全部");
        }

        FormPageIndex index = indexOpt.get();
        org.bson.Document patient = getPatientInfo(pid);

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            Document pdfDoc = new Document(PageSize.A4.rotate(), 0, 0, 0, 0);
            PdfWriter writer = PdfWriter.getInstance(pdfDoc, baos);
            pdfDoc.open();

            float w = pdfDoc.getPageSize().getWidth();
            float h = pdfDoc.getPageSize().getHeight();
            boolean firstPage = true;

            for (FormPageIndex.DailyPageInfo dailyPage : index.getDailyPages()) {
                NursingDayData dayData = loadNursingDayData(pid, dailyPage.getDate());

                if (dayData.isEmpty()) {
                    if (!firstPage) pdfDoc.newPage();
                    firstPage = false;
                    Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
                    renderPage(g2d, patient, Collections.emptyList(), dailyPage.getStartPageNo(), 1, dailyPage.getDate());
                    g2d.dispose();
                } else {
                    List<List<Map<String, Object>>> pages = paginateData(dayData);
                    for (int i = 0; i < pages.size(); i++) {
                        if (!firstPage) pdfDoc.newPage();
                        firstPage = false;
                        Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
                        renderPage(g2d, patient, pages.get(i), dailyPage.getStartPageNo() + i, pages.size(), dailyPage.getDate());
                        g2d.dispose();
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
     * 渲染完整页面（使用绝对坐标）
     */
    private void renderPage(Graphics2D g2d, org.bson.Document patient, List<Map<String, Object>> rows, int pageNo, int totalPages, String date) {
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        float lx = MARGIN_LEFT;  // 左边距
        float tw = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 表格宽度
        float y; // 当前 y 坐标

        // ===== 1. 标题 =====
        y = MARGIN_TOP + 20;
        Font titleFont = getFont(16f);
        g2d.setFont(titleFont);
        g2d.setColor(Color.BLACK);
        String title = "重钢总医院重症医学科护理记录单";
        log.debug("标题字体: name={}, family={}, canDisplay='{}'={}", titleFont.getFontName(), titleFont.getFamily(), title, titleFont.canDisplayUpTo(title));
        FontMetrics fm16 = g2d.getFontMetrics();
        g2d.drawString(title, lx + (tw - fm16.stringWidth(title)) / 2, y);

        // ===== 2. 患者信息 =====
        y = MARGIN_TOP + 45;
        g2d.setFont(getFont(9f));
        String info = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s",
            str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
            str(patient, "sex"), str(patient, "age"));
        g2d.drawString(info, lx, y);

        // ===== 3. 分隔线 =====
        y = MARGIN_TOP + 60;
        g2d.setColor(Color.BLACK);
        g2d.setStroke(new BasicStroke(0.5f));
        g2d.draw(new Line2D.Float(lx, y, lx + tw, y));

        // ===== 4. 表头 =====
        float tableTop = MARGIN_TOP + 70;
        float headerH = 35;

        // 表头背景
        g2d.setColor(new Color(240, 240, 240));
        g2d.fill(new Rectangle2D.Float(lx, tableTop, tw, headerH));

        // 表头边框
        g2d.setColor(Color.BLACK);
        g2d.setStroke(new BasicStroke(0.5f));
        g2d.draw(new Rectangle2D.Float(lx, tableTop, tw, headerH));

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
        float hx = lx;
        for (int i = 0; i < Math.min(headers.length, COL_WIDTHS.length); i++) {
            if (!headers[i].isEmpty()) {
                g2d.drawString(headers[i], hx + 2, tableTop + 12);
            }
            hx += COL_WIDTHS[i];
        }

        // 列分隔线
        hx = lx;
        g2d.setStroke(new BasicStroke(0.3f));
        for (int i = 0; i < COL_WIDTHS.length - 1; i++) {
            hx += COL_WIDTHS[i];
            g2d.draw(new Line2D.Float(hx, tableTop, hx, tableTop + headerH));
        }

        // ===== 5. 数据行 =====
        float dataTop = tableTop + headerH;
        float maxDataY = PAGE_HEIGHT - MARGIN_BOTTOM - 50; // 留出页脚空间
        float dy = dataTop;

        g2d.setFont(getFont(7f));
        g2d.setColor(Color.BLACK);

        for (Map<String, Object> row : rows) {
            if (dy + ROW_HEIGHT > maxDataY) break;

            float dx = lx;
            drawCell(g2d, dx, dy, COL_WIDTHS[0], row, "timeText");       dx += COL_WIDTHS[0];
            drawCell(g2d, dx, dy, COL_WIDTHS[1], row, "medName");         dx += COL_WIDTHS[1];
            drawCell(g2d, dx, dy, COL_WIDTHS[2], row, "medAmount");       dx += COL_WIDTHS[2];
            drawCell(g2d, dx, dy, COL_WIDTHS[3], row, "medRoute");        dx += COL_WIDTHS[3];
            drawCell(g2d, dx, dy, COL_WIDTHS[4], row, "enteralName");     dx += COL_WIDTHS[4];
            drawCell(g2d, dx, dy, COL_WIDTHS[5], row, "enteralAmount");   dx += COL_WIDTHS[5];
            drawCell(g2d, dx, dy, COL_WIDTHS[6], row, "enteralRoute");    dx += COL_WIDTHS[6];
            drawCell(g2d, dx, dy, COL_WIDTHS[7], row, "urine");           dx += COL_WIDTHS[7];
            drawCell(g2d, dx, dy, COL_WIDTHS[8], row, "ultrafiltration"); dx += COL_WIDTHS[8];
            drawCell(g2d, dx, dy, COL_WIDTHS[9], row, "outputName");      dx += COL_WIDTHS[9];
            drawCell(g2d, dx, dy, COL_WIDTHS[10], row, "outputAmount");   dx += COL_WIDTHS[10];
            drawCell(g2d, dx, dy, COL_WIDTHS[11], row, "drainName");      dx += COL_WIDTHS[11];
            drawCell(g2d, dx, dy, COL_WIDTHS[12], row, "drainAmount");    dx += COL_WIDTHS[12];
            drawCell(g2d, dx, dy, COL_WIDTHS[13], row, "examination");    dx += COL_WIDTHS[13];
            drawCell(g2d, dx, dy, COL_WIDTHS[14], row, "treatment");      dx += COL_WIDTHS[14];
            drawCell(g2d, dx, dy, COL_WIDTHS[15], row, "basicCare");      dx += COL_WIDTHS[15];
            drawCell(g2d, dx, dy, COL_WIDTHS[16], row, "healthEducation");dx += COL_WIDTHS[16];
            // 护理记录使用多行显示
            drawMultiLineCell(g2d, dx, dy, COL_WIDTHS[17], ROW_HEIGHT, row, "nursingRecord"); dx += COL_WIDTHS[17];
            drawCell(g2d, dx, dy, COL_WIDTHS[18], row, "signature");

            // 行边框
            g2d.setColor(new Color(200, 200, 200));
            g2d.setStroke(new BasicStroke(0.3f));
            g2d.draw(new Rectangle2D.Float(lx, dy, tw, ROW_HEIGHT));
            g2d.setColor(Color.BLACK);

            dy += ROW_HEIGHT;
        }

        // ===== 6. 空数据提示 =====
        if (rows.isEmpty()) {
            g2d.setFont(getFont(12f));
            g2d.setColor(new Color(150, 150, 150));
            String msg = "该护理日暂无记录";
            FontMetrics fm12 = g2d.getFontMetrics();
            g2d.drawString(msg, lx + (tw - fm12.stringWidth(msg)) / 2, (dataTop + maxDataY) / 2);
        }

        // ===== 7. 页脚 =====
        float footerY = PAGE_HEIGHT - MARGIN_BOTTOM - 15;

        // 备注区域
        g2d.setColor(new Color(200, 200, 200));
        g2d.setStroke(new BasicStroke(0.3f));
        g2d.draw(new Rectangle2D.Float(lx, footerY, tw, 15));
        g2d.setFont(getFont(8f));
        g2d.setColor(Color.BLACK);
        g2d.drawString("备注：", lx + 5, footerY + 10);

        // 页码
        g2d.setFont(getFont(10f));
        String pageText = String.format("第 %d 页", pageNo);
        FontMetrics fm10 = g2d.getFontMetrics();
        g2d.drawString(pageText, lx + (tw - fm10.stringWidth(pageText)) / 2, footerY + 35);

        // 日期
        g2d.setFont(getFont(7f));
        g2d.drawString("护理日：" + date, lx + tw - 80, footerY + 35);
    }

    /**
     * 绘制单元格（支持多行文本）
     */
    private void drawCell(Graphics2D g2d, float x, float y, float width, Map<String, Object> row, String key) {
        String text = mapStr(row, key);
        if (text != null && !text.isEmpty()) {
            // 计算该列可显示的最大字符数（基于列宽和字体大小）
            FontMetrics fm = g2d.getFontMetrics();
            int maxChars = calculateMaxChars(fm, width - 4); // 减去左右边距

            // 如果文本长度超过限制，尝试截断
            if (text.length() > maxChars) {
                text = text.substring(0, maxChars - 3) + "...";
            }

            g2d.drawString(text, x + 2, y + 12);
        }
    }

    /**
     * 计算指定宽度内可显示的最大字符数
     */
    private int calculateMaxChars(FontMetrics fm, float width) {
        if (width <= 0) return 0;
        // 估算平均字符宽度（中文字符约为字体大小的0.6-0.8倍）
        int avgCharWidth = fm.charWidth('中');
        if (avgCharWidth <= 0) avgCharWidth = (int)(fm.getFont().getSize() * 0.7);
        return Math.max(1, (int)(width / avgCharWidth));
    }

    /**
     * 绘制多行单元格（用于护理记录等长文本字段）
     */
    private void drawMultiLineCell(Graphics2D g2d, float x, float y, float width, float maxHeight,
                                   Map<String, Object> row, String key) {
        String text = mapStr(row, key);
        if (text == null || text.isEmpty()) return;

        FontMetrics fm = g2d.getFontMetrics();
        int maxCharsPerLine = calculateMaxChars(fm, width - 4);
        float lineHeight = LINE_HEIGHT;

        // 简单的自动换行
        List<String> lines = wrapText(text, maxCharsPerLine);

        // 绘制文本（限制行数以适应行高）
        int maxLines = (int)(maxHeight / lineHeight);
        for (int i = 0; i < Math.min(lines.size(), maxLines); i++) {
            String line = lines.get(i);
            // 最后一行如果还有更多内容，添加省略号
            if (i == maxLines - 1 && i < lines.size() - 1) {
                line = line.substring(0, Math.max(0, line.length() - 3)) + "...";
            }
            g2d.drawString(line, x + 2, y + 12 + i * lineHeight);
        }
    }

    /**
     * 文本自动换行
     */
    private List<String> wrapText(String text, int maxCharsPerLine) {
        List<String> lines = new ArrayList<>();
        if (text == null || maxCharsPerLine <= 0) {
            lines.add("");
            return lines;
        }

        int start = 0;
        while (start < text.length()) {
            int end = Math.min(start + maxCharsPerLine, text.length());
            lines.add(text.substring(start, end));
            start = end;
        }
        return lines;
    }

    /**
     * 生成空白页 PDF
     */
    private byte[] generateEmptyPagePdf(String pid, String date) {
        initFont(); // 确保 fontMapper 已初始化
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            Document pdfDoc = new Document(PageSize.A4.rotate(), 0, 0, 0, 0);
            PdfWriter writer = PdfWriter.getInstance(pdfDoc, baos);
            pdfDoc.open();

            float w = pdfDoc.getPageSize().getWidth();
            float h = pdfDoc.getPageSize().getHeight();

            Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
            org.bson.Document patient = getPatientInfo(pid);
            int startPageNo = getStartPageNo(pid, date);
            renderPage(g2d, patient, Collections.emptyList(), startPageNo, 1, date);
            g2d.dispose();

            pdfDoc.close();
            return baos.toByteArray();
        } catch (DocumentException e) {
            throw new RuntimeException("生成空白页PDF失败", e);
        }
    }

    /**
     * 计算某天的页数（供 FormPageIndexService 调用）
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
        return pageIndexRepository.findByPidAndFormType(pid, "hljld2")
            .flatMap(idx -> idx.getDailyPages().stream()
                .filter(d -> d.getDate().equals(date))
                .map(FormPageIndex.DailyPageInfo::getStartPageNo)
                .findFirst())
            .orElse(1);
    }

    // ==================== 数据转换 ====================

    private List<List<Map<String, Object>>> paginateData(NursingDayData dayData) {
        List<Map<String, Object>> allRows = convertToRows(dayData);
        List<List<Map<String, Object>>> pages = new ArrayList<>();
        List<Map<String, Object>> current = new ArrayList<>();
        // 可用高度 = 页面高度 - 上边距 - 标题区域(70) - 表头(35) - 页脚(50) - 下边距
        float h = 0, maxH = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - 70 - 35 - 50;

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

        // ========== 1. 处理生命体征/床旁数据 ==========
        // 与前端 DISPLAY_BEDSIDE_CODES 对齐
        for (org.bson.Document v : dayData.getVitals()) {
            Date t = v.getDate("time");
            if (t == null) continue;
            String code = str(v, "code");
            String val = str(v, "strVal");
            String remark = str(v, "remark");

            // 跳过签名记录和无效数据
            if ("param_Yishi".equals(code)) continue;
            if (val == null || val.trim().isEmpty()) continue;

            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));

            switch (code) {
                case "param_niaoLiang":  // 尿量
                    row.put("urine", val);
                    break;
                case "param_chaoLvLiang":  // 净超滤量
                    row.put("ultrafiltration", val);
                    break;
                case "param_daBianAmount":  // 大便量
                case "param_造瘘口量":      // 造瘘口量
                case "param_outuwuliang":   // 呕吐物量
                case "param_咯血":          // 咯血
                case "param_tanLiang":      // 痰液量
                    // 排出物
                    String outputName = getOutputName(code);
                    row.put("outputName", outputName);
                    row.put("outputAmount", val);
                    break;
                case "param_带入药量":  // 带入药量
                case "param_kouFu":     // 口服药
                case "param_biSi":      // 鼻饲
                    // 胃肠摄入
                    String route = "";
                    if ("param_带入药量".equals(code)) route = "带入";
                    else if ("param_kouFu".equals(code)) route = "po";
                    else if ("param_biSi".equals(code)) route = "鼻饲";
                    String enteralName = remark != null ? remark.trim() : "";
                    row.put("enteralName", enteralName);
                    row.put("enteralAmount", val);
                    row.put("enteralRoute", route);
                    break;
                case "param_外出检查":  // 检查
                    row.put("examination", val);
                    break;
                case "param_物理治疗":  // 治疗
                    row.put("treatment", val);
                    break;
                case "param_基础护理1":  // 基础护理
                    row.put("basicCare", val);
                    break;
                case "param_健康教育":  // 健康教育
                    row.put("healthEducation", val);
                    break;
                default:
                    // 引流液：code 包含 "引流"
                    if (code.contains("引流")) {
                        String drainName = code.replace("param_tube_", "").replace("param_", "");
                        drainName = drainName.endsWith("管") ? drainName.substring(0, drainName.length() - 1) + "液" : drainName;
                        row.put("drainName", drainName);
                        row.put("drainAmount", val);
                    }
                    break;
            }
        }

        // ========== 2. 处理护理记录 ==========
        for (org.bson.Document r : dayData.getNurseRecords()) {
            Date t = r.getDate("time");
            if (t == null) continue;
            String desc = str(r, "desc");
            if (desc == null || desc.trim().isEmpty()) continue;

            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));
            // 护理记录可能已有多行内容，保留完整内容
            String existingRecord = mapStr(row, "nursingRecord");
            if (!existingRecord.isEmpty()) {
                row.put("nursingRecord", existingRecord + "\n" + desc);
            } else {
                row.put("nursingRecord", desc);
            }
            // 签名
            String signature = str(r, "accountId");
            if (signature != null && !signature.isEmpty()) {
                row.put("signature", signature);
            }
        }

        // ========== 3. 处理药物执行 ==========
        for (org.bson.Document d : dayData.getDrugExecutions()) {
            Date t = d.getDate("startTime");
            if (t == null) continue;
            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));

            // 提取药物名称和剂量
            @SuppressWarnings("unchecked")
            List<org.bson.Document> drugList = (List<org.bson.Document>) d.get("drugList");
            if (drugList != null && !drugList.isEmpty()) {
                StringBuilder drugNames = new StringBuilder();
                for (org.bson.Document drug : drugList) {
                    String name = str(drug, "name");
                    if (!name.isEmpty()) {
                        if (drugNames.length() > 0) drugNames.append("、");
                        drugNames.append(name);
                    }
                }
                if (drugNames.length() > 0) {
                    row.put("medName", drugNames.toString());
                }
            }

            // 药物剂量
            Object doseObj = d.get("dose");
            if (doseObj != null) {
                row.put("medAmount", doseObj.toString());
            }

            // 给药途径
            String route = str(d, "route");
            if (!route.isEmpty()) {
                row.put("medRoute", route);
            }
        }

        // ========== 4. 处理管路记录（引流液）==========
        for (org.bson.Document tube : dayData.getTubeRecords()) {
            @SuppressWarnings("unchecked")
            List<org.bson.Document> recordList = (List<org.bson.Document>) tube.get("tubeRecordList");
            if (recordList == null) continue;

            for (org.bson.Document record : recordList) {
                Date t = record.getDate("time");
                if (t == null) continue;

                Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
                row.put("timeText", tf.format(t));

                // 提取引流液名称和量
                String name = str(record, "name");
                String amount = str(record, "strVal");
                if (!name.isEmpty()) {
                    row.put("drainName", name);
                }
                if (!amount.isEmpty()) {
                    row.put("drainAmount", amount);
                }
            }
        }

        rows.addAll(timeMap.values());
        return rows;
    }

    /**
     * 获取排出物名称
     */
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

    /**
     * 文本截断（不限制长度，由绘制方法根据列宽处理）
     */
    private String safeStr(String text) {
        return text != null ? text : "";
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
