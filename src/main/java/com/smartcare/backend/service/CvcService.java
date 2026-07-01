package com.smartcare.backend.service;

import com.smartcare.backend.entity.CvcRecord;
import com.smartcare.backend.repository.CvcRecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CvcService {
public CvcService(CvcRecordRepository repository) {
this.repository = repository;
}

public CvcRecord save(CvcRecord record) {
return (CvcRecord)this.repository.save(record);
}
private final CvcRecordRepository repository;
public List<CvcRecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public CvcRecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

