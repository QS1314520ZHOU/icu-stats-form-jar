package com.smartcare.backend.service;

import com.smartcare.backend.entity.CrrtRecord;
import com.smartcare.backend.repository.CrrtRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CrrtService {
    private final CrrtRecordRepository repository;

    public CrrtRecord save(CrrtRecord record) {
        return repository.save(record);
    }

    public List<CrrtRecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public CrrtRecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
