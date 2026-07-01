package com.smartcare.backend.repository;

import com.smartcare.backend.entity.IabpRecord;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface IabpRecordRepository extends MongoRepository<IabpRecord, String> {
List<IabpRecord> findByPid(String paramString);
}

