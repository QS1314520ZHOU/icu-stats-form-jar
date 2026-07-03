package com.smartcare.backend.controller;

import com.smartcare.backend.entity.CvcRecord;
import com.smartcare.backend.service.CvcService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/cvc")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CvcController {
    private final CvcService service;

    @PostMapping
    public ResponseEntity<CvcRecord> save(@RequestBody CvcRecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<CvcRecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CvcRecord> getById(@PathVariable String id) {
        CvcRecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
