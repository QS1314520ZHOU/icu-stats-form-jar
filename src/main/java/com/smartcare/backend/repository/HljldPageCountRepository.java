package com.smartcare.backend.repository;

import com.smartcare.backend.entity.HljldPageCount;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface HljldPageCountRepository extends MongoRepository<HljldPageCount, String> {

    Optional<HljldPageCount> findByPidAndNursingDate(String pid, LocalDate nursingDate);

    /** 查询患者从 from 到 to 日期范围内的页数记录 */
    List<HljldPageCount> findByPidAndNursingDateBetween(String pid, LocalDate from, LocalDate to);
}
