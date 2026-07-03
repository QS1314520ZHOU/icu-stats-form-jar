package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.List;

/**
 * 蛋白A免疫吸附治疗记录（独立集合 protein_a_records，勿再嵌在 CRRT 中）
 */
@Data
@Document(collection = "protein_a_records")
public class ProteinARecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;

    /** 文书级：血管通路 */
    private String vascularAccess;
    /** 文书级：吸附柱型号 */
    private String adsorberType;

    private List<MonitoringRow> monitoringRecords;

    @Data
    public static class MonitoringRow {
        private Date time;
        private String bp;
        private Integer hr;
        private Integer bloodFlow;
        private Integer plasmaFlow;
        private Integer totalPlasma;
        private Integer pa;
        private Integer pv;
        private Integer tmp;
        private String anticoagulant;
        private Integer replacementFluid;
        private String adverseReactions;
        private String nurseSignature;
        private String nurseAccountId;
    }
}
