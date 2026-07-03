package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.List;

@Data
@Document(collection = "cvc_records")
public class CvcRecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;
    
    // 中心静脉穿刺置管术操作
    private String punctureSite;
    private String catheterType;
    private String operator;
    private Date operationTime;
    private String complications;
    private Boolean ultrasoundGuided;
    
    // 监测记录单
    private List<MonitoringRecord> monitoringRecords;
    
    // 俯卧位通气操作指导与记录
    private PronePositionVentilation pronePositionVentilation;

    @Data
    public static class MonitoringRecord {
        private Date time;
        private Double cvp; // 中心静脉压
        private String catheterStatus; // 导管状态（通畅、堵塞等）
        private String dressingStatus; // 敷料情况
        private String nurseSignature;
        private String nurseAccountId;
    }

    @Data
    public static class PronePositionVentilation {
        private Date startTime;
        private Date endTime;
        private String indications;
        private String complicationsDuring;
        private String oxygenationIndexBefore;
        private String oxygenationIndexAfter;
        private String doctorSignature;
    }
}
