package com.smartcare.backend.controller;

import com.smartcare.backend.service.FormPageIndexService;
import com.smartcare.backend.service.HljldFlowPdfService;
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

    private final HljldFlowPdfService flowPdfService;
    private final FormPageIndexService pageIndexService;

    @Autowired
    public HljldPdfController(HljldFlowPdfService flowPdfService,
                              FormPageIndexService pageIndexService) {
        this.flowPdfService = flowPdfService;
        this.pageIndexService = pageIndexService;
    }

    @GetMapping("/pdf/{pid}/{date}")
    public ResponseEntity<byte[]> getPdf(
            @PathVariable String pid,
            @PathVariable String date,
            @RequestParam(required = false) String referenceTime) {
        try {
            byte[] pdfData = flowPdfService.generateDailyPdf(pid, date, referenceTime);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);
            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("生成PDF失败: pid={}, date={}, referenceTime={}", pid, date, referenceTime, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/pdf-all/{pid}")
    public ResponseEntity<byte[]> getAllPdfs(
            @PathVariable String pid,
            @RequestParam(required = false) String referenceTime) {
        try {
            byte[] pdfData = flowPdfService.generateAllPagesPdf(pid, referenceTime);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);
            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("生成全部PDF失败: pid={}, referenceTime={}", pid, referenceTime, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 获取页码信息（formType=hljld2-flow 表示护理记录单流式版）
     */
    @GetMapping("/page-index/{pid}")
    public ResponseEntity<Map<String, Object>> getPageIndex(
            @PathVariable String pid,
            @RequestParam String date,
            @RequestParam(required = false) String referenceTime) {
        try {
            FormPageIndexService.PageIndexResult result = pageIndexService.getPageInfo(pid, "hljld2-flow", date, referenceTime);
            Map<String, Object> response = new HashMap<>();
            response.put("startPageNo", result.getStartPageNo());
            response.put("pageCount", result.getPageCount());
            response.put("status", result.getStatus());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("获取页码信息失败: pid={}, date={}, referenceTime={}", pid, date, referenceTime, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 重新计算页码
     */
    @PostMapping("/recalculate/{pid}")
    public ResponseEntity<Map<String, String>> recalculatePageIndexes(
            @PathVariable String pid) {
        try {
            pageIndexService.recalculatePageIndexes(pid, "hljld2-flow");
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
            @PathVariable String pid) {
        Map<String, Object> response = pageIndexService.getCalculationStatus(pid, "hljld2-flow");
        return ResponseEntity.ok(response);
    }
}
