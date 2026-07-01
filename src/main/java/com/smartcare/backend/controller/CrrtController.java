package com.smartcare.backend.controller;


import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

import com.smartcare.backend.entity.CrrtRecord;
import com.smartcare.backend.service.CrrtService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequestMapping({"/api/v1/icu/crrt"})
@CrossOrigin(origins = {"*"})
public class CrrtController {
public CrrtController(CrrtService service) {
this.service = service;
}

private final CrrtService service;

@PostMapping
public ResponseEntity<CrrtRecord> save(@RequestBody CrrtRecord record) {
return ResponseEntity.ok(this.service.save(record));
}

@GetMapping({"/patient/{pid}"})
public ResponseEntity<List<CrrtRecord>> getByPid(@PathVariable String pid) {
return ResponseEntity.ok(this.service.findByPid(pid));
}

@GetMapping({"/{id}"})
public ResponseEntity<CrrtRecord> getById(@PathVariable String id) {
CrrtRecord record = this.service.findById(id);
return (record != null) ? ResponseEntity.ok(record) : ResponseEntity.notFound().build();
}

@DeleteMapping({"/{id}"})
public ResponseEntity<Void> delete(@PathVariable String id) {
this.service.deleteById(id);
return ResponseEntity.noContent().build();
}
}

