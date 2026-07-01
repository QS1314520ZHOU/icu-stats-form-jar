package com.smartcare.backend.entity.config;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("configBed")
public class ConfigBed { private String id;
private String hisName;
private String showName;

public void setId(String id) { this.id = id; } private String centralName; private String printName; private String deptCode; public void setHisName(String hisName) { this.hisName = hisName; } public void setShowName(String showName) { this.showName = showName; } public void setCentralName(String centralName) { this.centralName = centralName; } public void setPrintName(String printName) { this.printName = printName; } public void setDeptCode(String deptCode) { this.deptCode = deptCode; } public boolean equals(Object o) { if (o == this) return true;  if (!(o instanceof ConfigBed)) return false;  ConfigBed other = (ConfigBed)o; if (!other.canEqual(this)) return false;  Object this$id = getId(), other$id = other.getId(); if ((this$id == null) ? (other$id != null) : !this$id.equals(other$id)) return false;  Object this$hisName = getHisName(), other$hisName = other.getHisName(); if ((this$hisName == null) ? (other$hisName != null) : !this$hisName.equals(other$hisName)) return false;  Object this$showName = getShowName(), other$showName = other.getShowName(); if ((this$showName == null) ? (other$showName != null) : !this$showName.equals(other$showName)) return false;  Object this$centralName = getCentralName(), other$centralName = other.getCentralName(); if ((this$centralName == null) ? (other$centralName != null) : !this$centralName.equals(other$centralName)) return false;  Object this$printName = getPrintName(), other$printName = other.getPrintName(); if ((this$printName == null) ? (other$printName != null) : !this$printName.equals(other$printName)) return false;  Object this$deptCode = getDeptCode(), other$deptCode = other.getDeptCode(); return !((this$deptCode == null) ? (other$deptCode != null) : !this$deptCode.equals(other$deptCode)); } protected boolean canEqual(Object other) { return other instanceof ConfigBed; } public int hashCode() { int PRIME = 59; int result = 1; Object $id = getId(); result = result * 59 + (($id == null) ? 43 : $id.hashCode()); Object $hisName = getHisName(); result = result * 59 + (($hisName == null) ? 43 : $hisName.hashCode()); Object $showName = getShowName(); result = result * 59 + (($showName == null) ? 43 : $showName.hashCode()); Object $centralName = getCentralName(); result = result * 59 + (($centralName == null) ? 43 : $centralName.hashCode()); Object $printName = getPrintName(); result = result * 59 + (($printName == null) ? 43 : $printName.hashCode()); Object $deptCode = getDeptCode(); return result * 59 + (($deptCode == null) ? 43 : $deptCode.hashCode()); } public String toString() { return "ConfigBed(id=" + getId() + ", hisName=" + getHisName() + ", showName=" + getShowName() + ", centralName=" + getCentralName() + ", printName=" + getPrintName() + ", deptCode=" + getDeptCode() + ")"; }

public String getId() { return this.id; }
public String getHisName() { return this.hisName; }
public String getShowName() { return this.showName; }
public String getCentralName() { return this.centralName; }
public String getPrintName() { return this.printName; } public String getDeptCode() {
return this.deptCode;
} }

