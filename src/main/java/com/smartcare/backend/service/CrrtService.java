package com.smartcare.backend.service;

import com.smartcare.backend.entity.CrrtRecord;
import com.smartcare.backend.repository.CrrtRecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CrrtService {
public CrrtService(CrrtRecordRepository repository) {
this.repository = repository;
}

public CrrtRecord save(CrrtRecord record) {
return (CrrtRecord)this.repository.save(record);
}
private final CrrtRecordRepository repository;
public List<CrrtRecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public CrrtRecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

