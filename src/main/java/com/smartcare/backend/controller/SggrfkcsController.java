package com.smartcare.backend.controller;

import com.smartcare.backend.entity.SggrfkcsRecord;
import com.smartcare.backend.service.SggrfkcsRecordService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/sggrfkcs")
@CrossOrigin(origins = "*")
public class SggrfkcsController {
    private final SggrfkcsRecordService service;

    public SggrfkcsController(SggrfkcsRecordService service) {
        this.service = service;
    }

    @GetMapping("/listByPid")
    public ResponseEntity<List<SggrfkcsRecord>> listByPid(@RequestParam String pid) {
        return ResponseEntity.ok(service.listValid(pid));
    }

    @PostMapping("/save")
    public ResponseEntity<SggrfkcsRecord> save(@RequestBody SggrfkcsRecord body) {
        return ResponseEntity.ok(service.save(body));
    }

    @PatchMapping("/{id}/invalidate")
    public ResponseEntity<Void> invalidate(@PathVariable String id,
                                            @RequestParam(required = false) String operatorId) {
        service.invalidate(id, operatorId);
        return ResponseEntity.noContent().build();
    }
}
