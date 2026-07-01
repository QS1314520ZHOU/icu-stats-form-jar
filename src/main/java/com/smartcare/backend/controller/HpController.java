package com.smartcare.backend.controller;


import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

import com.smartcare.backend.entity.HpRecord;
import com.smartcare.backend.service.HpService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequestMapping({"/api/v1/icu/hp"})
@CrossOrigin(origins = {"*"})
public class HpController {
public HpController(HpService service) {
this.service = service;
}

private final HpService service;

@PostMapping
public ResponseEntity<HpRecord> save(@RequestBody HpRecord record) {
return ResponseEntity.ok(this.service.save(record));
}

@GetMapping({"/patient/{pid}"})
public ResponseEntity<List<HpRecord>> getByPid(@PathVariable String pid) {
return ResponseEntity.ok(this.service.findByPid(pid));
}

@GetMapping({"/{id}"})
public ResponseEntity<HpRecord> getById(@PathVariable String id) {
HpRecord record = this.service.findById(id);
return (record != null) ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
}

@DeleteMapping({"/{id}"})
public ResponseEntity<Void> delete(@PathVariable String id) {
this.service.deleteById(id);
return ResponseEntity.noContent().build();
}
}

