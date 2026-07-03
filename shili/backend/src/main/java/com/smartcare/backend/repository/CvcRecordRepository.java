package com.smartcare.backend.repository;

import com.smartcare.backend.entity.CvcRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CvcRecordRepository extends MongoRepository<CvcRecord, String> {
    List<CvcRecord> findByPid(String pid);
}
