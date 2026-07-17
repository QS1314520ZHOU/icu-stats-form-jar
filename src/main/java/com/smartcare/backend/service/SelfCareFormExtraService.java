package com.smartcare.backend.service;

import com.smartcare.backend.entity.SelfCareFormExtra;
import com.smartcare.backend.repository.SelfCareFormExtraRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class SelfCareFormExtraService {
    private final SelfCareFormExtraRepository repo;

    public SelfCareFormExtraService(SelfCareFormExtraRepository repo) {
        this.repo = repo;
    }

    public SelfCareFormExtra findLatest(String pid, String formCode) {
        List<SelfCareFormExtra> list = repo.findByPidAndFormCodeOrderByEditTimeDesc(pid, formCode);
        return list.isEmpty() ? null : list.get(0);
    }

    public SelfCareFormExtra save(SelfCareFormExtra body) {
        List<SelfCareFormExtra> list = repo.findByPidAndFormCodeOrderByEditTimeDesc(
                body.getPid(), body.getFormCode());
        if (!list.isEmpty()) {
            SelfCareFormExtra e = list.get(0);
            body.setId(e.getId());
            body.setCreateTime(e.getCreateTime());
        } else {
            body.setCreateTime(LocalDateTime.now().toString());
        }
        body.setEditTime(LocalDateTime.now().toString());
        body.setValid(true);
        return repo.save(body);
    }
}
