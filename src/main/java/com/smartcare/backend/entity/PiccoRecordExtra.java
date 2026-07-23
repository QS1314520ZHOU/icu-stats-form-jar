package com.smartcare.backend.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection="picco_record_extra")
public class PiccoRecordExtra {
 @Id private String id;
 private String pid;
 private String insertionSide;
 private String arteryName;
 private Double catheterLengthCm;
 private Boolean valid;
 private String updatedBy;
 private String updatedAt;
 public String getId(){return id;} public void setId(String v){id=v;}
 public String getPid(){return pid;} public void setPid(String v){pid=v;}
 public String getInsertionSide(){return insertionSide;} public void setInsertionSide(String v){insertionSide=v;}
 public String getArteryName(){return arteryName;} public void setArteryName(String v){arteryName=v;}
 public Double getCatheterLengthCm(){return catheterLengthCm;} public void setCatheterLengthCm(Double v){catheterLengthCm=v;}
 public Boolean getValid(){return valid;} public void setValid(Boolean v){valid=v;}
 public String getUpdatedBy(){return updatedBy;} public void setUpdatedBy(String v){updatedBy=v;}
 public String getUpdatedAt(){return updatedAt;} public void setUpdatedAt(String v){updatedAt=v;}
}
