package com.smartcare.backend.repository;

import com.smartcare.backend.entity.PiccoParamRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface PiccoParamRecordRepository extends MongoRepository<PiccoParamRecord, String> {
    List<PiccoParamRecord> findByPidAndValidOrderByRecordTimeAsc(String pid, Boolean valid);

    List<PiccoParamRecord> findByPidAndRecordTimeAndValid(String pid, Instant recordTime, Boolean valid);
}
