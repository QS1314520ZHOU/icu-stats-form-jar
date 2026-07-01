package com.smartcare.backend.controller;


import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

import com.smartcare.backend.entity.ProteinARecord;
import com.smartcare.backend.service.ProteinAService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequestMapping({"/api/v1/icu/protein-a"})
@CrossOrigin(origins = {"*"})
public class ProteinAController {
public ProteinAController(ProteinAService service) {
this.service = service;
}

private final ProteinAService service;

@PostMapping
public ResponseEntity<ProteinARecord> save(@RequestBody ProteinARecord record) {
return ResponseEntity.ok(this.service.save(record));
}

@GetMapping({"/patient/{pid}"})
public ResponseEntity<List<ProteinARecord>> getByPid(@PathVariable String pid) {
return ResponseEntity.ok(this.service.findByPid(pid));
}

@GetMapping({"/{id}"})
public ResponseEntity<ProteinARecord> getById(@PathVariable String id) {
ProteinARecord record = this.service.findById(id);
return (record != null) ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
}

@DeleteMapping({"/{id}"})
public ResponseEntity<Void> delete(@PathVariable String id) {
this.service.deleteById(id);
return ResponseEntity.noContent().build();
}
}

