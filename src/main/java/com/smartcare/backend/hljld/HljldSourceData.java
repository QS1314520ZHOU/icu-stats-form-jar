package com.smartcare.backend.hljld;

import org.bson.Document;

import java.util.*;

/**
 * 护理日所需的全部原始数据，对应前端 HljldSourceData。
 */
public class HljldSourceData {
    private List<Document> bedside = new ArrayList<>();
    private List<Document> drugExecutions = new ArrayList<>();
    private List<Document> drugMethods = new ArrayList<>();
    private List<Document> nurseRecords = new ArrayList<>();
    private List<Document> tubeExecutions = new ArrayList<>();
    private List<Document> tubeViews = new ArrayList<>();
    /** accountId → trueName 映射 */
    private Map<String, String> accountMap = new HashMap<>();

    public List<Document> getBedside() { return bedside; }
    public void setBedside(List<Document> bedside) { this.bedside = bedside; }
    public List<Document> getDrugExecutions() { return drugExecutions; }
    public void setDrugExecutions(List<Document> drugExecutions) { this.drugExecutions = drugExecutions; }
    public List<Document> getDrugMethods() { return drugMethods; }
    public void setDrugMethods(List<Document> drugMethods) { this.drugMethods = drugMethods; }
    public List<Document> getNurseRecords() { return nurseRecords; }
    public void setNurseRecords(List<Document> nurseRecords) { this.nurseRecords = nurseRecords; }
    public List<Document> getTubeExecutions() { return tubeExecutions; }
    public void setTubeExecutions(List<Document> tubeExecutions) { this.tubeExecutions = tubeExecutions; }
    public List<Document> getTubeViews() { return tubeViews; }
    public void setTubeViews(List<Document> tubeViews) { this.tubeViews = tubeViews; }
    public Map<String, String> getAccountMap() { return accountMap; }
    public void setAccountMap(Map<String, String> accountMap) { this.accountMap = accountMap; }

    public boolean isEmpty() {
        return bedside.isEmpty() && drugExecutions.isEmpty() && nurseRecords.isEmpty();
    }
}
