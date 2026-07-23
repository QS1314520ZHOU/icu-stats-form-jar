package com.smartcare.backend.controller;

import com.smartcare.backend.entity.TransfusionPage;
import com.smartcare.backend.entity.TransfusionRecord;
import com.smartcare.backend.service.TransfusionRecordService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/api/v1/icu/transfusion-record"})
@CrossOrigin(origins = {"*"})
public class TransfusionRecordController {
    private final TransfusionRecordService service;

    public TransfusionRecordController(TransfusionRecordService service) { this.service = service; }

    @GetMapping("/byPid")
    public ResponseEntity<TransfusionRecord> byPid(@RequestParam String pid) {
        return service.findByPid(pid).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/savePage")
    public ResponseEntity<?> savePage(@RequestBody Map<String, Object> body) {
        try {
            String pid = (String) body.get("pid");
            String operatorId = (String) body.get("operatorId");
            @SuppressWarnings("unchecked")
            Map<String, Object> pageMap = (Map<String, Object>) body.get("page");
            TransfusionPage page = new TransfusionPage();
            page.setPageId((String) pageMap.get("pageId"));
            page.setPageNo(pageMap.get("pageNo") != null ? ((Number) pageMap.get("pageNo")).intValue() : null);
            // items are already serialized by Jackson in the full body; let Jackson handle it
            // For simplicity, accept the page from a typed wrapper
            return ResponseEntity.ok(service.savePage(pid, page, operatorId));
        } catch (org.springframework.dao.OptimisticLockingFailureException e) {
            return ResponseEntity.status(409).body(Map.of("message", "记录已被其他人员修改，请刷新后重试"));
        }
    }

    @PostMapping("/savePageTyped")
    public ResponseEntity<?> savePageTyped(@RequestBody SavePageRequest req) {
        try {
            return ResponseEntity.ok(service.savePage(req.pid, req.page, req.operatorId));
        } catch (org.springframework.dao.OptimisticLockingFailureException e) {
            return ResponseEntity.status(409).body(Map.of("message", "记录已被其他人员修改，请刷新后重试"));
        }
    }

    @DeleteMapping("/page/{pageId}")
    public ResponseEntity<?> deletePage(@PathVariable String pageId, @RequestParam String pid,
                                         @RequestParam String version, @RequestParam String operatorId) {
        try {
            return ResponseEntity.ok(service.deletePage(pid, pageId, operatorId));
        } catch (org.springframework.dao.OptimisticLockingFailureException e) {
            return ResponseEntity.status(409).body(Map.of("message", "记录已被其他人员修改，请刷新后重试"));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    public static class SavePageRequest {
        public String pid;
        public TransfusionPage page;
        public String operatorId;
    }
}
