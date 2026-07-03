package com.smartcare.backend.repository;

import com.smartcare.backend.entity.HpRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HpRecordRepository extends MongoRepository<HpRecord, String> {
    List<HpRecord> findByPid(String pid);
}
