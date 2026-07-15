package com.smartcare.backend.repository;

import com.smartcare.backend.entity.YdwzlFormExtra;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface YdwzlFormExtraRepository extends MongoRepository<YdwzlFormExtra, String> {
    List<YdwzlFormExtra> findByPidOrderByEditTimeDesc(String pid);
    List<YdwzlFormExtra> findByPidAndRecordDate(String pid, String recordDate);
}
