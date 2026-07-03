package com.smartcare.backend.controller;

import com.smartcare.backend.entity.department.Department;
import com.smartcare.backend.service.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/icu/departments")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DepartmentController {
    private final DepartmentService service;

    @GetMapping
    public ResponseEntity<List<Department>> listAll() {
        return ResponseEntity.ok(service.findAll());
    }
}

