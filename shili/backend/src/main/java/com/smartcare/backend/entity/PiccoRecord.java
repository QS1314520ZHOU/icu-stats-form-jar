package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.List;

@Data
@Document(collection = "picco_records")
public class PiccoRecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;
    
    // PiCCO 置入操作
    private Date insertionTime;
    private String operator;
    private String insertionSite; // 动脉穿刺部位
    private String catheterSize;
    private Boolean ultrasoundGuided;
    private String complicationsDuringInsertion;
    
    // PiCCO 监测记录单
    private List<HemodynamicRecord> hemodynamicRecords;

    @Data
    public static class HemodynamicRecord {
        private Date time;
        private Double ci; // 心排血指数 Cardiac Index
        private Double gedvi; // 全心舒张末期容积指数
        private Double evlwi; // 血管外肺水指数
        private Double svri; // 外周血管阻力指数
        private Double dpdtMax; // 心肌收缩力指标
        private Double map; // 平均动脉压
        private String nurseSignature;
        private String nurseAccountId;
    }
}
