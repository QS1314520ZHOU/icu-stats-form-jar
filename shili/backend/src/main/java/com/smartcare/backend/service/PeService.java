package com.smartcare.backend.service;

import com.smartcare.backend.entity.PeRecord;
import com.smartcare.backend.repository.PeRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PeService {
    private final PeRecordRepository repository;

    public PeRecord save(PeRecord record) {
        return repository.save(record);
    }

    public List<PeRecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public PeRecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
