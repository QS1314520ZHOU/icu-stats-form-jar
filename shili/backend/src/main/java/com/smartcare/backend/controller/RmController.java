package com.smartcare.backend.controller;

import com.smartcare.backend.entity.RmRecord;
import com.smartcare.backend.service.RmService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/rm")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class RmController {
    private final RmService service;

    @PostMapping
    public ResponseEntity<RmRecord> save(@RequestBody RmRecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<RmRecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<RmRecord> getById(@PathVariable String id) {
        RmRecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
