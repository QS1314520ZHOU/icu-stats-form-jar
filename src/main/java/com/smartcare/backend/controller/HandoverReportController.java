package com.smartcare.backend.controller;

import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/icu/handover-reports")
@CrossOrigin(origins = {"*"})
public class HandoverReportController {

    private final MongoTemplate mongoTemplate;
    private static final String COLLECTION = "handoverReports";

    public HandoverReportController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list(
            @RequestParam String pid,
            @RequestParam(required = false) String department,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date reportDate) {
        Query query = new Query();
        query.addCriteria(Criteria.where("pid").is(pid));
        if (department != null && !department.trim().isEmpty()) {
            query.addCriteria(Criteria.where("department").is(department.trim()));
        }
        query.addCriteria(Criteria.where("reportDate").is(reportDate));
        query.with(Sort.by(Sort.Direction.ASC, "createdAt"));
        List<Document> docs = mongoTemplate.find(query, Document.class, COLLECTION);
        return ResponseEntity.ok(normalizeDocuments(docs));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String pid = String.valueOf(body.getOrDefault("pid", ""));
        String department = String.valueOf(body.getOrDefault("department", ""));
        Date reportDate = parseDate(body.get("reportDate"));
        String content = String.valueOf(body.getOrDefault("content", "{}"));
        Integer version = 1;

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("pid", pid);
        doc.put("department", department);
        doc.put("reportDate", reportDate);
        doc.put("content", content);
        doc.put("version", version);
        doc.put("createdAt", new Date());
        doc.put("updatedAt", new Date());

        mongoTemplate.insert(doc, COLLECTION);
        return ResponseEntity.ok((Map<String, Object>) normalizeUtcValue(doc));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(
            @PathVariable String id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody Map<String, Object> body) {
        Query query = new Query(Criteria.where("_id").is(id));
        Document existing = mongoTemplate.findOne(query, Document.class, COLLECTION);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        Integer currentVersion = (Integer) existing.get("version");
        if (ifMatch != null && !ifMatch.isEmpty()) {
            try {
                Integer requestVersion = Integer.parseInt(ifMatch);
                if (!requestVersion.equals(currentVersion)) {
                    Map<String, Object> error = new LinkedHashMap<>();
                    error.put("error", "版本冲突，请刷新后重试");
                    error.put("currentVersion", currentVersion);
                    return ResponseEntity.status(409).body(error);
                }
            } catch (NumberFormatException ignored) {
            }
        }

        String content = String.valueOf(body.getOrDefault("content", existing.get("content")));
        Update update = new Update();
        update.set("content", content);
        update.set("version", currentVersion + 1);
        update.set("updatedAt", new Date());

        mongoTemplate.updateFirst(query, update, COLLECTION);
        Document updated = mongoTemplate.findOne(query, Document.class, COLLECTION);
        return ResponseEntity.ok((Map<String, Object>) normalizeUtcValue(updated));
    }

    private Date parseDate(Object value) {
        if (value instanceof Date) return (Date) value;
        if (value instanceof String) {
            try {
                return Date.from(java.time.Instant.parse((String) value));
            } catch (Exception e) {
                return new Date();
            }
        }
        return new Date();
    }

    @SuppressWarnings("unchecked")
    private Object normalizeUtcValue(Object value) {
        if (value instanceof Date) {
            return ((Date) value).toInstant().toString();
        }
        if (value instanceof Document) {
            Document source = (Document) value;
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : source.entrySet()) {
                result.put(entry.getKey(), normalizeUtcValue(entry.getValue()));
            }
            return result;
        }
        if (value instanceof Map) {
            Map<?, ?> source = (Map<?, ?>) value;
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : source.entrySet()) {
                result.put(String.valueOf(entry.getKey()), normalizeUtcValue(entry.getValue()));
            }
            return result;
        }
        if (value instanceof List) {
            List<?> source = (List<?>) value;
            List<Object> result = new ArrayList<>();
            for (Object item : source) {
                result.add(normalizeUtcValue(item));
            }
            return result;
        }
        return value;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> normalizeDocuments(List<Document> documents) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Document document : documents) {
            result.add((Map<String, Object>) normalizeUtcValue(document));
        }
        return result;
    }
}
