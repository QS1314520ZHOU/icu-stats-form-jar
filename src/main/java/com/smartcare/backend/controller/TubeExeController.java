package com.smartcare.backend.controller;

import com.smartcare.backend.entity.TubeExe;
import com.smartcare.backend.service.TubeExeService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/tube-exe"})
@CrossOrigin(origins = {"*"})
public class TubeExeController {
    private final TubeExeService service;

    public TubeExeController(TubeExeService service) {
        this.service = service;
    }

    @GetMapping({"/listByPid"})
    public ResponseEntity<List<TubeExe>> getByPidAndType(
            @RequestParam String pid,
            @RequestParam String type) {
        return ResponseEntity.ok(this.service.findByPidAndType(pid, type));
    }
}
