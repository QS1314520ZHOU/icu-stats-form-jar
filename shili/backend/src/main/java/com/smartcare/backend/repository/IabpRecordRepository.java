package com.smartcare.backend.repository;

import com.smartcare.backend.entity.IabpRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface IabpRecordRepository extends MongoRepository<IabpRecord, String> {
    List<IabpRecord> findByPid(String pid);
}
