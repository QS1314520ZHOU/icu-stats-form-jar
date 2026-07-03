package com.smartcare.backend.repository;

import com.smartcare.backend.entity.PiccoRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PiccoRecordRepository extends MongoRepository<PiccoRecord, String> {
    List<PiccoRecord> findByPid(String pid);
}
