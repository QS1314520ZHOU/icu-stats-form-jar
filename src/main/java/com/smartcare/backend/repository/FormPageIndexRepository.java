package com.smartcare.backend.repository;

import com.smartcare.backend.entity.FormPageIndex;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FormPageIndexRepository extends MongoRepository<FormPageIndex, String> {

    /**
     * 根据患者ID + 表单类型查询页码索引（可能有多条，返回第一条）
     */
    Optional<FormPageIndex> findTopByPidAndFormType(String pid, String formType);

    /**
     * 根据患者ID + 表单类型查询所有页码索引
     */
    List<FormPageIndex> findAllByPidAndFormType(String pid, String formType);

    /**
     * 根据患者ID + 表单类型删除页码索引
     */
    void deleteByPidAndFormType(String pid, String formType);
}