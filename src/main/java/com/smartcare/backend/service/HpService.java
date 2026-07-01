package com.smartcare.backend.service;

import com.smartcare.backend.entity.HpRecord;
import com.smartcare.backend.repository.HpRecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class HpService {
public HpService(HpRecordRepository repository) {
this.repository = repository;
}

public HpRecord save(HpRecord record) {
return (HpRecord)this.repository.save(record);
}
private final HpRecordRepository repository;
public List<HpRecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public HpRecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

