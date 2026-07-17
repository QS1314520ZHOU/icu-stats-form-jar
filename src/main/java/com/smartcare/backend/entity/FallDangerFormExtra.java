package com.smartcare.backend.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "fallDangerFormExtra")
public class FallDangerFormExtra {
    @Id
    private String id;
    private String pid;
    private String formCode;
    private String auditorId;
    private String auditorName;
    private String result;
    private String resultDate;
    private String fell;
    private Boolean valid;
    private String createUser;
    private String createTime;
    private String editTime;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getFormCode() { return formCode; }
    public void setFormCode(String formCode) { this.formCode = formCode; }
    public String getAuditorId() { return auditorId; }
    public void setAuditorId(String auditorId) { this.auditorId = auditorId; }
    public String getAuditorName() { return auditorName; }
    public void setAuditorName(String auditorName) { this.auditorName = auditorName; }
    public String getResult() { return result; }
    public void setResult(String result) { this.result = result; }
    public String getResultDate() { return resultDate; }
    public void setResultDate(String resultDate) { this.resultDate = resultDate; }
    public String getFell() { return fell; }
    public void setFell(String fell) { this.fell = fell; }
    public Boolean getValid() { return valid; }
    public void setValid(Boolean valid) { this.valid = valid; }
    public String getCreateUser() { return createUser; }
    public void setCreateUser(String createUser) { this.createUser = createUser; }
    public String getCreateTime() { return createTime; }
    public void setCreateTime(String createTime) { this.createTime = createTime; }
    public String getEditTime() { return editTime; }
    public void setEditTime(String editTime) { this.editTime = editTime; }
}
