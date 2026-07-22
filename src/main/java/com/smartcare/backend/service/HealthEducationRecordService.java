package com.smartcare.backend.service;

import com.smartcare.backend.entity.HealthEducationRecord;
import com.smartcare.backend.repository.HealthEducationRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;

@Service
public class HealthEducationRecordService {
    private final HealthEducationRecordRepository repository;

    public HealthEducationRecordService(HealthEducationRecordRepository repository) {
        this.repository = repository;
    }

    public List<HealthEducationRecord> listValid(String pid) {
        if (!StringUtils.hasText(pid)) throw new IllegalArgumentException("pid不能为空");
        return repository.findByPidAndValidOrderByAssessmentTimeAsc(pid.trim(), true);
    }

    public HealthEducationRecord save(HealthEducationRecord input) {
        if (!StringUtils.hasText(input.getPid())) throw new IllegalArgumentException("pid不能为空");
        if (input.getAssessmentTime() == null) throw new IllegalArgumentException("评估时间不能为空");
        if (!StringUtils.hasText(input.getNurseName())) throw new IllegalArgumentException("护士签名不能为空");

        Instant now = Instant.now();
        if (StringUtils.hasText(input.getId())) {
            HealthEducationRecord existing = repository.findById(input.getId())
                .orElseThrow(() -> new IllegalArgumentException("记录不存在"));
            if (Boolean.FALSE.equals(existing.getValid())) throw new IllegalArgumentException("记录已删除");
            if (!existing.getPid().equals(input.getPid())) throw new IllegalArgumentException("禁止修改患者归属");

            existing.setAssessmentTime(input.getAssessmentTime());
            existing.setItemCodes(input.getItemCodes());
            existing.setEducationTarget(input.getEducationTarget());
            existing.setEvaluationCodes(input.getEvaluationCodes());
            existing.setNurseId(input.getNurseId());
            existing.setNurseName(input.getNurseName());
            existing.setSpecialMedicationOther(input.getSpecialMedicationOther());
            existing.setExternalExamOther(input.getExternalExamOther());
            existing.setInternalExamOther(input.getInternalExamOther());
            existing.setOtherEducation(input.getOtherEducation());
            existing.setDischargeEducation(input.getDischargeEducation());
            existing.setTransferEducation(input.getTransferEducation());
            existing.setValuableCodes(input.getValuableCodes());
            existing.setValuableOther(input.getValuableOther());
            existing.setReceiverConfirmed(input.getReceiverConfirmed());
            existing.setReceiverName(input.getReceiverName());
            existing.setReceivedAt(input.getReceivedAt());
            existing.setUpdatedAt(now);
            existing.setUpdatedBy(input.getUpdatedBy());
            return repository.save(existing);
        } else {
            input.setId(null);
            input.setValid(true);
            input.setCreatedAt(now);
            input.setCreatedBy(input.getUpdatedBy());
            input.setUpdatedAt(now);
            return repository.save(input);
        }
    }

    public void invalidate(String id, String operatorId) {
        HealthEducationRecord record = repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("记录不存在"));
        record.setValid(false);
        record.setUpdatedAt(Instant.now());
        record.setUpdatedBy(operatorId);
        repository.save(record);
    }
}
