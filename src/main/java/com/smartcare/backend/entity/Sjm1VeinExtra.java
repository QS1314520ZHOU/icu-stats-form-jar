package com.smartcare.backend.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "sjm1_vein_maintenance_extra")
public class Sjm1VeinExtra {
    @Id
    private String id;
    private String pid;
    private String tubeId;
    private Boolean cvcChecked;
    private Boolean isInHospital;
    private Boolean isOutHospital;
    private String otherText;
    private String updateTime;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getTubeId() { return tubeId; }
    public void setTubeId(String tubeId) { this.tubeId = tubeId; }
    public Boolean getCvcChecked() { return cvcChecked; }
    public void setCvcChecked(Boolean cvcChecked) { this.cvcChecked = cvcChecked; }
    public Boolean getIsInHospital() { return isInHospital; }
    public void setIsInHospital(Boolean isInHospital) { this.isInHospital = isInHospital; }
    public Boolean getIsOutHospital() { return isOutHospital; }
    public void setIsOutHospital(Boolean isOutHospital) { this.isOutHospital = isOutHospital; }
    public String getOtherText() { return otherText; }
    public void setOtherText(String otherText) { this.otherText = otherText; }
    public String getUpdateTime() { return updateTime; }
    public void setUpdateTime(String updateTime) { this.updateTime = updateTime; }
}
