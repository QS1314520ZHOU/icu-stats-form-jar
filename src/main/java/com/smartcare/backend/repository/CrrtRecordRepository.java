package com.smartcare.backend.repository;

import com.smartcare.backend.entity.CrrtRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CrrtRecordRepository extends MongoRepository<CrrtRecord, String> {
List<CrrtRecord> findByPid(String paramString);
}

