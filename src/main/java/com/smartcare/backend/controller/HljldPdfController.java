package com.smartcare.backend.controller;

import com.smartcare.backend.service.HljldPageIndexService;
import com.smartcare.backend.service.HljldPdfService;
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

    private final HljldPdfService pdfService;
    private final HljldPageIndexService pageIndexService;

    @Autowired
    public HljldPdfController(HljldPdfService pdfService, HljldPageIndexService pageIndexService) {
        this.pdfService = pdfService;
        this.pageIndexService = pageIndexService;
    }

    /**
     * 获取指定日期的 PDF
     */
    @GetMapping("/pdf/{pid}/{date}")
    public ResponseEntity<byte[]> getPdf(@PathVariable String pid, @PathVariable String date) {
        try {
            byte[] pdfData = pdfService.generateDailyPdf(pid, date);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            // inline 让浏览器直接预览，不触发下载
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);

            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 获取全部记录的 PDF
     */
    @GetMapping("/pdf-all/{pid}")
    public ResponseEntity<byte[]> getAllPdfs(@PathVariable String pid) {
        try {
            byte[] pdfData = pdfService.generateAllPagesPdf(pid);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);

            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 获取页码信息
     */
    @GetMapping("/page-index/{pid}")
    public ResponseEntity<Map<String, Object>> getPageIndex(
            @PathVariable String pid,
            @RequestParam String date) {
        try {
            HljldPageIndexService.PageIndexResult result = pageIndexService.getPageInfo(pid, date);

            Map<String, Object> response = new HashMap<>();
            response.put("startPageNo", result.getStartPageNo());
            response.put("pageCount", result.getPageCount());
            response.put("status", result.getStatus());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 重新计算页码
     */
    @PostMapping("/recalculate/{pid}")
    public ResponseEntity<Map<String, String>> recalculatePageIndexes(@PathVariable String pid) {
        try {
            pageIndexService.recalculatePageIndexes(pid);

            Map<String, String> response = new HashMap<>();
            response.put("status", "started");
            response.put("message", "页码重新计算已开始，请稍后刷新查看结果");

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
    public ResponseEntity<Map<String, Object>> getRecalculateStatus(@PathVariable String pid) {
        try {
            Map<String, Object> response = pageIndexService.getCalculationStatus(pid);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
