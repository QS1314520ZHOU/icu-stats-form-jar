package com.smartcare.backend.controller;

import com.smartcare.backend.entity.PiccoParamRecord;
import com.smartcare.backend.service.PiccoParamRecordService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * PICCO 容量监测参数手工录入记录（新增/编辑/删除），替代原 bedside 同步数据读取。
 */
@RestController
@RequestMapping("/api/v1/icu/picco-params")
@CrossOrigin(origins = "*")
public class PiccoParamRecordController {
    private final PiccoParamRecordService service;

    public PiccoParamRecordController(PiccoParamRecordService service) {
        this.service = service;
    }

    @GetMapping("/listByPid")
    public ResponseEntity<List<PiccoParamRecord>> listByPid(@RequestParam String pid) {
        return ResponseEntity.ok(service.listValid(pid));
    }

    @PostMapping("/save")
    public ResponseEntity<PiccoParamRecord> save(@RequestBody PiccoParamRecord body) {
        return ResponseEntity.ok(service.save(body));
    }

    @PatchMapping("/{id}/invalidate")
    public ResponseEntity<Void> invalidate(@PathVariable String id,
                                           @RequestParam(required = false) String operatorId) {
        service.invalidate(id, operatorId);
        return ResponseEntity.noContent().build();
    }
}
