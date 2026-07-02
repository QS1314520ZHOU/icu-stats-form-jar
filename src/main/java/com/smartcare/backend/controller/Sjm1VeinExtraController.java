package com.smartcare.backend.controller;

import com.smartcare.backend.entity.Sjm1VeinExtra;
import com.smartcare.backend.repository.Sjm1VeinExtraRepository;
import java.time.LocalDateTime;
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
                             @RequestParam(required = false, defaultValue = "") String tubeId) {
        return this.repo.findByPidAndTubeId(pid, tubeId).orElse(null);
    }

    @PostMapping
    public Sjm1VeinExtra save(@RequestBody Sjm1VeinExtra body) {
        this.repo.findByPidAndTubeId(body.getPid(), body.getTubeId() == null ? "" : body.getTubeId())
                .ifPresent(e -> body.setId(e.getId())); // 按 pid+tubeId upsert
        body.setUpdateTime(LocalDateTime.now().toString());
        return this.repo.save(body);
    }
}
