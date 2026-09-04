package com.smartcare.backend.controller;

import com.smartcare.backend.hljld.HljldPdfRenderPurpose;
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

    /**
     * 获取指定日期的 PDF（默认 PREVIEW，可通过 purpose 参数切换）。
     *
     * @param pid           患者ID
     * @param date          护理日日期 yyyy-MM-dd
     * @param referenceTime 参考时间（可选）
     * @param purpose       渲染目的（可选：PREVIEW / PRINT_DAY / PRINT_ALL / PRINT_RANGE）
     */
    @GetMapping("/pdf/{pid}/{date}")
    public ResponseEntity<byte[]> getPdf(
            @PathVariable String pid,
            @PathVariable String date,
            @RequestParam(required = false) String referenceTime,
            @RequestParam(required = false, defaultValue = "PREVIEW") String purpose) {
        // 单日端点只允许 PREVIEW / PRINT_DAY
        HljldPdfRenderPurpose renderPurpose;
        try {
            renderPurpose = HljldPdfRenderPurpose.valueOf(purpose.toUpperCase());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                .contentType(MediaType.TEXT_PLAIN)
                .body(("无效的 purpose 参数: " + purpose + "，仅支持 PREVIEW / PRINT_DAY")
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        if (renderPurpose != HljldPdfRenderPurpose.PREVIEW
            && renderPurpose != HljldPdfRenderPurpose.PRINT_DAY) {
            return ResponseEntity.badRequest()
                .contentType(MediaType.TEXT_PLAIN)
                .body(("单日端点仅支持 PREVIEW / PRINT_DAY，当前: " + purpose)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }

        try {
            byte[] pdfData = flowPdfService.generateDailyPdf(pid, date, referenceTime, renderPurpose);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);
            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("生成PDF失败: pid={}, date={}, referenceTime={}, purpose={}", pid, date, referenceTime, purpose, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 获取全部记录的 PDF（内部固定使用 PRINT_ALL）。
     */
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
     * 获取时间范围的 PDF（内部固定使用 PRINT_RANGE）。
     *
     * @param pid           患者ID
     * @param startDate     范围开始护理日 yyyy-MM-dd
     * @param endDate       范围结束护理日 yyyy-MM-dd
     * @param referenceTime 参考时间（可选）
     */
    @GetMapping("/pdf-range/{pid}")
    public ResponseEntity<byte[]> getRangePdf(
            @PathVariable String pid,
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String referenceTime) {
        // 参数校验
        String validationError = flowPdfService.validateRangeParams(pid, startDate, endDate, referenceTime);
        if (validationError != null) {
            log.warn("范围打印参数校验失败: {}", validationError);
            return ResponseEntity.badRequest()
                .contentType(MediaType.TEXT_PLAIN)
                .body(validationError.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }

        try {
            byte[] pdfData = flowPdfService.generateRangePdf(pid, startDate, endDate, referenceTime);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
            headers.setContentLength(pdfData.length);
            return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("生成范围PDF失败: pid={}, startDate={}, endDate={}, referenceTime={}",
                pid, startDate, endDate, referenceTime, e);
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
