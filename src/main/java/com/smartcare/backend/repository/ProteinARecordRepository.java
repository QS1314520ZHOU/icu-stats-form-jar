package com.smartcare.backend.repository;

import com.smartcare.backend.entity.ProteinARecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProteinARecordRepository extends MongoRepository<ProteinARecord, String> {
List<ProteinARecord> findByPid(String paramString);
}

