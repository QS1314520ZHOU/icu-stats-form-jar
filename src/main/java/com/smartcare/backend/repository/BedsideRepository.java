package com.smartcare.backend.repository;

import com.smartcare.backend.entity.Bedside;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BedsideRepository extends MongoRepository<Bedside, String> {
    List<Bedside> findByPidAndValidTrue(String pid);
    List<Bedside> findByPidAndValidTrueAndCodeIn(String pid, List<String> codes);
}
