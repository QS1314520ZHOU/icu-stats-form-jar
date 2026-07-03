package com.smartcare.backend.controller;

import com.smartcare.backend.entity.HpRecord;
import com.smartcare.backend.service.HpService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/hp")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class HpController {
    private final HpService service;

    @PostMapping
    public ResponseEntity<HpRecord> save(@RequestBody HpRecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<HpRecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<HpRecord> getById(@PathVariable String id) {
        HpRecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
