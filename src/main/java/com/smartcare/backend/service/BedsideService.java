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

    /**
     * 按 pid + 时间范围查询有效 bedside 记录。
     * 用于一键打印全部：减少不必要的全量数据传输。
     */
    public List<Bedside> findValidByPidAndTimeRange(String pid, String startTime, String endTime) {
        if (pid == null || pid.isEmpty()) return Collections.emptyList();
        if (startTime == null || endTime == null) {
            return this.repository.findByPidAndValidTrue(pid);
        }
        return this.repository.findByPidAndValidTrueAndTimeRange(pid, startTime, endTime);
    }
}
