package com.smartcare.backend.service;

import com.smartcare.backend.entity.department.Department;
import com.smartcare.backend.repository.DepartmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DepartmentService {
    private final DepartmentRepository repository;

    public List<Department> findAll() {
        return repository.findAll();
    }
}

