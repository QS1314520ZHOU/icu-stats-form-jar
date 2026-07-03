package com.smartcare.backend.service;

import com.smartcare.backend.entity.config.ConfigBed;
import com.smartcare.backend.repository.ConfigBedRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ConfigBedService {
    private final ConfigBedRepository repository;

    public List<ConfigBed> findAll() {
        return repository.findAll();
    }
}
