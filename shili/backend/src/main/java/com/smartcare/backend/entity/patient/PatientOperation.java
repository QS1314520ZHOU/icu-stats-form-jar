package com.smartcare.backend.entity.patient;

import lombok.Data;

import java.util.Date;

@Data
public class PatientOperation {
    private String orderId;

    private Date startTime;

    private Date endTime;

    private String name;

    private String code;
}
