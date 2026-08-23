package com.smartcare.backend.repository;

import com.smartcare.backend.entity.FormPageIndex;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FormPageIndexRepository extends MongoRepository<FormPageIndex, String> {

    /**
     * 根据患者ID + 表单类型查询页码索引
     */
    Optional<FormPageIndex> findByPidAndFormType(String pid, String formType);

    /**
     * 根据患者ID + 表单类型删除页码索引
     */
    void deleteByPidAndFormType(String pid, String formType);
}