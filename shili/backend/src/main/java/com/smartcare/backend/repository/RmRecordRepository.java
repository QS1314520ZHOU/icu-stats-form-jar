package com.smartcare.backend.repository;

import com.smartcare.backend.entity.RmRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RmRecordRepository extends MongoRepository<RmRecord, String> {
    List<RmRecord> findByPid(String pid);
}
