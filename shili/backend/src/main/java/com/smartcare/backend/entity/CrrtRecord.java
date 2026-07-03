package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.List;

/**
 * CRRT 护理记录（与蛋白A免疫吸附无关，独立集合 crrt_records）
 */
@Data
@Document(collection = "crrt_records")
public class CrrtRecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;

    /** 血管通路 */
    private String vascularAccess;
    /** 滤器型号 */
    private String filterType;

    /** 按时间点的护理监测行 */
    private List<NursingRecord> nursingRecords;

    @Data
    public static class NursingRecord {
        private Date time;
        /** 如 120/80 */
        private String bp;
        private Integer hr;
        private String mode;
        private Integer pa;
        private Integer pv;
        private Integer tmp;
        private Integer pbf;
        private Integer qb;
        private Integer qd;
        private Integer qf;
        private Integer waste;
        private String anticoagulant;
        private Integer quf;
        private String alarms;
        private String nurseSignature;
        private String nurseAccountId;
    }
}
