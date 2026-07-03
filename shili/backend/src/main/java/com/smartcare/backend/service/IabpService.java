package com.smartcare.backend.service;

import com.smartcare.backend.entity.IabpRecord;
import com.smartcare.backend.repository.IabpRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class IabpService {
    private final IabpRecordRepository repository;

    public IabpRecord save(IabpRecord record) {
        return repository.save(record);
    }

    public List<IabpRecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public IabpRecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
