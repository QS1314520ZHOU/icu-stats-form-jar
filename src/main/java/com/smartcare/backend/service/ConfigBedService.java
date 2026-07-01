package com.smartcare.backend.service;

import com.smartcare.backend.entity.config.ConfigBed;
import com.smartcare.backend.repository.ConfigBedRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ConfigBedService {
public ConfigBedService(ConfigBedRepository repository) {
this.repository = repository;
}

public List<ConfigBed> findAll() {
return this.repository.findAll();
}

private final ConfigBedRepository repository;
}

