package com.smartcare.backend.hljld;

/**
 * 排出物/引流液二元组：名称 + 量。
 * 对应前端 NameAmount。
 */
public class NameAmount {
    private String name = "";
    private String amount = "";
    private double numericAmount = 0;

    public NameAmount() {}

    public NameAmount(String name, String amount, double numericAmount) {
        this.name = name;
        this.amount = amount;
        this.numericAmount = numericAmount;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getAmount() { return amount; }
    public void setAmount(String amount) { this.amount = amount; }
    public double getNumericAmount() { return numericAmount; }
    public void setNumericAmount(double numericAmount) { this.numericAmount = numericAmount; }

    public boolean hasAmountValue() {
        return amount != null && !amount.trim().isEmpty();
    }
}
