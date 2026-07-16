package com.smartcare.backend.entity;

import java.util.List;
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
    private String conclusion;
    private Boolean valid;
    private String inputUserId;
    private String inputUser;
    private List<NurseMeasure> nurseMeasureList;
    private ToleranceScore toleranceScore;
    private CommitSuicideScore commitSuicideScore;

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

    public static class CommitSuicideScore {
        private Boolean senseOfDespair;
        private Boolean depression;
        private Boolean suicideAction;
        private Boolean attemptedSuicide;
        private Boolean recentRelativeDeath;
        private Boolean victimDelusion;
        private Boolean notInterpersonal;
        private Boolean verbalSuicide;
        private Boolean negativeLife;
        private Boolean familyHistoryOfSuicide;
        private Boolean mentalHistory;
        private Boolean widow;
        private Boolean lowStatus;
        private Boolean drinkHistory;
        private Boolean lateStage;
        private Boolean otherSelect;
        public Boolean getSenseOfDespair() { return senseOfDespair; }
        public void setSenseOfDespair(Boolean senseOfDespair) { this.senseOfDespair = senseOfDespair; }
        public Boolean getDepression() { return depression; }
        public void setDepression(Boolean depression) { this.depression = depression; }
        public Boolean getSuicideAction() { return suicideAction; }
        public void setSuicideAction(Boolean suicideAction) { this.suicideAction = suicideAction; }
        public Boolean getAttemptedSuicide() { return attemptedSuicide; }
        public void setAttemptedSuicide(Boolean attemptedSuicide) { this.attemptedSuicide = attemptedSuicide; }
        public Boolean getRecentRelativeDeath() { return recentRelativeDeath; }
        public void setRecentRelativeDeath(Boolean recentRelativeDeath) { this.recentRelativeDeath = recentRelativeDeath; }
        public Boolean getVictimDelusion() { return victimDelusion; }
        public void setVictimDelusion(Boolean victimDelusion) { this.victimDelusion = victimDelusion; }
        public Boolean getNotInterpersonal() { return notInterpersonal; }
        public void setNotInterpersonal(Boolean notInterpersonal) { this.notInterpersonal = notInterpersonal; }
        public Boolean getVerbalSuicide() { return verbalSuicide; }
        public void setVerbalSuicide(Boolean verbalSuicide) { this.verbalSuicide = verbalSuicide; }
        public Boolean getNegativeLife() { return negativeLife; }
        public void setNegativeLife(Boolean negativeLife) { this.negativeLife = negativeLife; }
        public Boolean getFamilyHistoryOfSuicide() { return familyHistoryOfSuicide; }
        public void setFamilyHistoryOfSuicide(Boolean familyHistoryOfSuicide) { this.familyHistoryOfSuicide = familyHistoryOfSuicide; }
        public Boolean getMentalHistory() { return mentalHistory; }
        public void setMentalHistory(Boolean mentalHistory) { this.mentalHistory = mentalHistory; }
        public Boolean getWidow() { return widow; }
        public void setWidow(Boolean widow) { this.widow = widow; }
        public Boolean getLowStatus() { return lowStatus; }
        public void setLowStatus(Boolean lowStatus) { this.lowStatus = lowStatus; }
        public Boolean getDrinkHistory() { return drinkHistory; }
        public void setDrinkHistory(Boolean drinkHistory) { this.drinkHistory = drinkHistory; }
        public Boolean getLateStage() { return lateStage; }
        public void setLateStage(Boolean lateStage) { this.lateStage = lateStage; }
        public Boolean getOtherSelect() { return otherSelect; }
        public void setOtherSelect(Boolean otherSelect) { this.otherSelect = otherSelect; }
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
    public String getConclusion() { return conclusion; }
    public void setConclusion(String conclusion) { this.conclusion = conclusion; }
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
    public CommitSuicideScore getCommitSuicideScore() { return commitSuicideScore; }
    public void setCommitSuicideScore(CommitSuicideScore commitSuicideScore) { this.commitSuicideScore = commitSuicideScore; }
}
