package com.smartcare.backend.controller;

import com.smartcare.backend.entity.CrrtRecord;
import com.smartcare.backend.service.CrrtService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/crrt")
@RequiredArgsConstructor
@CrossOrigin(origins = "*") // 允许前端跨域访问
public class CrrtController {
    private final CrrtService service;

    @PostMapping
    public ResponseEntity<CrrtRecord> save(@RequestBody CrrtRecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<CrrtRecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CrrtRecord> getById(@PathVariable String id) {
        CrrtRecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
