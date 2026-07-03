package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

@Data
@Document(collection = "rm_records")
public class RmRecord {
    @Id
    private String id;
    /** 对应 Patient 文档的 id */
    private String pid;
    
    // 肺复张(RM)临床操作规范记录
    private Date operationTime;
    private String operator;
    private String method; // 操作方法，如 CPAP法, PCV法
    
    // 肺复张操作参数
    private Double peepInitial;
    private Double peepMax;
    private Double pressureControl;
    private Integer durationSeconds;
    
    // 效果评估
    private String spo2Before;
    private String spo2After;
    private Double complianceBefore;
    private Double complianceAfter;
    
    // 并发症
    private String complications; // 如低血压，气压伤等
    
    private String doctorSignature;
    private String doctorAccountId;
}
