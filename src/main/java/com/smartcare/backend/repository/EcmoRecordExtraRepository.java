package com.smartcare.backend.repository;

import com.smartcare.backend.entity.EcmoRecordExtra;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EcmoRecordExtraRepository extends MongoRepository<EcmoRecordExtra, String> {
    List<EcmoRecordExtra> findByPidOrderByUpdatedAtDesc(String pid);
}
