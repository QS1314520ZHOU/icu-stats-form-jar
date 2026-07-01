package com.smartcare.backend.entity.patient;


import java.util.List;
import java.util.Date;

public class DiagnosisHistory {
private Date time;
private String editor;

public void setTime(Date time) { this.time = time; } private String editorId; private String diagnosis; private List<String> diagnosisCodeList; public void setEditor(String editor) { this.editor = editor; } public void setEditorId(String editorId) { this.editorId = editorId; } public void setDiagnosis(String diagnosis) { this.diagnosis = diagnosis; } public void setDiagnosisCodeList(List<String> diagnosisCodeList) { this.diagnosisCodeList = diagnosisCodeList; } public boolean equals(Object o) { if (o == this) return true;  if (!(o instanceof DiagnosisHistory)) return false;  DiagnosisHistory other = (DiagnosisHistory)o; if (!other.canEqual(this)) return false;  Object this$time = getTime(), other$time = other.getTime(); if ((this$time == null) ? (other$time != null) : !this$time.equals(other$time)) return false;  Object this$editor = getEditor(), other$editor = other.getEditor(); if ((this$editor == null) ? (other$editor != null) : !this$editor.equals(other$editor)) return false;  Object this$editorId = getEditorId(), other$editorId = other.getEditorId(); if ((this$editorId == null) ? (other$editorId != null) : !this$editorId.equals(other$editorId)) return false;  Object this$diagnosis = getDiagnosis(), other$diagnosis = other.getDiagnosis(); if ((this$diagnosis == null) ? (other$diagnosis != null) : !this$diagnosis.equals(other$diagnosis)) return false;  List<String> this$diagnosisCodeList = (List<String>)getDiagnosisCodeList(), other$diagnosisCodeList = (List<String>)other.getDiagnosisCodeList(); return !((this$diagnosisCodeList == null) ? (other$diagnosisCodeList != null) : !this$diagnosisCodeList.equals(other$diagnosisCodeList)); } protected boolean canEqual(Object other) { return other instanceof DiagnosisHistory; } public int hashCode() { int PRIME = 59; int result = 1; Object $time = getTime(); result = result * 59 + (($time == null) ? 43 : $time.hashCode()); Object $editor = getEditor(); result = result * 59 + (($editor == null) ? 43 : $editor.hashCode()); Object $editorId = getEditorId(); result = result * 59 + (($editorId == null) ? 43 : $editorId.hashCode()); Object $diagnosis = getDiagnosis(); result = result * 59 + (($diagnosis == null) ? 43 : $diagnosis.hashCode()); List<String> $diagnosisCodeList = (List<String>)getDiagnosisCodeList(); return result * 59 + (($diagnosisCodeList == null) ? 43 : $diagnosisCodeList.hashCode()); } public String toString() { return "DiagnosisHistory(time=" + getTime() + ", editor=" + getEditor() + ", editorId=" + getEditorId() + ", diagnosis=" + getDiagnosis() + ", diagnosisCodeList=" + getDiagnosisCodeList() + ")"; }
public Date getTime() {
return this.time;
} public String getEditor() {
return this.editor;
} public String getEditorId() {
return this.editorId;
} public String getDiagnosis() {
return this.diagnosis;
} public List<String> getDiagnosisCodeList() {
return this.diagnosisCodeList;
}
}

