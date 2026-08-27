package com.smartcare.backend.hljld;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 小结/总结数据，对应前端 HljldSummary。
 *
 * 字段命名与前端 hljld-form.utils.ts buildSummary() 完全一致：
 * - totalInput / drugTreatmentTotal / gastrointestinalInputTotal
 * - totalOutput / urineTotal / ultrafiltrationTotal / excretionTotal / drainTotal
 * - balance
 * - detailLines（入量行、出量行、平衡量行）
 */
public class HljldSummary {
    public enum Kind { DAY, SHIFT, FULL_DAY, DISCHARGE }

    private Kind kind;
    private String label = "";
    private String periodText = "";

    private long plannedStart;
    private long plannedEnd;
    private long periodStart;
    private long periodEnd;

    private boolean admissionClipped;
    private boolean dischargeClipped;
    private boolean available;

    // 入量
    private double totalInput;
    private List<SummaryItem> inputItems = new ArrayList<>();

    // 药物治疗 = 带入药量 + 静脉入量
    private double drugTreatmentTotal;
    private List<SummaryItem> drugTreatmentItems = new ArrayList<>();

    // 胃肠摄入 = 鼻饲量 + 胃肠入量
    private double gastrointestinalInputTotal;
    private List<SummaryItem> gastrointestinalInputItems = new ArrayList<>();

    // 出量
    private double totalOutput;
    private List<SummaryItem> outputItems = new ArrayList<>();
    private List<SummaryItem> drainItems = new ArrayList<>();

    // 单独统计项
    private double urineTotal;
    private double ultrafiltrationTotal;
    private double excretionTotal;
    private double drainTotal;

    // 平衡
    private double balance;

    // Timeline展示时间
    private Date time;

    // 详情行（入量行、出量行、平衡量行）
    private List<List<SummaryTextToken>> detailLines = new ArrayList<>();

    // ── 兼容旧字段（过渡期保留，新代码不使用） ──
    /** @deprecated 使用 totalInput */
    private double inputSum;
    /** @deprecated 使用 drugTreatmentTotal */
    private double medicationSum;
    /** @deprecated 使用 gastrointestinalInputTotal */
    private double enteralSum;
    /** @deprecated 使用 totalOutput */
    private double outputSum;
    /** @deprecated 使用 urineTotal */
    private double urineSum;
    /** @deprecated 使用 ultrafiltrationTotal */
    private double ultrafiltrationSum;

    // Getters and Setters

    public Kind getKind() { return kind; }
    public void setKind(Kind kind) { this.kind = kind; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label == null ? "" : label; }

    public String getPeriodText() { return periodText; }
    public void setPeriodText(String periodText) { this.periodText = periodText == null ? "" : periodText; }

    public long getPlannedStart() { return plannedStart; }
    public void setPlannedStart(long plannedStart) { this.plannedStart = plannedStart; }

    public long getPlannedEnd() { return plannedEnd; }
    public void setPlannedEnd(long plannedEnd) { this.plannedEnd = plannedEnd; }

    public long getPeriodStart() { return periodStart; }
    public void setPeriodStart(long periodStart) { this.periodStart = periodStart; }

    public long getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(long periodEnd) { this.periodEnd = periodEnd; }

    public boolean isAdmissionClipped() { return admissionClipped; }
    public void setAdmissionClipped(boolean admissionClipped) { this.admissionClipped = admissionClipped; }

