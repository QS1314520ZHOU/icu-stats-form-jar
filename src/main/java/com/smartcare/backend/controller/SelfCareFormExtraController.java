package com.smartcare.backend.controller;

import com.smartcare.backend.entity.SelfCareFormExtra;
import com.smartcare.backend.service.SelfCareFormExtraService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/selfcare-extra"})
@CrossOrigin(origins = {"*"})
public class SelfCareFormExtraController {
    private final SelfCareFormExtraService service;

    public SelfCareFormExtraController(SelfCareFormExtraService service) {
        this.service = service;
    }

    @GetMapping("/latest")
    public SelfCareFormExtra latest(@RequestParam String pid,
                                     @RequestParam String formCode) {
        return this.service.findLatest(pid, formCode);
    }

    @PostMapping("/save")
    public SelfCareFormExtra save(@RequestBody SelfCareFormExtra body) {
        return this.service.save(body);
    }
}
