package com.smartcare.backend.service;

import com.smartcare.backend.entity.IabpRecord;
import com.smartcare.backend.repository.IabpRecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class IabpService {
public IabpService(IabpRecordRepository repository) {
this.repository = repository;
}

public IabpRecord save(IabpRecord record) {
return (IabpRecord)this.repository.save(record);
}
private final IabpRecordRepository repository;
public List<IabpRecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public IabpRecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

