package com.smartcare.backend.repository;

import com.smartcare.backend.entity.Sjm1VeinExtra;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface Sjm1VeinExtraRepository extends MongoRepository<Sjm1VeinExtra, String> {
    List<Sjm1VeinExtra> findByPidAndTubeId(String pid, String tubeId);
    List<Sjm1VeinExtra> findByPidAndTubeIdAndType(String pid, String tubeId, String type);
}
