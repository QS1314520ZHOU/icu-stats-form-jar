package com.smartcare.backend.controller;

import com.smartcare.backend.entity.HealthEducationRecord;
import com.smartcare.backend.service.HealthEducationRecordService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/health-education")
@CrossOrigin(origins = "*")
public class HealthEducationRecordController {
    private final HealthEducationRecordService service;

    public HealthEducationRecordController(HealthEducationRecordService service) {
        this.service = service;
    }

    @GetMapping("/listByPid")
    public ResponseEntity<List<HealthEducationRecord>> listByPid(@RequestParam String pid) {
        return ResponseEntity.ok(service.listValid(pid));
    }

    @PostMapping("/save")
    public ResponseEntity<HealthEducationRecord> save(@RequestBody HealthEducationRecord body) {
        return ResponseEntity.ok(service.save(body));
    }

    @PatchMapping("/{id}/invalidate")
    public ResponseEntity<Void> invalidate(@PathVariable String id,
                                            @RequestParam(required = false) String operatorId) {
        service.invalidate(id, operatorId);
        return ResponseEntity.noContent().build();
    }
}
