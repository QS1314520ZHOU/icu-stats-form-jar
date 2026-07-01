package com.smartcare.backend.service;

import com.smartcare.backend.entity.PiccoRecord;
import com.smartcare.backend.repository.PiccoRecordRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class PiccoService {
public PiccoService(PiccoRecordRepository repository) {
this.repository = repository;
}

public PiccoRecord save(PiccoRecord record) {
return (PiccoRecord)this.repository.save(record);
}
private final PiccoRecordRepository repository;
public List<PiccoRecord> findByPid(String pid) {
return this.repository.findByPid(pid);
}

public PiccoRecord findById(String id) {
return this.repository.findById(id).orElse(null);
}

public void deleteById(String id) {
this.repository.deleteById(id);
}
}

