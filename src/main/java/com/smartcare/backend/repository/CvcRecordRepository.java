package com.smartcare.backend.repository;

import com.smartcare.backend.entity.CvcRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CvcRecordRepository extends MongoRepository<CvcRecord, String> {
List<CvcRecord> findByPid(String paramString);
}

