package com.smartcare.backend.entity;

public class BloodProductSnapshot {
    private String bloodProductId;
    private String source = "manual";
    private String bagNo;
    private String aboType;
    private String rhType;
    private String productType;
    private String dose;
    private String doseUnit;
    private String expiresAt;

    public String getBloodProductId() { return bloodProductId; }
    public void setBloodProductId(String bloodProductId) { this.bloodProductId = bloodProductId; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getBagNo() { return bagNo; }
    public void setBagNo(String bagNo) { this.bagNo = bagNo; }
    public String getAboType() { return aboType; }
    public void setAboType(String aboType) { this.aboType = aboType; }
    public String getRhType() { return rhType; }
    public void setRhType(String rhType) { this.rhType = rhType; }
    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }
    public String getDose() { return dose; }
    public void setDose(String dose) { this.dose = dose; }
    public String getDoseUnit() { return doseUnit; }
    public void setDoseUnit(String doseUnit) { this.doseUnit = doseUnit; }
    public String getExpiresAt() { return expiresAt; }
    public void setExpiresAt(String expiresAt) { this.expiresAt = expiresAt; }
}
