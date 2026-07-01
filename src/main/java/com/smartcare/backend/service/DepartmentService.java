package com.smartcare.backend.service;

import com.smartcare.backend.entity.department.Department;
import com.smartcare.backend.repository.DepartmentRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class DepartmentService {
public DepartmentService(DepartmentRepository repository) {
this.repository = repository;
}

public List<Department> findAll() {
return this.repository.findAll();
}

private final DepartmentRepository repository;
}

