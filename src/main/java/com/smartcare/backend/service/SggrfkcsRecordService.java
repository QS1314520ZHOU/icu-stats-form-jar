package com.smartcare.backend.service;

import com.smartcare.backend.entity.SggrfkcsRecord;
import com.smartcare.backend.repository.SggrfkcsRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;

@Service
public class SggrfkcsRecordService {
    private final SggrfkcsRecordRepository repository;

    public SggrfkcsRecordService(SggrfkcsRecordRepository repository) {
        this.repository = repository;
    }

    public List<SggrfkcsRecord> listValid(String pid) {
        if (!StringUtils.hasText(pid)) throw new IllegalArgumentException("pid不能为空");
        return repository.findByPidAndValidOrderByRecordDateAsc(pid.trim(), true);
    }

    public SggrfkcsRecord save(SggrfkcsRecord input) {
        if (!StringUtils.hasText(input.getPid())) throw new IllegalArgumentException("pid不能为空");
        if (!StringUtils.hasText(input.getRecordDate())) throw new IllegalArgumentException("日期不能为空");
        if (!StringUtils.hasText(input.getNurseName())) throw new IllegalArgumentException("护士签名不能为空");

        Instant now = Instant.now();
        if (StringUtils.hasText(input.getId())) {
            SggrfkcsRecord existing = repository.findById(input.getId())
                .orElseThrow(() -> new IllegalArgumentException("记录不存在"));
            if (Boolean.FALSE.equals(existing.getValid())) throw new IllegalArgumentException("记录已删除");
            if (!existing.getPid().equals(input.getPid())) throw new IllegalArgumentException("禁止修改患者归属");

            existing.setRecordDate(input.getRecordDate());
            existing.setMeasures(input.getMeasures() != null ? input.getMeasures() : new java.util.HashMap<>());
            existing.setDoctorName(input.getDoctorName());
            existing.setNurseId(input.getNurseId());
            existing.setNurseName(input.getNurseName());
            existing.setInspectorName(input.getInspectorName());
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
        SggrfkcsRecord record = repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("记录不存在"));
        record.setValid(false);
        record.setUpdatedAt(Instant.now());
        record.setUpdatedBy(operatorId);
        repository.save(record);
    }
}
