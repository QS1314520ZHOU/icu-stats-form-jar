package com.smartcare.backend.repository;

import com.smartcare.backend.entity.ProteinARecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProteinARecordRepository extends MongoRepository<ProteinARecord, String> {
    List<ProteinARecord> findByPid(String pid);
}
