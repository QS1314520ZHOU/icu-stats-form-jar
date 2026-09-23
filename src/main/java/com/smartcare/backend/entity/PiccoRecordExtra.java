package com.smartcare.backend.entity;

import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection="picco_record_extra")
public class PiccoRecordExtra {
 @Id private String id;
 private String pid;
 private String insertionSide;
 private String arteryName;
 private Object catheterLengthCm;
 private String heightCm;
 private String weightKg;
 private List<ColumnSignature> signatures;
 private Boolean valid;
 private String updatedBy;
 private String updatedAt;
 public String getId(){return id;} public void setId(String v){id=v;}
 public String getPid(){return pid;} public void setPid(String v){pid=v;}
 public String getInsertionSide(){return insertionSide;} public void setInsertionSide(String v){insertionSide=v;}
 public String getArteryName(){return arteryName;} public void setArteryName(String v){arteryName=v;}
 public String getCatheterLengthCm(){return catheterLengthCm==null?null:String.valueOf(catheterLengthCm);} public void setCatheterLengthCm(Object v){catheterLengthCm=v;}
 public String getHeightCm(){return heightCm;} public void setHeightCm(String v){heightCm=v;}
 public String getWeightKg(){return weightKg;} public void setWeightKg(String v){weightKg=v;}
 public List<ColumnSignature> getSignatures(){return signatures;} public void setSignatures(List<ColumnSignature> v){signatures=v;}
 public Boolean getValid(){return valid;} public void setValid(Boolean v){valid=v;}
 public String getUpdatedBy(){return updatedBy;} public void setUpdatedBy(String v){updatedBy=v;}
 public String getUpdatedAt(){return updatedAt;} public void setUpdatedAt(String v){updatedAt=v;}

 public static class ColumnSignature {
  private String timeKey;
  private String accountId;
  private String accountName;
  public String getTimeKey(){return timeKey;} public void setTimeKey(String v){timeKey=v;}
  public String getAccountId(){return accountId;} public void setAccountId(String v){accountId=v;}
  public String getAccountName(){return accountName;} public void setAccountName(String v){accountName=v;}
 }
}
