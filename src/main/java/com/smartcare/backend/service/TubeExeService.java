package com.smartcare.backend.service;

import com.smartcare.backend.entity.TubeExe;
import com.smartcare.backend.repository.TubeExeRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class TubeExeService {
    private final TubeExeRepository repository;

    public TubeExeService(TubeExeRepository repository) {
        this.repository = repository;
    }

    public List<TubeExe> findByPidAndType(String pid, String type) {
        return this.repository.findByPidAndType(pid, type);
    }

    public TubeExe findById(String id) {
        return this.repository.findById(id).orElse(null);
    }
}
