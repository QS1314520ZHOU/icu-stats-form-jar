package com.smartcare.backend.repository;

import com.smartcare.backend.entity.SggrfkcsRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface SggrfkcsRecordRepository extends MongoRepository<SggrfkcsRecord, String> {
    List<SggrfkcsRecord> findByPidAndValidOrderByRecordDateAsc(String pid, Boolean valid);
}
