package com.smartcare.backend.entity;

import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "ydwzl_form_extra")
public class YdwzlFormExtra {
    @Id
    private String id;
    private String formCode;
    private String pid;
    private String recordDate;
    private List<MonitorMode> monitorModes;
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
    public List<MonitorMode> getMonitorModes() { return monitorModes; }
    public void setMonitorModes(List<MonitorMode> monitorModes) { this.monitorModes = monitorModes; }
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

    public static class MonitorMode {
        private String key;
        private Boolean checked;
        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }
        public Boolean getChecked() { return checked; }
        public void setChecked(Boolean checked) { this.checked = checked; }
    }
}
