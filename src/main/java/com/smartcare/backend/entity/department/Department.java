package com.smartcare.backend.entity.department;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "department")
public class Department { @Id
private String id;
private String name;

public void setId(String id) { this.id = id; } private String code; private String hospitalName; private String hospitalCode; public void setName(String name) { this.name = name; } public void setCode(String code) { this.code = code; } public void setHospitalName(String hospitalName) { this.hospitalName = hospitalName; } public void setHospitalCode(String hospitalCode) { this.hospitalCode = hospitalCode; } public boolean equals(Object o) { if (o == this) return true;  if (!(o instanceof Department)) return false;  Department other = (Department)o; if (!other.canEqual(this)) return false;  Object this$id = getId(), other$id = other.getId(); if ((this$id == null) ? (other$id != null) : !this$id.equals(other$id)) return false;  Object this$name = getName(), other$name = other.getName(); if ((this$name == null) ? (other$name != null) : !this$name.equals(other$name)) return false;  Object this$code = getCode(), other$code = other.getCode(); if ((this$code == null) ? (other$code != null) : !this$code.equals(other$code)) return false;  Object this$hospitalName = getHospitalName(), other$hospitalName = other.getHospitalName(); if ((this$hospitalName == null) ? (other$hospitalName != null) : !this$hospitalName.equals(other$hospitalName)) return false;  Object this$hospitalCode = getHospitalCode(), other$hospitalCode = other.getHospitalCode(); return !((this$hospitalCode == null) ? (other$hospitalCode != null) : !this$hospitalCode.equals(other$hospitalCode)); } protected boolean canEqual(Object other) { return other instanceof Department; } public int hashCode() { int PRIME = 59; int result = 1; Object $id = getId(); result = result * 59 + (($id == null) ? 43 : $id.hashCode()); Object $name = getName(); result = result * 59 + (($name == null) ? 43 : $name.hashCode()); Object $code = getCode(); result = result * 59 + (($code == null) ? 43 : $code.hashCode()); Object $hospitalName = getHospitalName(); result = result * 59 + (($hospitalName == null) ? 43 : $hospitalName.hashCode()); Object $hospitalCode = getHospitalCode(); return result * 59 + (($hospitalCode == null) ? 43 : $hospitalCode.hashCode()); } public String toString() { return "Department(id=" + getId() + ", name=" + getName() + ", code=" + getCode() + ", hospitalName=" + getHospitalName() + ", hospitalCode=" + getHospitalCode() + ")"; }

public String getId()
{
return this.id;
} public String getName() { return this.name; }
public String getCode() { return this.code; }
public String getHospitalName() { return this.hospitalName; } public String getHospitalCode() {
return this.hospitalCode;
} }

