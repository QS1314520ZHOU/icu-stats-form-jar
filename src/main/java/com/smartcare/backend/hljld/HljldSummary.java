package com.smartcare.backend.hljld;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 小结/总结数据，对应前端 HljldSummary。
 */
public class HljldSummary {
    public enum Kind { DAY, SHIFT, FULL_DAY, DISCHARGE }

    private Kind kind;
    private Date time;
    private String dayText = "";
    private String nightText = "";

    // 入量
    private double inputSum;
    private List<SummaryItem> inputItems = new ArrayList<>();
    private double medicationSum;
    private List<SummaryItem> medicationItems = new ArrayList<>();
    private double enteralSum;
    private List<SummaryItem> enteralItems = new ArrayList<>();

    // 出量
    private double outputSum;
    private List<SummaryItem> outputItems = new ArrayList<>();
    private double urineSum;
    private List<SummaryItem> urineItems = new ArrayList<>();
    private double ultrafiltrationSum;
    private List<SummaryItem> ultrafiltrationItems = new ArrayList<>();
    private List<SummaryItem> drainItems = new ArrayList<>();

    // 护理操作
    private List<SummaryItem> nurseItems = new ArrayList<>();

    // 平衡
    private double balance;

    // 详情行
    private List<List<SummaryTextToken>> detailLines = new ArrayList<>();

    // Getters and Setters
    public Kind getKind() { return kind; }
    public void setKind(Kind kind) { this.kind = kind; }
    public Date getTime() { return time; }
    public void setTime(Date time) { this.time = time; }
    public String getDayText() { return dayText; }
    public void setDayText(String dayText) { this.dayText = dayText; }
    public String getNightText() { return nightText; }
    public void setNightText(String nightText) { this.nightText = nightText; }
    public double getInputSum() { return inputSum; }
    public void setInputSum(double inputSum) { this.inputSum = inputSum; }
    public List<SummaryItem> getInputItems() { return inputItems; }
    public void setInputItems(List<SummaryItem> inputItems) { this.inputItems = inputItems; }
    public double getMedicationSum() { return medicationSum; }
    public void setMedicationSum(double medicationSum) { this.medicationSum = medicationSum; }
    public List<SummaryItem> getMedicationItems() { return medicationItems; }
    public void setMedicationItems(List<SummaryItem> medicationItems) { this.medicationItems = medicationItems; }
    public double getEnteralSum() { return enteralSum; }
    public void setEnteralSum(double enteralSum) { this.enteralSum = enteralSum; }
    public List<SummaryItem> getEnteralItems() { return enteralItems; }
    public void setEnteralItems(List<SummaryItem> enteralItems) { this.enteralItems = enteralItems; }
    public double getOutputSum() { return outputSum; }
    public void setOutputSum(double outputSum) { this.outputSum = outputSum; }
    public List<SummaryItem> getOutputItems() { return outputItems; }
    public void setOutputItems(List<SummaryItem> outputItems) { this.outputItems = outputItems; }
    public double getUrineSum() { return urineSum; }
    public void setUrineSum(double urineSum) { this.urineSum = urineSum; }
    public List<SummaryItem> getUrineItems() { return urineItems; }
    public void setUrineItems(List<SummaryItem> urineItems) { this.urineItems = urineItems; }
    public double getUltrafiltrationSum() { return ultrafiltrationSum; }
    public void setUltrafiltrationSum(double ultrafiltrationSum) { this.ultrafiltrationSum = ultrafiltrationSum; }
    public List<SummaryItem> getUltrafiltrationItems() { return ultrafiltrationItems; }
    public void setUltrafiltrationItems(List<SummaryItem> ultrafiltrationItems) { this.ultrafiltrationItems = ultrafiltrationItems; }
    public List<SummaryItem> getDrainItems() { return drainItems; }
    public void setDrainItems(List<SummaryItem> drainItems) { this.drainItems = drainItems; }
    public List<SummaryItem> getNurseItems() { return nurseItems; }
    public void setNurseItems(List<SummaryItem> nurseItems) { this.nurseItems = nurseItems; }
    public double getBalance() { return balance; }
    public void setBalance(double balance) { this.balance = balance; }
    public List<List<SummaryTextToken>> getDetailLines() { return detailLines; }
    public void setDetailLines(List<List<SummaryTextToken>> detailLines) { this.detailLines = detailLines; }
}
