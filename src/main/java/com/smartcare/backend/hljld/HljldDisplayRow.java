package com.smartcare.backend.hljld;

/**
 * PDF 表格中的一行数据，对应前端 HljldDisplayRow。
 * 由 buildDisplayGroups 将 HljldTimeRow 展开生成。
 */
public class HljldDisplayRow {
    private String key = "";
    private String groupKey = "";
    private long timestamp;
    private int lineIndex;
    private boolean firstLine;
    private boolean lastLine;

    private String timeText = "";
    private NameAmountRoute medication;
    private NameAmountRoute enteral;
    private String urine = "";
    private String ultrafiltration = "";
    private NameAmount output;
    private NameAmount drain;
    private String examination = "";
    private String treatment = "";
    private String basicCare = "";
    private String healthEducation = "";
    private String nursingRecord = "";
    private String signature = "";

    public HljldDisplayRow() {}

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getGroupKey() { return groupKey; }
    public void setGroupKey(String groupKey) { this.groupKey = groupKey; }
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    public int getLineIndex() { return lineIndex; }
    public void setLineIndex(int lineIndex) { this.lineIndex = lineIndex; }
    public boolean isFirstLine() { return firstLine; }
    public void setFirstLine(boolean firstLine) { this.firstLine = firstLine; }
    public boolean isLastLine() { return lastLine; }
    public void setLastLine(boolean lastLine) { this.lastLine = lastLine; }
    public String getTimeText() { return timeText; }
    public void setTimeText(String timeText) { this.timeText = timeText; }
    public NameAmountRoute getMedication() { return medication; }
    public void setMedication(NameAmountRoute medication) { this.medication = medication; }
    public NameAmountRoute getEnteral() { return enteral; }
    public void setEnteral(NameAmountRoute enteral) { this.enteral = enteral; }
    public String getUrine() { return urine; }
    public void setUrine(String urine) { this.urine = urine; }
    public String getUltrafiltration() { return ultrafiltration; }
    public void setUltrafiltration(String ultrafiltration) { this.ultrafiltration = ultrafiltration; }
    public NameAmount getOutput() { return output; }
    public void setOutput(NameAmount output) { this.output = output; }
    public NameAmount getDrain() { return drain; }
    public void setDrain(NameAmount drain) { this.drain = drain; }
    public String getExamination() { return examination; }
    public void setExamination(String examination) { this.examination = examination; }
    public String getTreatment() { return treatment; }
    public void setTreatment(String treatment) { this.treatment = treatment; }
    public String getBasicCare() { return basicCare; }
    public void setBasicCare(String basicCare) { this.basicCare = basicCare; }
    public String getHealthEducation() { return healthEducation; }
    public void setHealthEducation(String healthEducation) { this.healthEducation = healthEducation; }
    public String getNursingRecord() { return nursingRecord; }
    public void setNursingRecord(String nursingRecord) { this.nursingRecord = nursingRecord; }
    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }
}
