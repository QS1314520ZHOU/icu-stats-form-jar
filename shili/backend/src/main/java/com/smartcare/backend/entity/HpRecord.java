package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.List;

@Data
@Document(collection = "hp_records")
public class HpRecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;
    
    // 血液灌流操作记录
    private Date startTime;
    private Date endTime;
    private String operator;
    private String indication; // 适应症 (如中毒、高胆红素等)
    private String vascularAccess; // 血管通路
    private String hemoperfuserType; // 灌流器型号
    private String anticoagulant; // 抗凝方案
    
    // 治疗过程监测数据
    private List<HpMonitoringRecord> monitoringRecords;

    @Data
    public static class HpMonitoringRecord {
        private Date time;
        private Double bloodFlowRate; // 血流量 (ml/min)
        private Double arterialPressure; // 动脉压
        private Double venousPressure; // 静脉压
        private Double tmp; // 跨膜压
        private String patientCondition; // 患者情况
        private String complications; // 并发症/不良反应
        private String nurseSignature;
        private String nurseAccountId;
    }
}
