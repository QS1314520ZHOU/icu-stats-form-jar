package com.smartcare.backend.repository;

import com.smartcare.backend.entity.SelfCareFormExtra;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SelfCareFormExtraRepository extends MongoRepository<SelfCareFormExtra, String> {
    List<SelfCareFormExtra> findByPidAndFormCodeOrderByEditTimeDesc(String pid, String formCode);
}
