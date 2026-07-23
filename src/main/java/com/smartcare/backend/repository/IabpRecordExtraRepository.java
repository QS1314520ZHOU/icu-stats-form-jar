package com.smartcare.backend.repository;
import com.smartcare.backend.entity.IabpRecordExtra;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
@Repository public interface IabpRecordExtraRepository extends MongoRepository<IabpRecordExtra,String>{List<IabpRecordExtra> findByPidOrderByUpdatedAtDesc(String pid);}
