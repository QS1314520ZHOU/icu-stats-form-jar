package com.smartcare.backend.service;

import com.smartcare.backend.entity.CrrtOrderFormRecord;
import com.smartcare.backend.repository.CrrtOrderFormRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class CrrtOrderFormService {
    private final CrrtOrderFormRepository repo;

    public CrrtOrderFormService(CrrtOrderFormRepository repo) { this.repo = repo; }

    public List<CrrtOrderFormRecord> findByPid(String pid) { return repo.findByPidOrderByOrderTimeDesc(pid); }

    public Optional<CrrtOrderFormRecord> findById(String id) { return repo.findById(id); }

    public CrrtOrderFormRecord save(CrrtOrderFormRecord record, String operatorId) {
        if (record.getId() == null) {
            record.setCreatedBy(operatorId);
            record.setCreatedAt(Instant.now());
        }
        record.setUpdatedBy(operatorId);
        record.setUpdatedAt(Instant.now());
        return repo.save(record);
    }
}
