package com.smartcare.backend.repository;

import com.smartcare.backend.entity.PeRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PeRecordRepository extends MongoRepository<PeRecord, String> {
List<PeRecord> findByPid(String paramString);
}

