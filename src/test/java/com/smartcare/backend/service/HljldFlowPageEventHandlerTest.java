package com.smartcare.backend.service;

import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.UnitValue;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldFlowPageEventHandler 的单元测试。
 */
class HljldFlowPageEventHandlerTest {

    /**
     * 查找系统中可用的中文字体
     */
    private String findChineseFontPath() {
        String[] fontPaths = {
            "C:/Windows/Fonts/simsun.ttc",
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/simhei.ttf"
        };

        for (String path : fontPaths) {
            File fontFile = new File(path);
            if (fontFile.exists()) {
                return path;
            }
        }

        throw new RuntimeException("未找到可用的中文字体文件");
    }

    /**
     * 创建测试用的 PdfFont 实例
     */
    private PdfFont createTestFont() throws Exception {
        String fontPath = findChineseFontPath();
        if (fontPath.endsWith(".ttc")) {
            return PdfFontFactory.createFont(fontPath + ",0", PdfEncodings.IDENTITY_H);
        } else {
            return PdfFontFactory.createFont(fontPath, PdfEncodings.IDENTITY_H);
        }
    }

    /**
     * 测试页事件处理器创建
     */
    @Test
    void testEventHandlerCreation() throws Exception {
        PdfFont font = createTestFont();
        String patientInfo = "床号：001  姓名：张三  住院号：123456";
        float margin = 10f;

        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(font, patientInfo, margin);
        assertNotNull(handler, "事件处理器不应为 null");
    }

    /**
     * 测试页事件处理器与 PDF 文档集成
     */
    @Test
    void testEventHandlerIntegration() throws Exception {
        PdfFont font = createTestFont();
        String patientInfo = "床号：001  姓名：张三  住院号：123456";
        float margin = 10f;

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(margin, margin, margin, margin);

        // 注册页事件处理器
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(font, patientInfo, margin);
        pdfDoc.addEventHandler(com.itextpdf.kernel.events.PdfDocumentEvent.END_PAGE, handler);

        // 创建简单表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));

        // 添加数据行
        for (int i = 1; i <= 5; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertEquals(1, testDoc.getNumberOfPages());
        testDoc.close();
    }

    /**
     * 测试多页场景
     */
    @Test
    void testMultiPageScenario() throws Exception {
        PdfFont font = createTestFont();
        String patientInfo = "床号：002  姓名：李四  住院号：789012";
        float margin = 10f;

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument pdfDoc = new PdfDocument(writer);
        Document doc = new Document(pdfDoc, PageSize.A4.rotate());
        doc.setMargins(margin, margin, margin, margin);

        // 注册页事件处理器
        HljldFlowPageEventHandler handler = new HljldFlowPageEventHandler(font, patientInfo, margin);
        pdfDoc.addEventHandler(com.itextpdf.kernel.events.PdfDocumentEvent.END_PAGE, handler);

        // 创建表格
        Table table = new Table(UnitValue.createPointArray(new float[]{100f, 200f}));
        table.setWidth(UnitValue.createPointValue(300f));
        table.setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.5f));
        table.setKeepTogether(false);

        // 添加 50 行数据（跨页）
        for (int i = 1; i <= 50; i++) {
            Cell cell1 = new Cell(1, 1)
                .add(new Paragraph("行" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell1);

            Cell cell2 = new Cell(1, 1)
                .add(new Paragraph("数据" + i).setFont(font).setFontSize(7f))
                .setMinHeight(18f)
                .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.BLACK, 0.3f));
            table.addCell(cell2);
        }

        doc.add(table);
        doc.close();

        // 验证 PDF 生成成功
        byte[] pdfBytes = baos.toByteArray();
        assertTrue(pdfBytes.length > 0, "PDF 文件不应为空");

        // 验证 PDF 可以读取且有多页
        PdfDocument testDoc = new PdfDocument(new PdfReader(new ByteArrayInputStream(pdfBytes)));
        assertTrue(testDoc.getNumberOfPages() >= 2, "50 行数据应生成至少 2 页");
        testDoc.close();
    }
}
