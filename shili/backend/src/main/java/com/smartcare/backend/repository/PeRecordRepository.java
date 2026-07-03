package com.smartcare.backend.repository;

import com.smartcare.backend.entity.PeRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PeRecordRepository extends MongoRepository<PeRecord, String> {
    List<PeRecord> findByPid(String pid);
}
