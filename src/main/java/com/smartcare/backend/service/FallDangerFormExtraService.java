package com.smartcare.backend.service;

import com.smartcare.backend.entity.FallDangerFormExtra;
import com.smartcare.backend.repository.FallDangerFormExtraRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class FallDangerFormExtraService {
    private final FallDangerFormExtraRepository repo;

    public FallDangerFormExtraService(FallDangerFormExtraRepository repo) {
        this.repo = repo;
    }

    public FallDangerFormExtra findLatest(String pid, String formCode) {
        List<FallDangerFormExtra> list = repo.findByPidAndFormCodeOrderByEditTimeDesc(pid, formCode);
        return list.isEmpty() ? null : list.get(0);
    }

    public FallDangerFormExtra save(FallDangerFormExtra body) {
        List<FallDangerFormExtra> list = repo.findByPidAndFormCodeOrderByEditTimeDesc(
                body.getPid(), body.getFormCode());
        if (!list.isEmpty()) {
            FallDangerFormExtra e = list.get(0);
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
