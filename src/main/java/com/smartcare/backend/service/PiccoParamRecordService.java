package com.smartcare.backend.service;

import com.smartcare.backend.entity.PiccoParamRecord;
import com.smartcare.backend.repository.PiccoParamRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class PiccoParamRecordService {
    private final PiccoParamRecordRepository repository;

    public PiccoParamRecordService(PiccoParamRecordRepository repository) {
        this.repository = repository;
    }

    public List<PiccoParamRecord> listValid(String pid) {
        if (!StringUtils.hasText(pid)) throw new IllegalArgumentException("pid不能为空");
        return repository.findByPidAndValidOrderByRecordTimeAsc(pid.trim(), true);
    }

    public PiccoParamRecord save(PiccoParamRecord input) {
        if (!StringUtils.hasText(input.getPid())) throw new IllegalArgumentException("pid不能为空");
        if (input.getRecordTime() == null) throw new IllegalArgumentException("记录时间不能为空");
        if (input.getValues() == null || input.getValues().isEmpty()) throw new IllegalArgumentException("请至少录入一项参数值");

        Instant now = Instant.now();
        if (StringUtils.hasText(input.getId())) {
            PiccoParamRecord existing = repository.findById(input.getId())
                .orElseThrow(() -> new IllegalArgumentException("记录不存在"));
            if (Boolean.FALSE.equals(existing.getValid())) throw new IllegalArgumentException("记录已删除");
            if (!existing.getPid().equals(input.getPid())) throw new IllegalArgumentException("禁止修改患者归属");
            checkDuplicate(input.getPid(), input.getRecordTime(), input.getId());
            existing.setRecordTime(input.getRecordTime());
            existing.setValues(clean(input.getValues()));
            existing.setUpdatedAt(now);
            existing.setUpdatedBy(input.getUpdatedBy());
            return repository.save(existing);
        }
        checkDuplicate(input.getPid(), input.getRecordTime(), null);
        input.setId(null);
        input.setValues(clean(input.getValues()));
        input.setValid(true);
        input.setCreatedAt(now);
        input.setCreatedBy(input.getUpdatedBy());
        input.setUpdatedAt(now);
        return repository.save(input);
    }

    public void invalidate(String id, String operatorId) {
        PiccoParamRecord record = repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("记录不存在"));
        record.setValid(false);
        record.setUpdatedAt(Instant.now());
        record.setUpdatedBy(operatorId);
        repository.save(record);
    }

    /** 同一患者同一测量时间只允许一条有效记录 */
    private void checkDuplicate(String pid, Instant recordTime, String excludeId) {
        List<PiccoParamRecord> sameTime = repository.findByPidAndRecordTimeAndValid(pid, recordTime, true);
        boolean exists = sameTime.stream().anyMatch(r -> excludeId == null || !excludeId.equals(r.getId()));
        if (exists) throw new IllegalArgumentException("该时间点已存在参数记录");
    }

    /** 去掉空白值，避免空串占位 */
    private Map<String, String> clean(Map<String, String> values) {
        Map<String, String> result = new java.util.LinkedHashMap<>();
        values.forEach((k, v) -> {
            if (k != null && v != null && !v.trim().isEmpty()) result.put(k.trim(), v.trim());
        });
        return result;
    }
}
