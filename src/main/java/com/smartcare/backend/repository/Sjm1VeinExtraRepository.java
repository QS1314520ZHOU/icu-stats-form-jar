package com.smartcare.backend.repository;

import com.smartcare.backend.entity.Sjm1VeinExtra;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface Sjm1VeinExtraRepository extends MongoRepository<Sjm1VeinExtra, String> {
    Optional<Sjm1VeinExtra> findByPidAndTubeId(String pid, String tubeId);
}
