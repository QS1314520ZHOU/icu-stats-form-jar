package com.smartcare.backend.service;

import com.smartcare.backend.entity.ProteinARecord;
import com.smartcare.backend.repository.ProteinARecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ProteinAService {
public ProteinAService(ProteinARecordRepository repository) {
this.repository = repository;
}

public ProteinARecord save(ProteinARecord record) {
return (ProteinARecord)this.repository.save(record);
}
private final ProteinARecordRepository repository;
public List<ProteinARecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public ProteinARecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

