package com.smartcare.backend.controller;

import java.util.Date;
import java.util.List;
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
    public List<Document> drugExecutions(
            @RequestParam String pid,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date endTime) {
        Query query = new Query();
        query.addCriteria(
                Criteria.where("pid").is(pid)
                        .and("startTime").gte(startTime).lte(endTime)
                        .and("status").ne("invalid"));
        query.with(Sort.by(Sort.Direction.ASC, "startTime"));
        return mongoTemplate.find(query, Document.class, "drugExe");
    }

    @GetMapping("/drug-methods")
    public List<Document> drugMethods() {
        Query query = new Query();
        query.addCriteria(Criteria.where("valid").ne(false));
        return mongoTemplate.find(query, Document.class, "configDrugMethod");
    }

    @GetMapping("/nurse-records")
    public List<Document> nurseRecords(
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
        return mongoTemplate.find(query, Document.class, "nurseRecords");
    }
}
