package com.smartcare.backend.controller;

import com.smartcare.backend.entity.config.ConfigBed;
import com.smartcare.backend.service.ConfigBedService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/config-beds")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ConfigBedController {
    private final ConfigBedService service;

    @GetMapping
    public ResponseEntity<List<ConfigBed>> listAll() {
        return ResponseEntity.ok(service.findAll());
    }
}
