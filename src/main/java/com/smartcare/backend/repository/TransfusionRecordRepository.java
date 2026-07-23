package com.smartcare.backend.repository;

import com.smartcare.backend.entity.TransfusionRecord;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TransfusionRecordRepository extends MongoRepository<TransfusionRecord, String> {
    Optional<TransfusionRecord> findByPid(String pid);
}
