package com.smartcare.backend.service;

import com.smartcare.backend.entity.PeRecord;
import com.smartcare.backend.repository.PeRecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class PeService {
public PeService(PeRecordRepository repository) {
this.repository = repository;
}

public PeRecord save(PeRecord record) {
return (PeRecord)this.repository.save(record);
}
private final PeRecordRepository repository;
public List<PeRecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public PeRecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

