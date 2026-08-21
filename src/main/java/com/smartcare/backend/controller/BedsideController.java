package com.smartcare.backend.controller;

import com.smartcare.backend.entity.Bedside;
import com.smartcare.backend.service.BedsideService;
import java.util.Arrays;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/bedside"})
@CrossOrigin(origins = {"*"})
public class BedsideController {
    private final BedsideService service;

    public BedsideController(BedsideService service) {
        this.service = service;
    }

    @GetMapping("/listByPid")
    public ResponseEntity<List<Bedside>> listByPid(
            @RequestParam String pid,
            @RequestParam(required = false) String codes,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        // 支持时间范围过滤：用于一键打印全部，减少不必要的全量数据传输
        if (startTime != null && endTime != null) {
            return ResponseEntity.ok(this.service.findValidByPidAndTimeRange(pid, startTime, endTime));
        }
        List<String> codeList = (codes == null || codes.isEmpty())
                ? List.of()
                : Arrays.asList(codes.split(","));
        return ResponseEntity.ok(this.service.findValidByPidAndCodes(pid, codeList));
    }
}
