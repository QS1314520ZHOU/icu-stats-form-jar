package com.smartcare.backend.repository;

import com.smartcare.backend.entity.HljldPageIndex;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface HljldPageIndexRepository extends MongoRepository<HljldPageIndex, String> {

    /**
     * 根据患者 ID 查询页码索引
     */
    Optional<HljldPageIndex> findByPid(String pid);

    /**
     * 根据患者 ID 删除页码索引
     */
    void deleteByPid(String pid);
}
