package com.smartcare.backend.repository;

import com.smartcare.backend.entity.Score;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ScoreRepository extends MongoRepository<Score, String> {
    List<Score> findByPidAndScoreTypeAndValidTrue(String pid, String scoreType);
}
