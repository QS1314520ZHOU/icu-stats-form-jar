package com.smartcare.backend.controller;

import com.smartcare.backend.entity.ProteinARecord;
import com.smartcare.backend.service.ProteinAService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/protein-a")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ProteinAController {
    private final ProteinAService service;

    @PostMapping
    public ResponseEntity<ProteinARecord> save(@RequestBody ProteinARecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<ProteinARecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProteinARecord> getById(@PathVariable String id) {
        ProteinARecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
