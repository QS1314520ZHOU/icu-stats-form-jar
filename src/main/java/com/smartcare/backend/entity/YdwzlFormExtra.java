package com.smartcare.backend.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "ydwzl_form_extra")
public class YdwzlFormExtra {
    @Id
    private String id;
    private String formCode;
    private String pid;
    private String recordDate;
    private MonitorModes monitorModes;
    private String coolOther;
    private String warmOther;
    private Boolean valid;
    private String createUser;
    private String createTime;
    private String editUser;
    private String editTime;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getFormCode() { return formCode; }
    public void setFormCode(String formCode) { this.formCode = formCode; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getRecordDate() { return recordDate; }
    public void setRecordDate(String recordDate) { this.recordDate = recordDate; }
    public MonitorModes getMonitorModes() { return monitorModes; }
    public void setMonitorModes(MonitorModes monitorModes) { this.monitorModes = monitorModes; }
    public String getCoolOther() { return coolOther; }
    public void setCoolOther(String coolOther) { this.coolOther = coolOther; }
    public String getWarmOther() { return warmOther; }
    public void setWarmOther(String warmOther) { this.warmOther = warmOther; }
    public Boolean getValid() { return valid; }
    public void setValid(Boolean valid) { this.valid = valid; }
    public String getCreateUser() { return createUser; }
    public void setCreateUser(String createUser) { this.createUser = createUser; }
    public String getCreateTime() { return createTime; }
    public void setCreateTime(String createTime) { this.createTime = createTime; }
    public String getEditUser() { return editUser; }
    public void setEditUser(String editUser) { this.editUser = editUser; }
    public String getEditTime() { return editTime; }
    public void setEditTime(String editTime) { this.editTime = editTime; }

    /** 体温监测方式（强类型对象，与 Angular 前端结构一致） */
    public static class MonitorModes {
        private Boolean anal;
        private Boolean bladder;
        private Boolean blood;
        private Boolean axillary;
        public Boolean getAnal() { return anal; }
        public void setAnal(Boolean anal) { this.anal = anal; }
        public Boolean getBladder() { return bladder; }
        public void setBladder(Boolean bladder) { this.bladder = bladder; }
        public Boolean getBlood() { return blood; }
        public void setBlood(Boolean blood) { this.blood = blood; }
        public Boolean getAxillary() { return axillary; }
        public void setAxillary(Boolean axillary) { this.axillary = axillary; }
    }
}
