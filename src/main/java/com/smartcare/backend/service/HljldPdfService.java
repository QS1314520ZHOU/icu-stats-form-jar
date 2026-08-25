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
 * 使用 iText Graphics2D 方案，格式与前端 hljld2-form 完全一致。
 *
 * 表格特征：
 * - 19 列双行层级表头
 * - 固定列宽比例（与 hljld2-form CSS 对齐）
 * - 动态行高：文本超宽自动换行，行高随内容撑开
 * - 小结行带背景色（日间小结/交接班小结/全日总结/出科总结）
 * - 底部 4 行固定备注区
 */
@Service
public class HljldPdfService {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfService.class);

    private final MongoTemplate mongoTemplate;
    private final FormPageIndexRepository pageIndexRepository;

    // ── A4 横向尺寸（点，72 DPI） ──
    private static final float PAGE_WIDTH  = 842f;  // 297mm
    private static final float PAGE_HEIGHT = 595f;  // 210mm

    // ── 边距 ──
    private static final float MARGIN = 20f;        // ~7mm

    // ── 表格区域 ──
    private static final float TABLE_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 802
    private static final int   HEADER_ROW_HEIGHT = 14;   // 表头每行高度
    private static final int   DATA_ROW_HEIGHT   = 18;   // 数据行最小高度
    private static final float LINE_SPACING      = 10f;   // 多行文本行间距

    // ── 19 列宽度（pt），与 hljld2-form CSS 百分比对齐 ──
    // 7%, 7.5%, 4%, 3.5%, 6.5%, 4%, 3.5%, 3.5%, 3.5%, 5%, 3.5%, 5%, 3.5%, 4%, 4%, 4%, 4%, 17%, 5.5%
    private static final float[] COL_WIDTHS = {
        56f, 60f, 32f, 28f, 52f, 32f, 28f, 28f, 28f,
        40f, 28f, 40f, 28f, 32f, 32f, 32f, 32f, 136f, 44f
    };

    // ── 字体 ──
    private Font chineseFont;
    private boolean fontInitialized = false;
    private DefaultFontMapper fontMapper;

    // ── 表头第一行布局：label, colspan, isRowspan ──
    private static final Object[][] HEADER_ROW1 = {
        { "日期时间",  1, true  },
        { "药物治疗",  3, false },
        { "胃肠摄入",  3, false },
        { "尿量(ml)",  1, true  },
        { "净超滤量(ml)", 1, true },
        { "排出物",    2, false },
        { "引流液",    2, false },
        { "检查",      1, true  },
        { "治疗",      1, true  },
        { "基础护理",  1, true  },
        { "健康教育",  1, true  },
        { "护理记录",  1, true  },
        { "签名",      1, true  },
    };

    // ── 表头第二行子列标签 ──
    private static final String[] HEADER_ROW2 = {
        "名称", "量/ml", "途径",       // 药物治疗
        "名称", "量/ml", "途径",       // 胃肠摄入
        "名称", "量/ml",              // 排出物
        "名称", "量/ml",              // 引流液
    };

    // ── 小结背景色 ──
    private static final Color COLOR_DAY_SUMMARY     = new Color(247, 243, 223); // #f7f3df
    private static final Color COLOR_SHIFT_SUMMARY   = new Color(244, 241, 227); // #f4f1e3
    private static final Color COLOR_24H_SUMMARY     = new Color(237, 246, 238); // #edf6ee
    private static final Color COLOR_DISCHARGE_SUMMARY = new Color(232, 240, 254); // #e8f0fe

    // ── 床旁数据编码白名单（与前端 DISPLAY_BEDSIDE_CODES 对齐） ──
    private static final java.util.Set<String> DISPLAY_BEDSIDE_CODES = new java.util.HashSet<>(java.util.Arrays.asList(
        "param_带入药量", "param_kouFu", "param_biSi",           // 胃肠摄入
        "param_niaoLiang", "param_chaoLvLiang",                  // 尿量、净超滤量
        "param_daBianAmount", "param_造瘘口量", "param_outuwuliang", "param_咯血", "param_tanLiang", // 排出物
        "param_外出检查", "param_物理治疗", "param_基础护理1", "param_健康教育"
    ));

    // ── 历史引流编码白名单 ──
    private static final java.util.Set<String> LEGACY_DRAIN_CODES = new java.util.HashSet<>(java.util.Arrays.asList(
        "param_tube_胃肠减压"
    ));

    // ── 排出物编码名称映射（与前端 OUTPUT_CODE_NAMES 对齐） ──
    private static final java.util.Map<String, String> OUTPUT_CODE_NAMES = new java.util.HashMap<>();
    static {
        OUTPUT_CODE_NAMES.put("param_daBianAmount", "大便量");
        OUTPUT_CODE_NAMES.put("param_造瘘口量", "造瘘口量");
        OUTPUT_CODE_NAMES.put("param_outuwuliang", "呕吐物量");
        OUTPUT_CODE_NAMES.put("param_咯血", "咯血");
        OUTPUT_CODE_NAMES.put("param_tanLiang", "痰液量");
    }

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
        fontMapper = new DefaultFontMapper();

        log.info("========== 字体初始化开始 ==========");

        // 1. 优先使用 classpath 字体（部署到服务器时确保字体可用）
        String[] fontResources = {
            "/fonts/simsun.ttc", "/fonts/simsun.ttf", "/fonts/simsunb.ttf",
            "/fonts/SimsunExtG.ttf", "/fonts/Microsoft YaHei.ttf",
            "/fonts/NotoSansCJKsc-Regular.otf"
        };

        for (String resPath : fontResources) {
            try {
                org.springframework.core.io.Resource resource = new org.springframework.core.io.ClassPathResource(resPath);
                if (!resource.exists()) continue;

                // 从 jar 包读取字体，写入临时文件
                byte[] fontBytes = resource.getInputStream().readAllBytes();
                log.info("classpath字体读取成功: {}, 字节数={}", resPath, fontBytes.length);

                String suffix = resPath.substring(resPath.lastIndexOf('.'));
                java.io.File tempFont = java.io.File.createTempFile("icu_font_", suffix);
                tempFont.deleteOnExit();
                java.nio.file.Files.write(tempFont.toPath(), fontBytes);
                log.info("字体已写入临时文件: {}, 大小={}bytes", tempFont.getAbsolutePath(), tempFont.length());

                // .ttc 文件必须加索引（,0 或 ,1，先试 ,0）
                String indexedPath = tempFont.getAbsolutePath() + ",0";

                // 验证 BaseFont 能正确加载
                BaseFont bf = BaseFont.createFont(indexedPath, BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
                log.info("BaseFont验证: name={}, charExists(中)={}", bf.getPostscriptFontName(), bf.charExists('中'));

                // 注册到 fontMapper（用 putName 注册，key 必须和 AWT Font 名一致）
                DefaultFontMapper.BaseFontParameters params = new DefaultFontMapper.BaseFontParameters(indexedPath);
                params.encoding = BaseFont.IDENTITY_H;
                params.embedded = BaseFont.EMBEDDED;
                fontMapper.putName("SimSun", params);
                fontMapper.putName("宋体", params);
                fontMapper.putName("simsun", params);

                // 创建 AWT Font（new Font("SimSun", ...) 的名字必须和 putName 的 key 一致）
                Font awtFont = new Font("SimSun", Font.PLAIN, 12);
                chineseFont = awtFont;

                log.info("classpath字体加载成功: name={}, family={}", chineseFont.getFontName(), chineseFont.getFamily());
                log.info("========== 字体初始化完成(classpath) ==========");
                return;
            } catch (Exception e) {
                log.warn("classpath字体加载失败 {}: {}", resPath, e.getMessage());
            }
        }

        // 2. 回退：系统字体（本地开发时可能用到）
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] sysFontPaths = os.contains("windows")
            ? new String[]{ "C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf" }
            : new String[]{ "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "/usr/share/fonts/truetype/simsun.ttc" };

        for (String fontPath : sysFontPaths) {
            try {
                java.io.File fontFile = new java.io.File(fontPath);
                if (fontFile.exists()) {
                    log.info("找到系统字体: {}, 大小={}bytes", fontPath, fontFile.length());
                    String indexedPath = fontPath.endsWith(".ttc") ? fontPath + ",0" : fontPath;

                    BaseFont bf = BaseFont.createFont(indexedPath, BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
                    log.info("BaseFont验证: name={}, charExists(中)={}", bf.getPostscriptFontName(), bf.charExists('中'));

                    DefaultFontMapper.BaseFontParameters params = new DefaultFontMapper.BaseFontParameters(indexedPath);
                    params.encoding = BaseFont.IDENTITY_H;
                    params.embedded = BaseFont.EMBEDDED;
                    fontMapper.putName("SimSun", params);
                    fontMapper.putName("宋体", params);

                    Font awtFont = new Font("SimSun", Font.PLAIN, 12);
                    chineseFont = awtFont;
                    log.info("系统字体加载成功: name={}, family={}", chineseFont.getFontName(), chineseFont.getFamily());
                    log.info("========== 字体初始化完成(系统字体) ==========");
                    return;
                }
            } catch (Exception e) {
                log.warn("系统字体加载失败 {}: {}", fontPath, e.getMessage());
            }
        }
        log.error("========== 所有中文字体加载失败！PDF中文将无法正常显示 ==========");
    }

    private Font getFont(float size) {
        if (!fontInitialized) initFont();
        if (chineseFont == null) return new Font("SansSerif", Font.PLAIN, (int) size);
        return chineseFont.deriveFont(Font.PLAIN, size);
    }

    // ══════════════════════════════════════════════════════════
    //  PDF 生成入口
    // ══════════════════════════════════════════════════════════

    /** 生成指定日期的护理记录 PDF */
    public byte[] generateDailyPdf(String pid, String date) {
        log.info("生成PDF: pid={}, date={}", pid, date);
        initFont();

        org.bson.Document patient = getPatientInfo(pid);
        NursingDayData dayData = loadNursingDayData(pid, date);
        int startPageNo = getStartPageNo(pid, date);
        log.info("PDF数据加载完成: patient={}, vitals={}, drugExe={}, nurseRecords={}, startPageNo={}",
            patient.getString("name"), dayData.getVitals().size(), dayData.getDrugExecutions().size(),
            dayData.getNurseRecords().size(), startPageNo);

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            Document pdfDoc = new Document(PageSize.A4.rotate(), 0, 0, 0, 0);
            PdfWriter writer = PdfWriter.getInstance(pdfDoc, baos);
            pdfDoc.open();

            float w = pdfDoc.getPageSize().getWidth();
            float h = pdfDoc.getPageSize().getHeight();

            // 创建临时 Graphics2D 用于获取 FontMetrics（分页计算需要）
            Graphics2D measureG2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
            FontMetrics fm = measureG2d.getFontMetrics();
            measureG2d.dispose();

            if (dayData.isEmpty()) {
                log.info("PDF: 无数据，生成空白页");
                Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
                renderPage(g2d, patient, Collections.emptyList(), startPageNo, 1, date);
                g2d.dispose();
            } else {
                List<PageRows> pages = paginateData(dayData, fm);
                log.info("PDF: 分页完成，共{}页", pages.size());
                for (int i = 0; i < pages.size(); i++) {
                    if (i > 0) pdfDoc.newPage();
                    Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
                    renderPage(g2d, patient, pages.get(i).rows, startPageNo + i, pages.size(), date);
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

    /** 生成全部记录的 PDF */
    public byte[] generateAllPagesPdf(String pid) {
        log.info("生成全部PDF: pid={}", pid);
        initFont();

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

            // 创建临时 Graphics2D 用于获取 FontMetrics
            Graphics2D measureG2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
            FontMetrics fm = measureG2d.getFontMetrics();
            measureG2d.dispose();

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
                    List<PageRows> pages = paginateData(dayData, fm);
                    for (int i = 0; i < pages.size(); i++) {
                        if (!firstPage) pdfDoc.newPage();
                        firstPage = false;
                        Graphics2D g2d = new PdfGraphics2D(writer.getDirectContent(), w, h, fontMapper);
                        renderPage(g2d, patient, pages.get(i).rows, dailyPage.getStartPageNo() + i, pages.size(), dailyPage.getDate());
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

    /** 计算某天的页数（供 FormPageIndexService 调用） */
    public int calculatePageCount(String pid, String date) {
        initFont();
        NursingDayData dayData = loadNursingDayData(pid, date);
        log.info("计算页数: pid={}, date={}, vitals={}, drugExe={}, nurseRecords={}",
            pid, date, dayData.getVitals().size(), dayData.getDrugExecutions().size(),
            dayData.getNurseRecords().size());
        // 使用 BufferedImage 获取 FontMetrics（仅用于分页估算）
        try {
            java.awt.image.BufferedImage tmpImg = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_ARGB);
            Graphics2D tmpG2d = tmpImg.createGraphics();
            tmpG2d.setFont(getFont(7f));
            FontMetrics fm = tmpG2d.getFontMetrics();
            tmpG2d.dispose();
            int pageCount = paginateData(dayData, fm).size();
            log.info("页数计算完成: pid={}, date={}, pageCount={}", pid, date, pageCount);
            return pageCount;
        } catch (Exception e) {
            log.error("计算页数失败: pid={}, date={}", pid, date, e);
            return 1; // 默认返回1页
        }
    }

    // ══════════════════════════════════════════════════════════
    //  页面渲染
    // ══════════════════════════════════════════════════════════

    private void renderPage(Graphics2D g2d, org.bson.Document patient,
                            List<Map<String, Object>> rows, int pageNo, int totalPages, String date) {
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        float lx = MARGIN;
        float y;

        // ===== 1. 标题 =====
        y = MARGIN + 18;
        Font titleFont = getFont(16f);
        g2d.setFont(titleFont);
        g2d.setColor(Color.BLACK);
        String title = "重钢总医院重症医学科护理记录单";
        FontMetrics fmTitle = g2d.getFontMetrics();
        g2d.drawString(title, lx + (TABLE_WIDTH - fmTitle.stringWidth(title)) / 2, y);

        // ===== 2. 患者信息 =====
        y += 22;
        g2d.setFont(getFont(9f));
        g2d.setColor(Color.BLACK);
        String info = String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s",
            str(patient, "bedNo"), str(patient, "name"), str(patient, "mrn"),
            str(patient, "sex"), str(patient, "age"));
        g2d.drawString(info, lx, y);

        // 诊断（如果存在）
        String diagnosis = str(patient, "diagnosis");
        if (!diagnosis.isEmpty()) {
            g2d.drawString("诊断：" + diagnosis, lx + 400, y);
        }

        // ===== 3. 表头（两行层级） =====
        float headerTop = y + 10;
        drawTableHeader(g2d, lx, headerTop);

        // ===== 4. 数据行 =====
        float dataTop = headerTop + 2 * HEADER_ROW_HEIGHT;
        float remarkAreaHeight = 55f;  // 备注区域高度
        float maxDataY = PAGE_HEIGHT - MARGIN - remarkAreaHeight;
        float dy = dataTop;

        g2d.setColor(Color.BLACK);

        FontMetrics dataFm = g2d.getFontMetrics();
        for (Map<String, Object> row : rows) {
            int rowLines = calcMaxLines(row, dataFm);
            int rowH = Math.max(DATA_ROW_HEIGHT, (int) Math.ceil(rowLines * LINE_SPACING));

            if (dy + rowH > maxDataY && dy > dataTop) break;

            drawDataRow(g2d, lx, dy, TABLE_WIDTH, rowH, row);
            dy += rowH;
        }

        // ===== 5. 空数据提示 =====
        if (rows.isEmpty()) {
            g2d.setFont(getFont(11f));
            g2d.setColor(new Color(150, 150, 150));
            String msg = "该护理日暂无记录";
            FontMetrics fmMsg = g2d.getFontMetrics();
            g2d.drawString(msg, lx + (TABLE_WIDTH - fmMsg.stringWidth(msg)) / 2, (dataTop + maxDataY) / 2);
        }

        // ===== 6. 底部备注区（4 行） =====
        float remarkTop = maxDataY;
        drawRemarkArea(g2d, lx, remarkTop, TABLE_WIDTH, remarkAreaHeight);

        // ===== 7. 页码 =====
        g2d.setFont(getFont(10f));
        g2d.setColor(Color.BLACK);
        String pageText = String.format("第 %d 页", pageNo);
        FontMetrics fmPage = g2d.getFontMetrics();
        g2d.drawString(pageText, lx + (TABLE_WIDTH - fmPage.stringWidth(pageText)) / 2, PAGE_HEIGHT - MARGIN + 15);
    }

    // ══════════════════════════════════════════════════════════
    //  表头绘制（两行层级）
    // ══════════════════════════════════════════════════════════

    private void drawTableHeader(Graphics2D g2d, float x, float topY) {
        Font headerFont = getFont(7f);
        g2d.setFont(headerFont);
        g2d.setColor(Color.BLACK);
        FontMetrics fm = g2d.getFontMetrics();

        float totalH = 2 * HEADER_ROW_HEIGHT;

        // 表头背景（白色）
        g2d.setColor(Color.WHITE);
        g2d.fill(new Rectangle2D.Float(x, topY, TABLE_WIDTH, totalH));

        // 外边框
        g2d.setColor(Color.BLACK);
        g2d.setStroke(new BasicStroke(0.5f));
        g2d.draw(new Rectangle2D.Float(x, topY, TABLE_WIDTH, totalH));

        // ── 第一行 ──
        float cx = x;
        for (Object[] h1 : HEADER_ROW1) {
            String label = (String) h1[0];
            int colspan = (int) h1[1];
            boolean isRowspan = (boolean) h1[2];
            int startCol = getHeaderColIndex(label);

            float spanW = 0;
            for (int c = 0; c < colspan; c++) {
                spanW += COL_WIDTHS[startCol + c];
            }

            float textW = fm.stringWidth(label);
            if (isRowspan) {
                // rowspan=2：垂直居中
                float ty = topY + (totalH - fm.getHeight()) / 2 + fm.getAscent();
                float tx = cx + (spanW - textW) / 2;
                g2d.drawString(label, tx, ty);
            } else {
                // colspan>1：水平居中在第一行高度内
                float ty = topY + (HEADER_ROW_HEIGHT - fm.getHeight()) / 2 + fm.getAscent();
                float tx = cx + (spanW - textW) / 2;
                g2d.drawString(label, tx, ty);
            }

            cx += spanW;
        }

        // ── 第二行子列标签 ──
        float[] subColWidths = {
            COL_WIDTHS[1], COL_WIDTHS[2], COL_WIDTHS[3],  // 药物治疗
            COL_WIDTHS[4], COL_WIDTHS[5], COL_WIDTHS[6],  // 胃肠摄入
            COL_WIDTHS[9], COL_WIDTHS[10],                 // 排出物
            COL_WIDTHS[11], COL_WIDTHS[12],                // 引流液
        };
        float[] subGroupStartX = {
            x + COL_WIDTHS[0],
            x + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3],
            x + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3]
                + COL_WIDTHS[4] + COL_WIDTHS[5] + COL_WIDTHS[6]
                + COL_WIDTHS[7] + COL_WIDTHS[8],
            x + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3]
                + COL_WIDTHS[4] + COL_WIDTHS[5] + COL_WIDTHS[6]
                + COL_WIDTHS[7] + COL_WIDTHS[8] + COL_WIDTHS[9] + COL_WIDTHS[10],
        };
        float sx = subGroupStartX[0];
        int groupIdx = 0;
        int colsPerGroup = 0;
        int[] groupCols = {3, 3, 2, 2};
        for (int i = 0; i < HEADER_ROW2.length; i++) {
            float sw = subColWidths[i];
            String label = HEADER_ROW2[i];
            float ty = topY + HEADER_ROW_HEIGHT + (HEADER_ROW_HEIGHT - fm.getHeight()) / 2 + fm.getAscent();
            float tx = sx + (sw - fm.stringWidth(label)) / 2;
            g2d.drawString(label, tx, ty);
            sx += sw;
            colsPerGroup++;
            if (colsPerGroup >= groupCols[groupIdx] && groupIdx < groupCols.length - 1) {
                groupIdx++;
                colsPerGroup = 0;
                sx = subGroupStartX[groupIdx];
            }
        }

        // ── 水平分隔线 ──
        g2d.setStroke(new BasicStroke(0.3f));
        g2d.drawLine((int) x, (int) (topY + HEADER_ROW_HEIGHT), (int) (x + TABLE_WIDTH), (int) (topY + HEADER_ROW_HEIGHT));

        // ── 垂直列分隔线 ──
        float vx = x;
        for (int i = 0; i < COL_WIDTHS.length - 1; i++) {
            vx += COL_WIDTHS[i];
            g2d.drawLine((int) vx, (int) topY, (int) vx, (int) (topY + totalH));
        }
    }

    /**
     * 获取 HEADER_ROW1 项对应的起始列 index。
     * 按顺序：日期时间(0), 药物治疗(1), 胃肠摄入(4), 尿量(7), 净超滤量(8),
     *         排出物(9), 引流液(11), 检查(13), 治疗(14), 基础护理(15),
     *         健康教育(16), 护理记录(17), 签名(18)
     */
    private int getHeaderColIndex(String label) {
        switch (label) {
            case "日期时间":  return 0;
            case "药物治疗":  return 1;
            case "胃肠摄入":  return 4;
            case "尿量(ml)":  return 7;
            case "净超滤量(ml)": return 8;
            case "排出物":    return 9;
            case "引流液":    return 11;
            case "检查":      return 13;
            case "治疗":      return 14;
            case "基础护理":  return 15;
            case "健康教育":  return 16;
            case "护理记录":  return 17;
            case "签名":      return 18;
            default: return 0;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  数据行绘制
    // ══════════════════════════════════════════════════════════

    private void drawDataRow(Graphics2D g2d, float x, float y, float tableWidth, int rowH,
                             Map<String, Object> row) {
        g2d.setFont(getFont(7f));
        g2d.setColor(Color.BLACK);

        String[] keys = {
            "timeText", "medName", "medAmount", "medRoute",
            "enteralName", "enteralAmount", "enteralRoute",
            "urine", "ultrafiltration",
            "outputName", "outputAmount", "drainName", "drainAmount",
            "examination", "treatment", "basicCare", "healthEducation",
            "nursingRecord", "signature"
        };

        float dx = x;
        for (int i = 0; i < COL_WIDTHS.length; i++) {
            String text = mapStr(row, keys[i]);
            float w = COL_WIDTHS[i];

            if (!text.isEmpty()) {
                List<String> lines = wrapTextByWidth(text, w - 3, g2d.getFontMetrics());
                int maxLines = Math.max(1, (int)(rowH / LINE_SPACING));
                int drawLines = Math.min(lines.size(), maxLines);

                // 左对齐列
                boolean leftAlign = (i == 0 || i == 1 || i == 2 || i == 4 || i == 5
                    || i == 13 || i == 14 || i == 15 || i == 16 || i == 17);

                for (int line = 0; line < drawLines; line++) {
                    String ln = lines.get(line);
                    float lx;
                    if (leftAlign) {
                        lx = dx + 2;
                    } else {
                        FontMetrics fm = g2d.getFontMetrics();
                        lx = dx + (w - fm.stringWidth(ln)) / 2;
                    }
                    g2d.drawString(ln, lx, y + 10 + line * LINE_SPACING);
                }
            }

            dx += w;
        }

        // 行边框
        g2d.setColor(new Color(180, 180, 180));
        g2d.setStroke(new BasicStroke(0.3f));
        g2d.draw(new Rectangle2D.Float(x, y, tableWidth, rowH));
        g2d.setColor(Color.BLACK);

        // 列分隔线
        float vx = x;
        for (int i = 0; i < COL_WIDTHS.length - 1; i++) {
            vx += COL_WIDTHS[i];
            g2d.setColor(new Color(180, 180, 180));
            g2d.drawLine((int) vx, (int) y, (int) vx, (int) (y + rowH));
        }
        g2d.setColor(Color.BLACK);
    }

    // ══════════════════════════════════════════════════════════
    //  备注区（4 行固定）
    // ══════════════════════════════════════════════════════════

    private void drawRemarkArea(Graphics2D g2d, float x, float y, float tableWidth, float areaHeight) {
        int lineCount = 4;
        float lineH = areaHeight / lineCount;

        // "备注" 标签（跨 4 行）
        g2d.setFont(getFont(7f));
        g2d.setColor(Color.BLACK);
        FontMetrics fm = g2d.getFontMetrics();
        float labelW = COL_WIDTHS[0]; // 用第一列宽度作为备注标签宽度
        float labelY = y + (areaHeight - fm.getHeight()) / 2 + fm.getAscent();
        g2d.drawString("备注", x + (labelW - fm.stringWidth("备注")) / 2, labelY);

        // 标签右边框
        g2d.setColor(new Color(180, 180, 180));
        g2d.setStroke(new BasicStroke(0.3f));
        g2d.drawLine((int) (x + labelW), (int) y, (int) (x + labelW), (int) (y + areaHeight));

        // 外边框
        g2d.setColor(new Color(180, 180, 180));
        g2d.setStroke(new BasicStroke(0.5f));
        g2d.draw(new Rectangle2D.Float(x, y, tableWidth, areaHeight));

        // 行分隔线
        g2d.setStroke(new BasicStroke(0.3f));
        for (int i = 1; i < lineCount; i++) {
            float ly = y + i * lineH;
            g2d.drawLine((int) x, (int) ly, (int) (x + tableWidth), (int) ly);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  文本处理
    // ══════════════════════════════════════════════════════════

    /** 计算一行数据中所有列的最大换行行数（用于动态行高） */
    private int calcMaxLines(Map<String, Object> row, FontMetrics fm) {
        String[] keys = {
            "timeText", "medName", "medAmount", "medRoute",
            "enteralName", "enteralAmount", "enteralRoute",
            "urine", "ultrafiltration",
            "outputName", "outputAmount", "drainName", "drainAmount",
            "examination", "treatment", "basicCare", "healthEducation",
            "nursingRecord", "signature"
        };
        int maxLines = 1;
        for (int i = 0; i < COL_WIDTHS.length; i++) {
            String text = mapStr(row, keys[i]);
            if (!text.isEmpty()) {
                List<String> lines = wrapTextByWidth(text, COL_WIDTHS[i] - 3, fm);
                maxLines = Math.max(maxLines, lines.size());
            }
        }
        return maxLines;
    }

    /** 按像素宽度自动换行 */
    private List<String> wrapTextByWidth(String text, float maxWidth, FontMetrics fm) {
        List<String> lines = new ArrayList<>();
        if (text == null || text.isEmpty() || maxWidth <= 0) { lines.add(""); return lines; }

        int avgCharW = fm.charWidth('中');
        if (avgCharW <= 0) avgCharW = (int)(fm.getFont().getSize() * 0.7);
        int maxChars = Math.max(1, (int)(maxWidth / avgCharW));

        int start = 0;
        while (start < text.length()) {
            int end = Math.min(start + maxChars, text.length());
            lines.add(text.substring(start, end));
            start = end;
        }
        return lines;
    }

    // ══════════════════════════════════════════════════════════
    //  分页
    // ══════════════════════════════════════════════════════════

    /** 按动态行高分页（需要 Graphics2D 获取准确的 FontMetrics） */
    private List<PageRows> paginateData(NursingDayData dayData, FontMetrics fm) {
        List<Map<String, Object>> allRows = convertToRows(dayData);
        log.info("分页计算: 总行数={}", allRows.size());
        List<PageRows> pages = new ArrayList<>();
        List<Map<String, Object>> current = new ArrayList<>();
        float usedH = 0;

        // 可用高度 = 页面高度 - 上边距 - 标题区(50) - 表头(28) - 备注区(55) - 下边距(20)
        float maxH = PAGE_HEIGHT - MARGIN - 50 - 2 * HEADER_ROW_HEIGHT - 55 - MARGIN;

        for (Map<String, Object> row : allRows) {
            int rowLines = calcMaxLines(row, fm);
            float rowH = Math.max(DATA_ROW_HEIGHT, (float) Math.ceil(rowLines * LINE_SPACING));

            if (usedH + rowH > maxH && !current.isEmpty()) {
                pages.add(new PageRows(current));
                current = new ArrayList<>();
                usedH = 0;
            }
            current.add(row);
            usedH += rowH;
        }
        if (!current.isEmpty()) pages.add(new PageRows(current));
        if (pages.isEmpty()) pages.add(new PageRows(Collections.emptyList()));
        log.info("分页完成: 页数={}, 每页行数={}", pages.size(),
            pages.stream().mapToInt(p -> p.rows.size()).toArray());
        return pages;
    }

    // ══════════════════════════════════════════════════════════
    //  数据加载
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

        // 字段别名处理（与前端 toPatientContext 对齐）
        // bedNo: 优先 hisBed，其次 bedNo，最后 bedCode
        if (isEmpty(p, "bedNo")) {
            String bedNo = getFirstNonEmpty(p, "hisBed", "bedCode");
            if (!bedNo.isEmpty()) p.put("bedNo", bedNo);
        }
        // name: 优先 name，其次 patientName
        if (isEmpty(p, "name")) {
            String name = getFirstNonEmpty(p, "patientName");
            if (!name.isEmpty()) p.put("name", name);
        }
        // mrn: 优先 mrn，其次 hospitalNo
        if (isEmpty(p, "mrn")) {
            String mrn = getFirstNonEmpty(p, "hospitalNo");
            if (!mrn.isEmpty()) p.put("mrn", mrn);
        }
        // sex: 性别文本转换
        String rawSex = str(p, "sex");
        if (rawSex.isEmpty()) rawSex = str(p, "gender");
        p.put("sex", convertGenderText(rawSex));
        // diagnosis: 截断到第一个分号
        String diagnosis = str(p, "diagnosis");
        if (diagnosis.isEmpty()) diagnosis = str(p, "clinicalDiagnosis");
        p.put("diagnosis", truncateDiagnosis(diagnosis));

        log.info("患者信息: pid={}, name={}, bedNo={}, mrn={}, sex={}, age={}, diagnosis={}",
            pid, str(p, "name"), str(p, "bedNo"), str(p, "mrn"),
            str(p, "sex"), str(p, "age"), str(p, "diagnosis"));
        return p;
    }

    /** 判断文档字段是否为空 */
    private boolean isEmpty(org.bson.Document doc, String key) {
        Object v = doc.get(key);
        return v == null || v.toString().trim().isEmpty();
    }

    /** 获取第一个非空字段值 */
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

    /** 性别文本转换（与前端 genderText 对齐） */
    private String convertGenderText(String gender) {
        if (gender == null) return "";
        String value = gender.trim();
        if ("Male".equalsIgnoreCase(value) || "M".equalsIgnoreCase(value) || "男".equals(value)) return "男";
        if ("Female".equalsIgnoreCase(value) || "F".equalsIgnoreCase(value) || "女".equals(value)) return "女";
        return value;
    }

    /** 诊断文本截断（与前端 formatDiagnosis 对齐，截断到第一个分号） */
    private String truncateDiagnosis(String diagnosis) {
        if (diagnosis == null) return "";
        String value = diagnosis.trim();
        if (value.isEmpty()) return "";
        int idx = -1;
        for (char sep : new char[]{';', '；', ',', '，'}) {
            int cur = value.indexOf(sep);
            if (cur >= 0 && (idx < 0 || cur < idx)) {
                idx = cur;
            }
        }
        return idx >= 0 ? value.substring(0, idx).trim() : value;
    }

    private int getStartPageNo(String pid, String date) {
        return pageIndexRepository.findByPidAndFormType(pid, "hljld2")
            .flatMap(idx -> idx.getDailyPages().stream()
                .filter(d -> d.getDate().equals(date))
                .map(FormPageIndex.DailyPageInfo::getStartPageNo)
                .findFirst())
            .orElse(1);
    }

    // ══════════════════════════════════════════════════════════
    //  数据转换（与前端 hljld2-form 对齐）
    // ══════════════════════════════════════════════════════════

    private List<Map<String, Object>> convertToRows(NursingDayData dayData) {
        List<Map<String, Object>> rows = new ArrayList<>();
        SimpleDateFormat tf = new SimpleDateFormat("HH:mm");
        TreeMap<Date, Map<String, Object>> timeMap = new TreeMap<>();

        log.info("数据转换开始: vitals={}, drugExe={}, nurseRecords={}",
            dayData.getVitals().size(), dayData.getDrugExecutions().size(),
            dayData.getNurseRecords().size());

        // 1. 床旁数据（使用与前端一致的过滤逻辑）
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
                    log.debug("床旁-尿量: time={}, val={}", tf.format(t), val);
                    break;
                case "param_chaoLvLiang":
                    row.put("ultrafiltration", val);
                    log.debug("床旁-净超滤量: time={}, val={}", tf.format(t), val);
                    break;
                case "param_daBianAmount": case "param_造瘘口量": case "param_outuwuliang":
                case "param_咯血": case "param_tanLiang":
                    row.put("outputName", getOutputName(code));
                    row.put("outputAmount", val);
                    log.debug("床旁-排出物: time={}, name={}, val={}", tf.format(t), getOutputName(code), val);
                    break;
                case "param_带入药量": case "param_kouFu": case "param_biSi":
                    String route = "param_带入药量".equals(code) ? "带入" :
                                   "param_kouFu".equals(code) ? "po" : "鼻饲";
                    row.put("enteralName", remark != null ? remark.trim() : "");
                    row.put("enteralAmount", val);
                    row.put("enteralRoute", route);
                    log.debug("床旁-胃肠摄入: time={}, name={}, val={}, route={}", tf.format(t), remark, val, route);
                    break;
                case "param_外出检查":
                    row.put("examination", val);
                    log.debug("床旁-检查: time={}, val={}", tf.format(t), val);
                    break;
                case "param_物理治疗":
                    row.put("treatment", val);
                    log.debug("床旁-治疗: time={}, val={}", tf.format(t), val);
                    break;
                case "param_基础护理1":
                    row.put("basicCare", val);
                    log.debug("床旁-基础护理: time={}, val={}", tf.format(t), val);
                    break;
                case "param_健康教育":
                    row.put("healthEducation", val);
                    log.debug("床旁-健康教育: time={}, val={}", tf.format(t), val);
                    break;
                default:
                    if (isDrainCode(code)) {
                        String drainName = drainDisplayName(code);
                        row.put("drainName", drainName);
                        row.put("drainAmount", val);
                        log.debug("床旁-引流: time={}, name={}, val={}", tf.format(t), drainName, val);
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

            // 签名处理：优先 username/trueName，其次 userId/editUser
            String signature = resolveNurseSignature(r);
            if (!signature.isEmpty()) {
                row.put("signature", signature);
            }
            nurseRendered++;
            log.debug("护理记录: time={}, desc={}, signature={}", tf.format(t), desc.substring(0, Math.min(desc.length(), 50)), signature);
        }
        log.info("护理记录处理完成: 总数={}, 渲染={}", dayData.getNurseRecords().size(), nurseRendered);

        // 3. 药物执行
        int drugRendered = 0;
        for (org.bson.Document d : dayData.getDrugExecutions()) {
            Date t = d.getDate("startTime");
            if (t == null) continue;
            Map<String, Object> row = timeMap.computeIfAbsent(t, k -> new LinkedHashMap<>());
            row.put("timeText", tf.format(t));

            // 解析药物列表
            @SuppressWarnings("unchecked")
            List<org.bson.Document> drugList = (List<org.bson.Document>) d.get("drugList");
            if (drugList != null && !drugList.isEmpty()) {
                StringBuilder drugNames = new StringBuilder();
                for (org.bson.Document drug : drugList) {
                    String name = str(drug, "name");
                    String unit = str(drug, "unit");
                    if (!name.isEmpty()) {
                        if (drugNames.length() > 0) drugNames.append("、");
                        // 与前端对齐：名称(剂量单位)
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

            // 剂量处理：优先取顶层 liquidAmount，其次 drugList 求和
            String medAmount = resolveDrugAmount(d);
            if (!medAmount.isEmpty()) {
                row.put("medAmount", medAmount);
            }

            // 途径处理
            String route = str(d, "route");
            if (!route.isEmpty()) row.put("medRoute", route);

            drugRendered++;
            log.debug("药物执行: time={}, name={}, amount={}, route={}", tf.format(t),
                row.get("medName"), medAmount, route);
        }
        log.info("药物执行处理完成: 总数={}, 渲染={}", dayData.getDrugExecutions().size(), drugRendered);

        rows.addAll(timeMap.values());
        log.info("数据转换完成: 合并后总行数={}", rows.size());
        return rows;
    }

    // ══════════════════════════════════════════════════════════
    //  工具方法
    // ══════════════════════════════════════════════════════════

    /** 判断是否为引流编码（与前端 isDrainCode 对齐） */
    private boolean isDrainCode(String code) {
        if (code == null) return false;
        String normalizedCode = code.trim();
        return LEGACY_DRAIN_CODES.contains(normalizedCode) || normalizedCode.contains("引流");
    }

    /** 判断床旁记录是否可渲染（与前端 isRenderableBedsideRecord 对齐） */
    private boolean isRenderableBedsideRecord(org.bson.Document record) {
        if (record == null) return false;
        String time = str(record, "time");
        String code = str(record, "code");
        if (time.isEmpty() || code.isEmpty()) return false;
        // valid !== false 且 status !== 'invalid'
        Object validObj = record.get("valid");
        if (validObj != null && validObj.equals(false)) return false;
        String status = str(record, "status").toLowerCase();
        if ("invalid".equals(status)) return false;
        // 排除意识记录
        if ("param_Yishi".equals(code)) return false;
        // 必须在白名单或为引流编码
        if (!DISPLAY_BEDSIDE_CODES.contains(code) && !isDrainCode(code)) return false;
        // 必须有值
        String strVal = str(record, "strVal");
        String remark = str(record, "remark");
        return !strVal.trim().isEmpty() || !remark.trim().isEmpty();
    }

    /** 引流编码显示名称（与前端 drainName 对齐） */
    private String drainDisplayName(String code) {
        if (code == null) return "";
        String normalizedCode = code.trim();
        // 兼容历史编码
        if ("param_tube_胃肠减压".equals(normalizedCode)) {
            return "胃管负压引流量";
        }
        String stripped = normalizedCode.replace("param_tube_", "").replace("param_", "");
        if (stripped.endsWith("管")) {
            return stripped.substring(0, stripped.length() - 1) + "液";
        }
        return stripped.replace("管", "液");
    }

    /** 解析药物剂量（与前端 resolveLiquidCap 对齐） */
    private String resolveDrugAmount(org.bson.Document execution) {
        // 优先取顶层 liquidAmount
        Object topAmount = execution.get("liquidAmount");
        if (topAmount != null) {
            String val = topAmount.toString().trim();
            if (!val.isEmpty() && !"0".equals(val)) {
                return val;
            }
        }
        // 回退到 drugList 求和
        @SuppressWarnings("unchecked")
        List<org.bson.Document> drugList = (List<org.bson.Document>) execution.get("drugList");
        if (drugList != null) {
            double total = 0;
            for (org.bson.Document drug : drugList) {
                Object liquidAmount = drug.get("liquidAmount");
                if (liquidAmount != null) {
                    try {
                        total += Double.parseDouble(liquidAmount.toString());
                    } catch (NumberFormatException e) {
                        // 忽略
                    }
                }
            }
            if (total > 0) {
                return String.valueOf(total);
            }
        }
        return "";
    }

    /** 护理记录签名处理（与前端 resolveNurseSignature 对齐） */
    private String resolveNurseSignature(org.bson.Document record) {
        // 优先取 username
        String username = str(record, "username").trim();
        if (!username.isEmpty()) return username;
        // 其次取 trueName
        String trueName = str(record, "trueName").trim();
        if (!trueName.isEmpty()) return trueName;
        // 最后取 userId 或 editUser（需要账户映射，这里简化处理）
        String userId = str(record, "userId").trim();
        if (userId.isEmpty()) userId = str(record, "editUser").trim();
        // TODO: 需要查询账户映射获取真实姓名
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
