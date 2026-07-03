package com.smartcare.backend.controller;

import com.smartcare.backend.entity.PeRecord;
import com.smartcare.backend.service.PeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/pe")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class PeController {
    private final PeService service;

    @PostMapping
    public ResponseEntity<PeRecord> save(@RequestBody PeRecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<PeRecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PeRecord> getById(@PathVariable String id) {
        PeRecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
