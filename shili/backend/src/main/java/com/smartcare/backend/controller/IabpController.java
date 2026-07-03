package com.smartcare.backend.controller;

import com.smartcare.backend.entity.IabpRecord;
import com.smartcare.backend.service.IabpService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/iabp")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class IabpController {
    private final IabpService service;

    @PostMapping
    public ResponseEntity<IabpRecord> save(@RequestBody IabpRecord record) {
        return ResponseEntity.ok(service.save(record));
    }

    @GetMapping("/patient/{pid}")
    public ResponseEntity<List<IabpRecord>> getByPid(@PathVariable String pid) {
        return ResponseEntity.ok(service.findByPid(pid));
    }

    @GetMapping("/{id}")
    public ResponseEntity<IabpRecord> getById(@PathVariable String id) {
        IabpRecord record = service.findById(id);
        return record != null ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
