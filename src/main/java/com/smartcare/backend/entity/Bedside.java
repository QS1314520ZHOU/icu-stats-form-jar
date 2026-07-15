package com.smartcare.backend.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "bedside")
public class Bedside {
    @Id
    private String id;
    private String pid;
    private String code;
    private String time;
    private String strVal;
    private Boolean valid;
    private String editUser;
    private String editTime;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }
    public String getStrVal() { return strVal; }
    public void setStrVal(String strVal) { this.strVal = strVal; }
    public Boolean getValid() { return valid; }
    public void setValid(Boolean valid) { this.valid = valid; }
    public String getEditUser() { return editUser; }
    public void setEditUser(String editUser) { this.editUser = editUser; }
    public String getEditTime() { return editTime; }
    public void setEditTime(String editTime) { this.editTime = editTime; }
}
