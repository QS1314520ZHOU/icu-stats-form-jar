package com.smartcare.backend.controller;

import com.smartcare.backend.entity.FallDangerFormExtra;
import com.smartcare.backend.service.FallDangerFormExtraService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/fall-danger-extra"})
@CrossOrigin(origins = {"*"})
public class FallDangerFormExtraController {
    private final FallDangerFormExtraService service;

    public FallDangerFormExtraController(FallDangerFormExtraService service) {
        this.service = service;
    }

    @GetMapping("/latest")
    public FallDangerFormExtra latest(@RequestParam String pid,
                                       @RequestParam String formCode) {
        return this.service.findLatest(pid, formCode);
    }

    @PostMapping("/save")
    public FallDangerFormExtra save(@RequestBody FallDangerFormExtra body) {
        return this.service.save(body);
    }
}
