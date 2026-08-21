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
            @RequestParam(required = false) String codes) {
        List<String> codeList = (codes == null || codes.isEmpty())
                ? List.of()
                : Arrays.asList(codes.split(","));
        return ResponseEntity.ok(this.service.findValidByPidAndCodes(pid, codeList));
    }

    /**
     * 按 pid + 时间范围查询有效 bedside 记录。
     * 专用接口：一键打印全部时使用，减少不必要的全量数据传输。
     */
    @GetMapping("/listByPidAndTimeRange")
    public ResponseEntity<List<Bedside>> listByPidAndTimeRange(
            @RequestParam String pid,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        return ResponseEntity.ok(this.service.findValidByPidAndTimeRange(pid, startTime, endTime));
    }
}
