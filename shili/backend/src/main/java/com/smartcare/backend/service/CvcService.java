package com.smartcare.backend.service;

import com.smartcare.backend.entity.CvcRecord;
import com.smartcare.backend.repository.CvcRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CvcService {
    private final CvcRecordRepository repository;

    public CvcRecord save(CvcRecord record) {
        return repository.save(record);
    }

    public List<CvcRecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public CvcRecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
