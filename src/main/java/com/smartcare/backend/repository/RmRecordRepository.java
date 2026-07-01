package com.smartcare.backend.repository;

import com.smartcare.backend.entity.RmRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RmRecordRepository extends MongoRepository<RmRecord, String> {
List<RmRecord> findByPid(String paramString);
}

