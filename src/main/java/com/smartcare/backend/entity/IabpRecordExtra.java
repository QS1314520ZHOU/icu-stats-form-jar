package com.smartcare.backend.entity;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
@Document(collection="iabp_record_extra")
public class IabpRecordExtra{
 @Id private String id;private String pid;private String insertionSite;private String otherArtery;private Double catheterLengthCm;private Boolean valid;private String updatedBy;private String updatedAt;
 public String getId(){return id;}public void setId(String v){id=v;}public String getPid(){return pid;}public void setPid(String v){pid=v;}public String getInsertionSite(){return insertionSite;}public void setInsertionSite(String v){insertionSite=v;}public String getOtherArtery(){return otherArtery;}public void setOtherArtery(String v){otherArtery=v;}public Double getCatheterLengthCm(){return catheterLengthCm;}public void setCatheterLengthCm(Double v){catheterLengthCm=v;}public Boolean getValid(){return valid;}public void setValid(Boolean v){valid=v;}public String getUpdatedBy(){return updatedBy;}public void setUpdatedBy(String v){updatedBy=v;}public String getUpdatedAt(){return updatedAt;}public void setUpdatedAt(String v){updatedAt=v;}
}
