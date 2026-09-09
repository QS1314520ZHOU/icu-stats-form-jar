package com.smartcare.backend.controller;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import com.smartcare.backend.service.IcuFormViewerService;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/icu/form-viewer")
@CrossOrigin(origins = {"*"})
public class IcuFormViewerController {

    private static final long MAX_RANGE_DAYS = 366;

    private final IcuFormViewerService viewerService;

    public IcuFormViewerController(IcuFormViewerService viewerService) {
        this.viewerService = viewerService;
    }

    @GetMapping("/availability")
    public ResponseEntity<?> checkAvailability(
            @RequestParam String pid,
            @RequestParam String formKey,
            @RequestParam String startTime,
            @RequestParam String endTime) {

        // 参数校验
        String pidTrimmed = pid != null ? pid.trim() : "";
        if (pidTrimmed.isEmpty()) {
            return ResponseEntity.badRequest().body("pid 不能为空");
        }

        if (!viewerService.isAllowedFormKey(formKey)) {
            return ResponseEntity.badRequest().body("不支持的表单类型: " + formKey);
        }

        Instant startInstant;
        Instant endInstant;
        try {
            startInstant = Instant.parse(startTime);
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest().body("startTime 格式无效，需要 ISO-8601 格式");
        }
        try {
            endInstant = Instant.parse(endTime);
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest().body("endTime 格式无效，需要 ISO-8601 格式");
        }

        if (startInstant.isAfter(endInstant)) {
            return ResponseEntity.badRequest().body("startTime 不能晚于 endTime");
        }

        // 检查时间跨度上限
        long rangeSeconds = endInstant.getEpochSecond() - startInstant.getEpochSecond();
        if (rangeSeconds > MAX_RANGE_DAYS * 24 * 3600) {
            return ResponseEntity.badRequest().body("时间范围不能超过 " + MAX_RANGE_DAYS + " 天");
        }

        IcuFormAvailabilityResponse response = viewerService.checkAvailability(
                pidTrimmed, formKey, startInstant, endInstant);

        if (response.getStatus() == com.smartcare.backend.dto.IcuFormAvailabilityStatus.ERROR) {
            return ResponseEntity.internalServerError().body(response);
        }

        return ResponseEntity.ok(response);
    }
}
