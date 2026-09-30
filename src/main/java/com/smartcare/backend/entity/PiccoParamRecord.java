package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.Map;

/**
 * PICCO 容量监测参数手工录入记录（不再依赖 bedside 同步数据）。
 * 一条记录 = 一个测量时间点的各参数值（参数编码 → 录入值）。
 */
@Data
@Document(collection = "piccoParamRecord")
@CompoundIndex(name = "idx_picco_param_pid_valid_time", def = "{'pid':1,'valid':1,'recordTime':1}")
public class PiccoParamRecord {
    @Id private String id;
    private String pid;
    private Instant recordTime;
    /** 参数编码 → 录入值（仅保存非空项） */
    private Map<String, String> values;

    private Boolean valid = true;
    private Instant createdAt;
    private String createdBy;
    private Instant updatedAt;
    private String updatedBy;
}
