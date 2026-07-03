package com.smartcare.backend.repository;

import com.smartcare.backend.entity.CrrtRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CrrtRecordRepository extends MongoRepository<CrrtRecord, String> {
    List<CrrtRecord> findByPid(String pid);
}
