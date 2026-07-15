package com.smartcare.backend.service;

import com.smartcare.backend.entity.Bedside;
import com.smartcare.backend.repository.BedsideRepository;
import java.util.Collections;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class BedsideService {
    private final BedsideRepository repository;

    public BedsideService(BedsideRepository repository) {
        this.repository = repository;
    }

    public List<Bedside> findValidByPidAndCodes(String pid, List<String> codes) {
        if (pid == null || pid.isEmpty()) return Collections.emptyList();
        if (codes == null || codes.isEmpty()) {
            return this.repository.findByPidAndValidTrue(pid);
        }
        return this.repository.findByPidAndValidTrueAndCodeIn(pid, codes);
    }
}
