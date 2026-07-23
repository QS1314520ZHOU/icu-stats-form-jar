package com.smartcare.backend.controller;

import com.smartcare.backend.entity.EcmoRecordExtra;
import com.smartcare.backend.repository.EcmoRecordExtraRepository;
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
@RequestMapping({"/api/v1/icu/ecmo-extra"})
@CrossOrigin(origins = {"*"})
public class EcmoExtraController {
    private final EcmoRecordExtraRepository repo;

    public EcmoExtraController(EcmoRecordExtraRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/latest")
    public EcmoRecordExtra latest(@RequestParam String pid) {
        List<EcmoRecordExtra> list = this.repo.findByPidOrderByUpdatedAtDesc(pid);
        return list.isEmpty() ? null : list.get(0);
    }

    @PostMapping("/save")
    public EcmoRecordExtra save(@RequestBody EcmoRecordExtra body) {
        List<EcmoRecordExtra> existing = this.repo.findByPidOrderByUpdatedAtDesc(body.getPid());
        if (!existing.isEmpty()) {
            EcmoRecordExtra e = existing.get(0);
            body.setId(e.getId());
        }
        body.setUpdatedAt(LocalDateTime.now().toString());
        body.setValid(true);
        return this.repo.save(body);
    }
}
