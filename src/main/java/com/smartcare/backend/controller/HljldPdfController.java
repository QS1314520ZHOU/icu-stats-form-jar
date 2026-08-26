package com.smartcare.backend.controller;

import com.smartcare.backend.service.FormPageIndexService;
import com.smartcare.backend.service.HljldFlowPdfService;
import com.smartcare.backend.service.HljldPdfService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * ICU 护理记录单 PDF 控制器
 */
@RestController
@RequestMapping("/api/v1/icu/hljld")
public class HljldPdfController {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfController.class);

    private final HljldPdfService pdfService;
    private final HljldFlowPdfService flowPdfService;
    private final FormPageIndexService pageIndexService;

    @Autowired
    public HljldPdfController(HljldPdfService pdfService, HljldFlowPdfService flowPdfService,
                              FormPageIndexService pageIndexService) {
        this.pdfService = pdfService;
        this.flowPdfService = flowPdfService;
        this.pageIndexService = pageIndexService;
    }

    @GetMapping("/pdf/{pid}/{date}")
    public ResponseEntity<byte[]> getPdf(
            @PathVariable String pid,
            @PathVariable String date,
            @RequestParam(defaultValue = "legacy") String layout) {
        try {
            byte[] pdfData;
            if ("flow".equals(layout)) {
                pdfData = flowPdfService.generateDailyPdf(pid, date);
            } else {
                pdfData = pdfService.generateDailyPdf(pid, date);
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);
            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("生成PDF失败: pid={}, date={}, layout={}", pid, date, layout, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/pdf-all/{pid}")
    public ResponseEntity<byte[]> getAllPdfs(
            @PathVariable String pid,
            @RequestParam(defaultValue = "legacy") String layout) {
        try {
            byte[] pdfData;
            if ("flow".equals(layout)) {
                pdfData = flowPdfService.generateAllPagesPdf(pid);
            } else {
                pdfData = pdfService.generateAllPagesPdf(pid);
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);
            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("生成全部PDF失败: pid={}, layout={}", pid, layout, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 获取页码信息（通用：formType=hljld2 表示护理记录单独立版）
     * layout=flow 时使用 hljld2-flow formType
     */
    @GetMapping("/page-index/{pid}")
    public ResponseEntity<Map<String, Object>> getPageIndex(
            @PathVariable String pid,
            @RequestParam String date,
            @RequestParam(defaultValue = "hljld2") String formType,
            @RequestParam(required = false) String layout) {
        try {
            String actualFormType = "flow".equals(layout) ? "hljld2-flow" : formType;
            FormPageIndexService.PageIndexResult result = pageIndexService.getPageInfo(pid, actualFormType, date);
            Map<String, Object> response = new HashMap<>();
            response.put("startPageNo", result.getStartPageNo());
            response.put("pageCount", result.getPageCount());
            response.put("status", result.getStatus());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("获取页码信息失败: pid={}, date={}, formType={}", pid, date, formType, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 重新计算页码
     * layout=flow 时使用 hljld2-flow formType
     */
    @PostMapping("/recalculate/{pid}")
    public ResponseEntity<Map<String, String>> recalculatePageIndexes(
            @PathVariable String pid,
            @RequestParam(defaultValue = "hljld2") String formType,
            @RequestParam(required = false) String layout) {
        try {
            String actualFormType = "flow".equals(layout) ? "hljld2-flow" : formType;
            pageIndexService.recalculatePageIndexes(pid, actualFormType);
            Map<String, String> response = new HashMap<>();
            response.put("status", "started");
            response.put("message", "页码重新计算已开始");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> response = new HashMap<>();
            response.put("status", "error");
            response.put("message", "启动页码计算失败: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    /**
     * 查询页码计算状态
     */
    @GetMapping("/recalculate-status/{pid}")
    public ResponseEntity<Map<String, Object>> getRecalculateStatus(
            @PathVariable String pid,
            @RequestParam(defaultValue = "hljld2") String formType) {
        Map<String, Object> response = pageIndexService.getCalculationStatus(pid, formType);
        return ResponseEntity.ok(response);
    }
}