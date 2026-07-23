package com.smartcare.backend.entity;

public class VitalSigns {
    private String temperature;
    private String pulse;
    private String respiration;
    private String systolic;
    private String diastolic;

    public String getTemperature() { return temperature; }
    public void setTemperature(String temperature) { this.temperature = temperature; }
    public String getPulse() { return pulse; }
    public void setPulse(String pulse) { this.pulse = pulse; }
    public String getRespiration() { return respiration; }
    public void setRespiration(String respiration) { this.respiration = respiration; }
    public String getSystolic() { return systolic; }
    public void setSystolic(String systolic) { this.systolic = systolic; }
    public String getDiastolic() { return diastolic; }
    public void setDiastolic(String diastolic) { this.diastolic = diastolic; }
}
