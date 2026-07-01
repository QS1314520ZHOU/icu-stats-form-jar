package com.smartcare.backend.repository;

import com.smartcare.backend.entity.HpRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HpRecordRepository extends MongoRepository<HpRecord, String> {
List<HpRecord> findByPid(String paramString);
}

