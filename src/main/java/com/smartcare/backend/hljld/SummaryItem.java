package com.smartcare.backend.hljld;

import java.util.ArrayList;
import java.util.List;

/**
 * 小结明细项，对应前端 HljldSummaryItem。
 */
public class SummaryItem {
    private String key = "";
    private String label = "";
    private double amount;
    private String unit = "ml";
    private List<SummaryItem> children = new ArrayList<>();

    public SummaryItem() {}

    public SummaryItem(String key, String label, double amount) {
        this.key = key;
        this.label = label;
        this.amount = amount;
    }

    public SummaryItem(String key, String label, double amount, List<SummaryItem> children) {
        this.key = key;
        this.label = label;
        this.amount = amount;
        this.children = children == null ? new ArrayList<>() : children;
    }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public double getAmount() { return amount; }
    public void setAmount(double amount) { this.amount = amount; }
    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }
    public List<SummaryItem> getChildren() { return children; }
    public void setChildren(List<SummaryItem> children) { this.children = children; }
}
