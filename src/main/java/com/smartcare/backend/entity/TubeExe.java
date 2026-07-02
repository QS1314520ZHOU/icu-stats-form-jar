package com.smartcare.backend.entity;

import java.util.Date;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "tubeExe")
public class TubeExe {
    @Id
    private String id;
    private String pid;
    private String type;
    private String body;
    private String tubeLocation;
    private Date startTime;
    private List<TubeRecord> tubeRecordList;
    private Boolean valid;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getTubeLocation() { return tubeLocation; }
    public void setTubeLocation(String tubeLocation) { this.tubeLocation = tubeLocation; }
    public Date getStartTime() { return startTime; }
    public void setStartTime(Date startTime) { this.startTime = startTime; }
    public List<TubeRecord> getTubeRecordList() { return tubeRecordList; }
    public void setTubeRecordList(List<TubeRecord> tubeRecordList) { this.tubeRecordList = tubeRecordList; }
    public Boolean getValid() { return valid; }
    public void setValid(Boolean valid) { this.valid = valid; }

    public static class TubeRecord {
        private Date time;
        private String insertLength;
        private String dressing;
        private String catheterCulture;
        private String exposureLength;
        private String bloodLevel;
        private String waterWave;
        private String infect;
        private String h_situation;
        private String other;
        private String recordUserName;
        private Boolean valid;

        public Date getTime() { return time; }
        public void setTime(Date time) { this.time = time; }
        public String getInsertLength() { return insertLength; }
        public void setInsertLength(String insertLength) { this.insertLength = insertLength; }
        public String getDressing() { return dressing; }
        public void setDressing(String dressing) { this.dressing = dressing; }
        public String getCatheterCulture() { return catheterCulture; }
        public void setCatheterCulture(String catheterCulture) { this.catheterCulture = catheterCulture; }
        public String getExposureLength() { return exposureLength; }
        public void setExposureLength(String exposureLength) { this.exposureLength = exposureLength; }
        public String getBloodLevel() { return bloodLevel; }
        public void setBloodLevel(String bloodLevel) { this.bloodLevel = bloodLevel; }
        public String getWaterWave() { return waterWave; }
        public void setWaterWave(String waterWave) { this.waterWave = waterWave; }
        public String getInfect() { return infect; }
        public void setInfect(String infect) { this.infect = infect; }
        public String getH_situation() { return h_situation; }
        public void setH_situation(String h_situation) { this.h_situation = h_situation; }
        public String getOther() { return other; }
        public void setOther(String other) { this.other = other; }
        public String getRecordUserName() { return recordUserName; }
        public void setRecordUserName(String recordUserName) { this.recordUserName = recordUserName; }
        public Boolean getValid() { return valid; }
        public void setValid(Boolean valid) { this.valid = valid; }
    }
}
