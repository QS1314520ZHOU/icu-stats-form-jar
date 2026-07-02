package com.smartcare.backend.controller;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/config"})
@CrossOrigin(origins = {"*"})
public class HospitalConfigController {

    @Value("${hospitalLog:}")
    private String hospitalName;

    @GetMapping({"/hospital"})
    public ResponseEntity<Map<String, String>> getHospitalName() {
        return ResponseEntity.ok(Map.of("hospitalName", hospitalName != null ? hospitalName : ""));
    }
}
