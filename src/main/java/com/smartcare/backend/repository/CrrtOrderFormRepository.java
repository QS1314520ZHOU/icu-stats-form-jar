package com.smartcare.backend.repository;

import com.smartcare.backend.entity.CrrtOrderFormRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CrrtOrderFormRepository extends MongoRepository<CrrtOrderFormRecord, String> {
    List<CrrtOrderFormRecord> findByPidOrderByOrderTimeDesc(String pid);
}
