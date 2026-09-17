package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Data
@Document(collection = "sggrfkcsRecord")
@CompoundIndex(name = "idx_sggrfkcs_pid_valid_date", def = "{'pid':1,'valid':1,'recordDate':1}")
public class SggrfkcsRecord {
    @Id private String id;
    private String pid;
    private String recordDate;
    private Map<String, String> measures = new HashMap<>();
    private String doctorName;
    private String nurseId;
    private String nurseName;
    private String inspectorName;
    private Boolean valid = true;
    private Instant createdAt;
    private String createdBy;
    private Instant updatedAt;
    private String updatedBy;
}
