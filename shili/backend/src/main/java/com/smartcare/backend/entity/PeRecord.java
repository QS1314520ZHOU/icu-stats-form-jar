package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.List;

@Data
@Document(collection = "pe_records")
public class PeRecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;
    
    // 血浆置换操作记录
    private Date startTime;
    private Date endTime;
    private String operator;
    private String indication; // 适应症
    private String vascularAccess; // 血管通路
    private String separatorType; // 分离器型号
    private String anticoagulant; // 抗凝剂
    
    // 治疗过程监测数据
    private List<PeMonitoringRecord> monitoringRecords;

    @Data
    public static class PeMonitoringRecord {
        private Date time;
        private Double bloodFlowRate; // 血流量 (ml/min)
        private Double plasmaReplacementRate; // 血浆置换速度
        private Double totalPlasmaExchanged; // 累计置换量
        private Double arterialPressure; // 动脉压
        private Double venousPressure; // 静脉压
        private Double tmp; // 跨膜压
        private String patientCondition; // 患者情况
        private String nurseSignature;
        private String nurseAccountId;
    }
}
