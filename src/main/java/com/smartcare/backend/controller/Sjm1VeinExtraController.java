package com.smartcare.backend.controller;

import com.smartcare.backend.entity.Sjm1VeinExtra;
import com.smartcare.backend.repository.Sjm1VeinExtraRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/vein-maintenance-extra"})
@CrossOrigin(origins = {"*"})
public class Sjm1VeinExtraController {
    private final Sjm1VeinExtraRepository repo;

    public Sjm1VeinExtraController(Sjm1VeinExtraRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public Sjm1VeinExtra get(@RequestParam String pid,
                             @RequestParam(required = false, defaultValue = "") String tubeId,
                             @RequestParam(required = false, defaultValue = "") String type) {
        List<Sjm1VeinExtra> list;
        if (type != null && !type.isEmpty()) {
            list = this.repo.findByPidAndTubeIdAndType(pid, tubeId, type);
        } else {
            list = this.repo.findByPidAndTubeId(pid, tubeId);
        }
        return list.isEmpty() ? null : list.get(0);
    }

    @PostMapping
    public Sjm1VeinExtra save(@RequestBody Sjm1VeinExtra body) {
        String tubeId = body.getTubeId() == null ? "" : body.getTubeId();
        String type = body.getType() == null ? "" : body.getType();
        List<Sjm1VeinExtra> existing;
        if (!type.isEmpty()) {
            existing = this.repo.findByPidAndTubeIdAndType(body.getPid(), tubeId, type);
        } else {
            existing = this.repo.findByPidAndTubeId(body.getPid(), tubeId);
        }
        if (!existing.isEmpty()) {
            body.setId(existing.get(0).getId()); // 按 pid+tubeId+type upsert
        }
        body.setUpdateTime(LocalDateTime.now().toString());
        return this.repo.save(body);
    }
}
