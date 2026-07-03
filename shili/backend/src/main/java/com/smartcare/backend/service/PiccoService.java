package com.smartcare.backend.service;

import com.smartcare.backend.entity.PiccoRecord;
import com.smartcare.backend.repository.PiccoRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PiccoService {
    private final PiccoRecordRepository repository;

    public PiccoRecord save(PiccoRecord record) {
        return repository.save(record);
    }

    public List<PiccoRecord> findByPid(String pid) {
        return repository.findByPid(pid);
    }

    public PiccoRecord findById(String id) {
        return repository.findById(id).orElse(null);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
