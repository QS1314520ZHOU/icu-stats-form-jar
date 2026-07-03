package com.smartcare.backend.service;

import com.smartcare.backend.entity.HpRecord;
import com.smartcare.backend.repository.HpRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class HpService {
    private final HpRecordRepository repository;

    public HpRecord save(HpRecord record) {
        return repository.save(record);
    }

    public List<HpRecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public HpRecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
