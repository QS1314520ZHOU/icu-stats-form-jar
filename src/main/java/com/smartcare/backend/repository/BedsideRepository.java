package com.smartcare.backend.repository;

import com.smartcare.backend.entity.Bedside;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface BedsideRepository extends MongoRepository<Bedside, String> {
    List<Bedside> findByPidAndValidTrue(String pid);
    List<Bedside> findByPidAndValidTrueAndCodeIn(String pid, List<String> codes);

    /** 按 pid + 时间范围查询有效记录，time 字段为 ISO 字符串，可直接做字典序比较 */
    @Query("{ pid: ?0, valid: true, time: { $gte: ?1, $lte: ?2 } }")
    List<Bedside> findByPidAndValidTrueAndTimeRange(String pid, String startTime, String endTime);
}
