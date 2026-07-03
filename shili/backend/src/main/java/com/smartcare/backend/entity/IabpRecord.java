package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.List;

@Data
@Document(collection = "iabp_records")
public class IabpRecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;
    
    // IABP 操作记录
    private Date insertionTime;
    private String operator;
    private String insertionSite; // 股动脉穿刺侧
    private String balloonVolume; // 气囊容量
    private String triggerMode; // 触发模式 (ECG, Pressure, etc.)
    private String assistRatio; // 辅助比例 (1:1, 1:2)
    private String complications;
    
    // 监测记录单
    private List<IabpMonitoringRecord> monitoringRecords;

    @Data
    public static class IabpMonitoringRecord {
        private Date time;
        private Double systolicPressure; // 自身收缩压
        private Double diastolicPressure; // 自身舒张压
        private Double augmentedPressure; // 反搏压
        private Double endDiastolicPressure; // 舒张末期压
        private String balloonStatus; // 气囊工作状态
        private String punctureSiteStatus; // 穿刺点情况
        private String pedalPulse; // 足背动脉搏动情况
        private String nurseSignature;
        private String nurseAccountId;
    }
}
