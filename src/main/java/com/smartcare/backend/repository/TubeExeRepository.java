package com.smartcare.backend.repository;

import com.smartcare.backend.entity.TubeExe;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TubeExeRepository extends MongoRepository<TubeExe, String> {
    List<TubeExe> findByPidAndType(String pid, String type);
}
