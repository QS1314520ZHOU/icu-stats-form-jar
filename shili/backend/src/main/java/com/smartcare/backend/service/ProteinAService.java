package com.smartcare.backend.service;

import com.smartcare.backend.entity.ProteinARecord;
import com.smartcare.backend.repository.ProteinARecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProteinAService {
    private final ProteinARecordRepository repository;

    public ProteinARecord save(ProteinARecord record) {
        return repository.save(record);
    }

    public List<ProteinARecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public ProteinARecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