    public boolean isDischargeClipped() { return dischargeClipped; }
    public void setDischargeClipped(boolean dischargeClipped) { this.dischargeClipped = dischargeClipped; }

    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }

    public double getTotalInput() { return totalInput; }
    public void setTotalInput(double totalInput) { this.totalInput = totalInput; }

    public List<SummaryItem> getInputItems() { return inputItems; }
    public void setInputItems(List<SummaryItem> inputItems) { this.inputItems = inputItems == null ? new ArrayList<>() : inputItems; }

    public double getDrugTreatmentTotal() { return drugTreatmentTotal; }
    public void setDrugTreatmentTotal(double drugTreatmentTotal) { this.drugTreatmentTotal = drugTreatmentTotal; }

    public List<SummaryItem> getDrugTreatmentItems() { return drugTreatmentItems; }
    public void setDrugTreatmentItems(List<SummaryItem> items) { this.drugTreatmentItems = items == null ? new ArrayList<>() : items; }

    public double getGastrointestinalInputTotal() { return gastrointestinalInputTotal; }
    public void setGastrointestinalInputTotal(double value) { this.gastrointestinalInputTotal = value; }

    public List<SummaryItem> getGastrointestinalInputItems() { return gastrointestinalInputItems; }
    public void setGastrointestinalInputItems(List<SummaryItem> items) { this.gastrointestinalInputItems = items == null ? new ArrayList<>() : items; }

    public double getTotalOutput() { return totalOutput; }
    public void setTotalOutput(double totalOutput) { this.totalOutput = totalOutput; }

    public List<SummaryItem> getOutputItems() { return outputItems; }
    public void setOutputItems(List<SummaryItem> outputItems) { this.outputItems = outputItems == null ? new ArrayList<>() : outputItems; }

    public List<SummaryItem> getDrainItems() { return drainItems; }
    public void setDrainItems(List<SummaryItem> drainItems) { this.drainItems = drainItems == null ? new ArrayList<>() : drainItems; }

    public double getUrineTotal() { return urineTotal; }
    public void setUrineTotal(double urineTotal) { this.urineTotal = urineTotal; }

    public double getUltrafiltrationTotal() { return ultrafiltrationTotal; }
    public void setUltrafiltrationTotal(double value) { this.ultrafiltrationTotal = value; }

    public double getExcretionTotal() { return excretionTotal; }
    public void setExcretionTotal(double excretionTotal) { this.excretionTotal = excretionTotal; }

    public double getDrainTotal() { return drainTotal; }
    public void setDrainTotal(double drainTotal) { this.drainTotal = drainTotal; }

    public double getBalance() { return balance; }
    public void setBalance(double balance) { this.balance = balance; }

    public Date getTime() { return time; }
    public void setTime(Date time) { this.time = time; }

    public List<List<SummaryTextToken>> getDetailLines() { return detailLines; }
    public void setDetailLines(List<List<SummaryTextToken>> detailLines) { this.detailLines = detailLines == null ? new ArrayList<>() : detailLines; }

    // ── 兼容旧字段 ──

    /** @deprecated 使用 getTotalInput() */
    public double getInputSum() { return totalInput; }
    /** @deprecated 使用 setTotalInput() */
    public void setInputSum(double v) { this.totalInput = v; }

    /** @deprecated 使用 getDrugTreatmentTotal() */
    public double getMedicationSum() { return drugTreatmentTotal; }
    /** @deprecated 使用 setDrugTreatmentTotal() */
    public void setMedicationSum(double v) { this.drugTreatmentTotal = v; }

    /** @deprecated 使用 getGastrointestinalInputTotal() */
    public double getEnteralSum() { return gastrointestinalInputTotal; }
    /** @deprecated 使用 setGastrointestinalInputTotal() */
    public void setEnteralSum(double v) { this.gastrointestinalInputTotal = v; }

    /** @deprecated 使用 getTotalOutput() */
    public double getOutputSum() { return totalOutput; }
    /** @deprecated 使用 setTotalOutput() */
    public void setOutputSum(double v) { this.totalOutput = v; }

    /** @deprecated 使用 getUrineTotal() */
    public double getUrineSum() { return urineTotal; }
    /** @deprecated 使用 setUrineTotal() */
    public void setUrineSum(double v) { this.urineTotal = v; }

    /** @deprecated 使用 getUltrafiltrationTotal() */
    public double getUltrafiltrationSum() { return ultrafiltrationTotal; }
    /** @deprecated 使用 setUltrafiltrationTotal() */
    public void setUltrafiltrationSum(double v) { this.ultrafiltrationTotal = v; }
}
