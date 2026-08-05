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
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/icu/hljld")
@CrossOrigin(origins = {"*"})
public class HljldController {

    private final MongoTemplate mongoTemplate;

    public HljldController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping("/drug-executions")
    public List<Map<String, Object>> drugExecutions(
            @RequestParam String pid,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date endTime) {
        Query query = new Query();
        query.addCriteria(
                Criteria.where("pid").is(pid)
                        .and("startTime").gte(startTime).lte(endTime)
                        .and("status").ne("invalid"));
        query.with(Sort.by(Sort.Direction.ASC, "startTime"));
        List<Document> docs = mongoTemplate.find(query, Document.class, "drugExe");
        return normalizeDocuments(docs);
    }

    @GetMapping("/drug-methods")
    public List<Map<String, Object>> drugMethods() {
        Query query = new Query();
        query.addCriteria(Criteria.where("valid").ne(false));
        List<Document> docs = mongoTemplate.find(query, Document.class, "configDrugMethod");
        return normalizeDocuments(docs);
    }

    @GetMapping("/nurse-records")
    public List<Map<String, Object>> nurseRecords(
            @RequestParam String pid,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date endTime) {
        Query query = new Query();
        query.addCriteria(
                Criteria.where("pid").is(pid)
                        .and("time").gte(startTime).lte(endTime)
                        .and("valid").ne(false)
                        .and("desc").nin(null, ""));
        query.with(Sort.by(Sort.Direction.ASC, "time"));
        List<Document> docs = mongoTemplate.find(query, Document.class, "nurseRecords");
        return normalizeDocuments(docs);
    }

    /**
     * 递归将 Document 中的 Date 字段转换为 UTC ISO 字符串，
     * 避免 Jackson 按 GMT+8 序列化导致前端重复加8小时。
     */
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
