package com.smartcare.backend.controller;

import java.util.List;

import com.smartcare.backend.entity.department.Department;
import com.smartcare.backend.service.DepartmentService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/departments"})
@CrossOrigin(origins = {"*"})
public class DepartmentController {
public DepartmentController(DepartmentService service) {
this.service = service;
}

private final DepartmentService service;

@GetMapping
public ResponseEntity<List<Department>> listAll() {
return ResponseEntity.ok(this.service.findAll());
}
}

