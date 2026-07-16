package com.smartcare.backend.controller;

import com.smartcare.backend.entity.Score;
import com.smartcare.backend.service.ScoreService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/score"})
@CrossOrigin(origins = {"*"})
public class ScoreController {
    private final ScoreService service;

    public ScoreController(ScoreService service) {
        this.service = service;
    }

    @GetMapping("/listByPid")
    public ResponseEntity<List<Score>> listByPid(
            @RequestParam String pid,
            @RequestParam String scoreType) {
        return ResponseEntity.ok(this.service.findValidByPidAndScoreType(pid, scoreType));
    }
}
