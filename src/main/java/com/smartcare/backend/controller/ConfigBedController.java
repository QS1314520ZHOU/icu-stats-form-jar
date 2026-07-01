package com.smartcare.backend.controller;

import java.util.List;

import com.smartcare.backend.entity.config.ConfigBed;
import com.smartcare.backend.service.ConfigBedService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/config-beds"})
@CrossOrigin(origins = {"*"})
public class ConfigBedController {
public ConfigBedController(ConfigBedService service) {
this.service = service;
}

private final ConfigBedService service;

@GetMapping
public ResponseEntity<List<ConfigBed>> listAll() {
return ResponseEntity.ok(this.service.findAll());
}
}

