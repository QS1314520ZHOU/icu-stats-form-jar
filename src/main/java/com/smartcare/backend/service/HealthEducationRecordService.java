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
            HealthEducationRecord old = repository.findById(input.getId())
                .orElseThrow(() -> new IllegalArgumentException("记录不存在"));
            if (Boolean.FALSE.equals(old.getValid())) throw new IllegalArgumentException("记录已删除");
            if (!old.getPid().equals(input.getPid())) throw new IllegalArgumentException("禁止修改患者归属");
            input.setCreatedAt(old.getCreatedAt());
            input.setCreatedBy(old.getCreatedBy());
        } else {
            input.setId(null);
            input.setCreatedAt(now);
            input.setCreatedBy(input.getUpdatedBy());
        }
        input.setValid(true);
        input.setUpdatedAt(now);
        return repository.save(input);
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
