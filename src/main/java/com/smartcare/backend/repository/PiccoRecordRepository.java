package com.smartcare.backend.repository;

import com.smartcare.backend.entity.PiccoRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PiccoRecordRepository extends MongoRepository<PiccoRecord, String> {
List<PiccoRecord> findByPid(String paramString);
}

