package com.smartcare.backend.service;

import com.smartcare.backend.entity.RmRecord;
import com.smartcare.backend.repository.RmRecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class RmService {
public RmService(RmRecordRepository repository) {
this.repository = repository;
}

public RmRecord save(RmRecord record) {
return (RmRecord)this.repository.save(record);
}
private final RmRecordRepository repository;
public List<RmRecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public RmRecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

