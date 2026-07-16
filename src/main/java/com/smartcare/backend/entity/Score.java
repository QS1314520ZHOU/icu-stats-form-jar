package com.smartcare.backend.entity;

import java.util.List;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "score")
public class Score {
    @Id
    private String id;
    private String pid;
    private String time;
    private String scoreType;
    private Integer total;
    private Boolean valid;
    private String inputUserId;
    private String inputUser;
    private List<NurseMeasure> nurseMeasureList;
    private ToleranceScore toleranceScore;

    public static class NurseMeasure {
        private String code;
        private Boolean value;
        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public Boolean getValue() { return value; }
        public void setValue(Boolean value) { this.value = value; }
    }

    public static class ToleranceScore {
        private Integer nausea;
        private Integer diarrhea;
        private Integer bellySerious;
        private Object yySpeed;
        public Integer getNausea() { return nausea; }
        public void setNausea(Integer nausea) { this.nausea = nausea; }
        public Integer getDiarrhea() { return diarrhea; }
        public void setDiarrhea(Integer diarrhea) { this.diarrhea = diarrhea; }
        public Integer getBellySerious() { return bellySerious; }
        public void setBellySerious(Integer bellySerious) { this.bellySerious = bellySerious; }
        public Object getYySpeed() { return yySpeed; }
        public void setYySpeed(Object yySpeed) { this.yySpeed = yySpeed; }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }
    public String getScoreType() { return scoreType; }
    public void setScoreType(String scoreType) { this.scoreType = scoreType; }
    public Integer getTotal() { return total; }
    public void setTotal(Integer total) { this.total = total; }
    public Boolean getValid() { return valid; }
    public void setValid(Boolean valid) { this.valid = valid; }
    public String getInputUserId() { return inputUserId; }
    public void setInputUserId(String inputUserId) { this.inputUserId = inputUserId; }
    public String getInputUser() { return inputUser; }
    public void setInputUser(String inputUser) { this.inputUser = inputUser; }
    public List<NurseMeasure> getNurseMeasureList() { return nurseMeasureList; }
    public void setNurseMeasureList(List<NurseMeasure> nurseMeasureList) { this.nurseMeasureList = nurseMeasureList; }
    public ToleranceScore getToleranceScore() { return toleranceScore; }
    public void setToleranceScore(ToleranceScore toleranceScore) { this.toleranceScore = toleranceScore; }
}
