package com.smartcare.backend.service;

import com.smartcare.backend.entity.Score;
import com.smartcare.backend.repository.ScoreRepository;
import java.util.Collections;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ScoreService {
    private final ScoreRepository repository;

    public ScoreService(ScoreRepository repository) {
        this.repository = repository;
    }

    public List<Score> findValidByPidAndScoreType(String pid, String scoreType) {
        if (pid == null || pid.isEmpty() || scoreType == null || scoreType.isEmpty()) {
            return Collections.emptyList();
        }
        return this.repository.findByPidAndScoreTypeAndValidTrue(pid, scoreType);
    }
}
