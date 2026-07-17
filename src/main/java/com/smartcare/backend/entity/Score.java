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
    private String remarks;
    private List<NurseMeasure> nurseMeasureList;
    private ToleranceScore toleranceScore;
    private CommitSuicideScore commitSuicideScore;
    private IncontinenceScore incontinenceScore;
    private SelfCareAbility selfCareAbility;
    private PatientFallDangerFactorV2 patientFallDangerFactorV2;

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

    public static class IncontinenceScore {
        private Integer iad;
        private Integer irritantType;
        private Integer stimulationTime;
        private Integer perineum;
        private Integer influenceFactor;
        public Integer getIad() { return iad; }
        public void setIad(Integer iad) { this.iad = iad; }
        public Integer getIrritantType() { return irritantType; }
        public void setIrritantType(Integer irritantType) { this.irritantType = irritantType; }
        public Integer getStimulationTime() { return stimulationTime; }
        public void setStimulationTime(Integer stimulationTime) { this.stimulationTime = stimulationTime; }
        public Integer getPerineum() { return perineum; }
        public void setPerineum(Integer perineum) { this.perineum = perineum; }
        public Integer getInfluenceFactor() { return influenceFactor; }
        public void setInfluenceFactor(Integer influenceFactor) { this.influenceFactor = influenceFactor; }
    }

    public static class SelfCareAbility {
        private Integer eat;
        private Integer shower;
        private Integer modification;
        private Integer dressing;
        private Integer defecationControl;
        private Integer controllingUrination;
        private Integer toilet;
        private Integer bedChairTransfer;
        private Integer walk;
        private Integer upAndDownStairs;
        public Integer getEat() { return eat; }
        public void setEat(Integer eat) { this.eat = eat; }
        public Integer getShower() { return shower; }
        public void setShower(Integer shower) { this.shower = shower; }
        public Integer getModification() { return modification; }
        public void setModification(Integer modification) { this.modification = modification; }
        public Integer getDressing() { return dressing; }
        public void setDressing(Integer dressing) { this.dressing = dressing; }
        public Integer getDefecationControl() { return defecationControl; }
        public void setDefecationControl(Integer defecationControl) { this.defecationControl = defecationControl; }
        public Integer getControllingUrination() { return controllingUrination; }
        public void setControllingUrination(Integer controllingUrination) { this.controllingUrination = controllingUrination; }
        public Integer getToilet() { return toilet; }
        public void setToilet(Integer toilet) { this.toilet = toilet; }
        public Integer getBedChairTransfer() { return bedChairTransfer; }
        public void setBedChairTransfer(Integer bedChairTransfer) { this.bedChairTransfer = bedChairTransfer; }
        public Integer getWalk() { return walk; }
        public void setWalk(Integer walk) { this.walk = walk; }
        public Integer getUpAndDownStairs() { return upAndDownStairs; }
        public void setUpAndDownStairs(Integer upAndDownStairs) { this.upAndDownStairs = upAndDownStairs; }
    }

    public static class PatientFallDangerFactorV2 {
        private Integer fallHistory;
        private Integer otherDiagnosis;
        private Integer useWalkTool;
        private Integer intravenousInjection;
        private Integer walk;
        private Integer mentality;
        private Boolean age;
        private Boolean preHospitalization;
        private Boolean exist;
        private Boolean sixHours;
        private Boolean thisHospitalization;
        private Boolean hunmiOntanhaun;
        private Boolean sylzys;
        public Integer getFallHistory() { return fallHistory; }
        public void setFallHistory(Integer fallHistory) { this.fallHistory = fallHistory; }
        public Integer getOtherDiagnosis() { return otherDiagnosis; }
        public void setOtherDiagnosis(Integer otherDiagnosis) { this.otherDiagnosis = otherDiagnosis; }
        public Integer getUseWalkTool() { return useWalkTool; }
        public void setUseWalkTool(Integer useWalkTool) { this.useWalkTool = useWalkTool; }
        public Integer getIntravenousInjection() { return intravenousInjection; }
        public void setIntravenousInjection(Integer intravenousInjection) { this.intravenousInjection = intravenousInjection; }
        public Integer getWalk() { return walk; }
        public void setWalk(Integer walk) { this.walk = walk; }
        public Integer getMentality() { return mentality; }
        public void setMentality(Integer mentality) { this.mentality = mentality; }
        public Boolean getAge() { return age; }
        public void setAge(Boolean age) { this.age = age; }
        public Boolean getPreHospitalization() { return preHospitalization; }
        public void setPreHospitalization(Boolean preHospitalization) { this.preHospitalization = preHospitalization; }
        public Boolean getExist() { return exist; }
        public void setExist(Boolean exist) { this.exist = exist; }
        public Boolean getSixHours() { return sixHours; }
        public void setSixHours(Boolean sixHours) { this.sixHours = sixHours; }
        public Boolean getThisHospitalization() { return thisHospitalization; }
        public void setThisHospitalization(Boolean thisHospitalization) { this.thisHospitalization = thisHospitalization; }
        public Boolean getHunmiOntanhaun() { return hunmiOntanhaun; }
        public void setHunmiOntanhaun(Boolean hunmiOntanhaun) { this.hunmiOntanhaun = hunmiOntanhaun; }
        public Boolean getSylzys() { return sylzys; }
        public void setSylzys(Boolean sylzys) { this.sylzys = sylzys; }
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
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
    public IncontinenceScore getIncontinenceScore() { return incontinenceScore; }
    public void setIncontinenceScore(IncontinenceScore incontinenceScore) { this.incontinenceScore = incontinenceScore; }
    public SelfCareAbility getSelfCareAbility() { return selfCareAbility; }
    public void setSelfCareAbility(SelfCareAbility selfCareAbility) { this.selfCareAbility = selfCareAbility; }
    public PatientFallDangerFactorV2 getPatientFallDangerFactorV2() { return patientFallDangerFactorV2; }
    public void setPatientFallDangerFactorV2(PatientFallDangerFactorV2 patientFallDangerFactorV2) { this.patientFallDangerFactorV2 = patientFallDangerFactorV2; }
}
