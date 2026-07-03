package com.smartcare.backend.repository;

import com.smartcare.backend.entity.config.ConfigBed;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ConfigBedRepository extends MongoRepository<ConfigBed, String> {
}
