package com.smartcare.backend.entity.patient;

import lombok.Data;

import java.util.Date;

@Data
public class AllergicAndPastRecord {
    private String editId;

    private Date editAllergicTime;

    private String editAllergicDesc;

    private Date syncAllergicTime;

    private String syncAllergicDesc; // 过敏史

    private Date editPastTime;

    private String editPastDesc;

    private Date syncPastTime;

    private String syncPastDesc;
}
