package com.smartcare.backend.repository;
import com.smartcare.backend.entity.PiccoRecordExtra;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
@Repository
public interface PiccoRecordExtraRepository extends MongoRepository<PiccoRecordExtra,String>{
 List<PiccoRecordExtra> findByPidOrderByUpdatedAtDesc(String pid);
}
