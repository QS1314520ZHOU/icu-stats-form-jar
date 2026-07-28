package com.smartcare.backend.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Version;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;
import java.util.List;

@Document(collection = "crrt_order_form")
@CompoundIndex(name = "pid_orderTime_idx", def = "{'pid': 1, 'orderTime': -1}")
public class CrrtOrderFormRecord {
    @Id
    private String id;
    @Indexed
    private String pid;
    private String patientName;
    private String bedNo;
    private String age;
    private String hospitalNo;
    private String diagnosis;
    private String orderTime;

    private List<String> vascularAccess;
    private List<String> treatmentModes;
    private List<String> machineConsumables;

    private Object anticoagulation;
    private Object cbpDose;
    private Object replacementFormulaA;
    private Object dialysateFormulaA;
    private Object treatmentPlan;

    private Object doctorSignature;
    private Object machineNurseSignature;
    private Object checkNurseSignature;

    private List<Object> replacementPrescriptions;
    private List<Object> dialysatePrescriptions;
    private List<Object> orderItems;

    @Version
    private Long version;
    private String createdBy;
    private Instant createdAt;
    private String updatedBy;
    private Instant updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getPatientName() { return patientName; }
    public void setPatientName(String patientName) { this.patientName = patientName; }
    public String getBedNo() { return bedNo; }
    public void setBedNo(String bedNo) { this.bedNo = bedNo; }
    public String getAge() { return age; }
    public void setAge(String age) { this.age = age; }
    public String getHospitalNo() { return hospitalNo; }
    public void setHospitalNo(String hospitalNo) { this.hospitalNo = hospitalNo; }
    public String getDiagnosis() { return diagnosis; }
    public void setDiagnosis(String diagnosis) { this.diagnosis = diagnosis; }
    public String getOrderTime() { return orderTime; }
    public void setOrderTime(String orderTime) { this.orderTime = orderTime; }
    public List<String> getVascularAccess() { return vascularAccess; }
    public void setVascularAccess(List<String> vascularAccess) { this.vascularAccess = vascularAccess; }
    public List<String> getTreatmentModes() { return treatmentModes; }
    public void setTreatmentModes(List<String> treatmentModes) { this.treatmentModes = treatmentModes; }
    public List<String> getMachineConsumables() { return machineConsumables; }
    public void setMachineConsumables(List<String> machineConsumables) { this.machineConsumables = machineConsumables; }
    public Object getAnticoagulation() { return anticoagulation; }
    public void setAnticoagulation(Object anticoagulation) { this.anticoagulation = anticoagulation; }
    public Object getCbpDose() { return cbpDose; }
    public void setCbpDose(Object cbpDose) { this.cbpDose = cbpDose; }
    public Object getReplacementFormulaA() { return replacementFormulaA; }
    public void setReplacementFormulaA(Object replacementFormulaA) { this.replacementFormulaA = replacementFormulaA; }
    public Object getDialysateFormulaA() { return dialysateFormulaA; }
    public void setDialysateFormulaA(Object dialysateFormulaA) { this.dialysateFormulaA = dialysateFormulaA; }
    public Object getTreatmentPlan() { return treatmentPlan; }
    public void setTreatmentPlan(Object treatmentPlan) { this.treatmentPlan = treatmentPlan; }
    public Object getDoctorSignature() { return doctorSignature; }
    public void setDoctorSignature(Object doctorSignature) { this.doctorSignature = doctorSignature; }
    public Object getMachineNurseSignature() { return machineNurseSignature; }
    public void setMachineNurseSignature(Object machineNurseSignature) { this.machineNurseSignature = machineNurseSignature; }
    public Object getCheckNurseSignature() { return checkNurseSignature; }
    public void setCheckNurseSignature(Object checkNurseSignature) { this.checkNurseSignature = checkNurseSignature; }
    public List<Object> getReplacementPrescriptions() { return replacementPrescriptions; }
    public void setReplacementPrescriptions(List<Object> replacementPrescriptions) { this.replacementPrescriptions = replacementPrescriptions; }
    public List<Object> getDialysatePrescriptions() { return dialysatePrescriptions; }
    public void setDialysatePrescriptions(List<Object> dialysatePrescriptions) { this.dialysatePrescriptions = dialysatePrescriptions; }
    public List<Object> getOrderItems() { return orderItems; }
    public void setOrderItems(List<Object> orderItems) { this.orderItems = orderItems; }
    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
