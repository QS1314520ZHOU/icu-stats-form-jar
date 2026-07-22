package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
@Document(collection = "healthEducationRecord")
@CompoundIndex(name = "idx_health_edu_pid_valid_time", def = "{'pid':1,'valid':1,'assessmentTime':1}")
public class HealthEducationRecord {
    @Id private String id;
    private String pid;
    private Instant assessmentTime;
    private List<String> itemCodes = new ArrayList<>();
    private String educationTarget; // A家属、B病人、AB两者
    private List<String> evaluationCodes = new ArrayList<>(); // A/B/C/D
    private String nurseId;
    private String nurseName;

    private String specialMedicationOther;
    private String externalExamOther;
    private String internalExamOther;
    private String otherEducation;

    private List<String> valuableCodes = new ArrayList<>();
    private String valuableOther;
    private Boolean receiverConfirmed;
    private String receiverName;
    private Instant receivedAt;

    private Boolean valid = true;
    private Instant createdAt;
    private String createdBy;
    private Instant updatedAt;
    private String updatedBy;
}
