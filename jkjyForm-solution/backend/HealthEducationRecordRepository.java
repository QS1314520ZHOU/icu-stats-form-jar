package com.smartcare.backend.repository;

import com.smartcare.backend.entity.HealthEducationRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface HealthEducationRecordRepository extends MongoRepository<HealthEducationRecord, String> {
    List<HealthEducationRecord> findByPidAndValidOrderByAssessmentTimeAsc(String pid, Boolean valid);
}
