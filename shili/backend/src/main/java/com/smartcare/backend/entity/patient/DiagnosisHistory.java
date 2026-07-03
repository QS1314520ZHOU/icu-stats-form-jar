package com.smartcare.backend.entity.patient;

import lombok.Data;

import java.util.Date;
import java.util.List;

@Data
public class DiagnosisHistory {
    private Date time;

    private String editor;

    private String editorId;

    private String diagnosis;

    private List<String> diagnosisCodeList;
}
