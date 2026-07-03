package com.smartcare.backend.controller;

import com.smartcare.backend.entity.PiccoRecord;
import com.smartcare.backend.service.PiccoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/picco")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class PiccoController {
    private final PiccoService service;

    @PostMapping
    public ResponseEntity<PiccoRecord> save(@RequestBody PiccoRecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<PiccoRecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PiccoRecord> getById(@PathVariable String id) {
        PiccoRecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
