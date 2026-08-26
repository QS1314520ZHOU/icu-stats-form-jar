package com.smartcare.backend.hljld;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 一个时间点的所有数据行，对应前端 HljldTimeRow。
 * 同一分钟的多条 bedside/药物/护理记录 按类别分别存储，不会互相覆盖。
 */
public class HljldTimeRow {
    private String key = "";
    private Date time;
    private String timeText = "";
    /** carryOver=-1, 明细=0, 小结=1, 结算=2 */
    private int sortRank = 0;

    private List<NameAmountRoute> medications = new ArrayList<>();
    private List<NameAmountRoute> enteral = new ArrayList<>();
    private List<String> urines = new ArrayList<>();
    private List<String> ultrafiltrations = new ArrayList<>();
    private List<NameAmount> outputs = new ArrayList<>();
    private List<NameAmount> drains = new ArrayList<>();
    private List<String> examination = new ArrayList<>();
    private List<String> treatment = new ArrayList<>();
    private List<String> basicCare = new ArrayList<>();
    private List<String> healthEducation = new ArrayList<>();
    private List<String> nursingRecords = new ArrayList<>();
    private String signature = "";

    public HljldTimeRow() {}

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public Date getTime() { return time; }
    public void setTime(Date time) { this.time = time; }
    public String getTimeText() { return timeText; }
    public void setTimeText(String timeText) { this.timeText = timeText; }
    public int getSortRank() { return sortRank; }
    public void setSortRank(int sortRank) { this.sortRank = sortRank; }
    public List<NameAmountRoute> getMedications() { return medications; }
    public void setMedications(List<NameAmountRoute> medications) { this.medications = medications; }
    public List<NameAmountRoute> getEnteral() { return enteral; }
    public void setEnteral(List<NameAmountRoute> enteral) { this.enteral = enteral; }
    public List<String> getUrines() { return urines; }
    public void setUrines(List<String> urines) { this.urines = urines; }
    public List<String> getUltrafiltrations() { return ultrafiltrations; }
    public void setUltrafiltrations(List<String> ultrafiltrations) { this.ultrafiltrations = ultrafiltrations; }
    public List<NameAmount> getOutputs() { return outputs; }
    public void setOutputs(List<NameAmount> outputs) { this.outputs = outputs; }
    public List<NameAmount> getDrains() { return drains; }
    public void setDrains(List<NameAmount> drains) { this.drains = drains; }
    public List<String> getExamination() { return examination; }
    public void setExamination(List<String> examination) { this.examination = examination; }
    public List<String> getTreatment() { return treatment; }
    public void setTreatment(List<String> treatment) { this.treatment = treatment; }
    public List<String> getBasicCare() { return basicCare; }
    public void setBasicCare(List<String> basicCare) { this.basicCare = basicCare; }
    public List<String> getHealthEducation() { return healthEducation; }
    public void setHealthEducation(List<String> healthEducation) { this.healthEducation = healthEducation; }
    public List<String> getNursingRecords() { return nursingRecords; }
    public void setNursingRecords(List<String> nursingRecords) { this.nursingRecords = nursingRecords; }
    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }

    /** 是否有任何非空内容 */
    public boolean hasContent() {
        return !medications.isEmpty() || !enteral.isEmpty()
            || !urines.isEmpty() || !ultrafiltrations.isEmpty()
            || !outputs.isEmpty() || !drains.isEmpty()
            || !examination.isEmpty() || !treatment.isEmpty()
            || !basicCare.isEmpty() || !healthEducation.isEmpty()
            || !nursingRecords.isEmpty();
    }
}
