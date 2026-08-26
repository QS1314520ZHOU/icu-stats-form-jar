package com.smartcare.backend.hljld;

/**
 * 药物/胃肠摄入等三元组：名称 + 量 + 途径。
 * 对应前端 NameAmountRoute。
 */
public class NameAmountRoute {
    private String name = "";
    private String amount = "";
    private String route = "";
    private double numericAmount = 0;

    public NameAmountRoute() {}

    public NameAmountRoute(String name, String amount, String route, double numericAmount) {
        this.name = name;
        this.amount = amount;
        this.route = route;
        this.numericAmount = numericAmount;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getAmount() { return amount; }
    public void setAmount(String amount) { this.amount = amount; }
    public String getRoute() { return route; }
    public void setRoute(String route) { this.route = route; }
    public double getNumericAmount() { return numericAmount; }
    public void setNumericAmount(double numericAmount) { this.numericAmount = numericAmount; }

    public boolean hasNameOrAmount() {
        return hasText(name) || hasText(amount);
    }

    private static boolean hasText(String s) {
        return s != null && !s.trim().isEmpty();
    }
}
