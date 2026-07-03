package com.smartcare.backend.service;

import com.smartcare.backend.entity.RmRecord;
import com.smartcare.backend.repository.RmRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RmService {
    private final RmRecordRepository repository;

    public RmRecord save(RmRecord record) {
        return repository.save(record);
    }

    public List<RmRecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public RmRecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
