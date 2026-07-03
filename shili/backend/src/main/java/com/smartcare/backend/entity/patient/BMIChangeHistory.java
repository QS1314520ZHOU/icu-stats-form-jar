package com.smartcare.backend.entity.patient;

import lombok.Data;

import java.util.Date;

@Data
public class BMIChangeHistory {
    private Date date;

    private String height;

    private String weight;

    private String oneMonthWeight;

    private String twoMonthWeight;

    private String threeMonthWeight;
}
