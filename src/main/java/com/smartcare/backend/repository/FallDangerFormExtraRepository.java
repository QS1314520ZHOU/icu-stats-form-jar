package com.smartcare.backend.repository;

import com.smartcare.backend.entity.FallDangerFormExtra;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FallDangerFormExtraRepository extends MongoRepository<FallDangerFormExtra, String> {
    List<FallDangerFormExtra> findByPidAndFormCodeOrderByEditTimeDesc(String pid, String formCode);
}
