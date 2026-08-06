package com.smartcare.backend.controller;

import java.util.*;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/icu/handover-report")
@CrossOrigin(origins = {"*"})
public class HandoverReportController {

    private final MongoTemplate mongoTemplate;

    public HandoverReportController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    /**
     * 科室级每日交班快照
     */
    @GetMapping("/daily")
    public ResponseEntity<Map<String, Object>> daily(
            @RequestParam String departmentId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") Date reportDate) {

        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        cal.setTime(reportDate);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date dayStart = cal.getTime();

        cal.add(Calendar.DAY_OF_MONTH, 1);
        Date dayEnd = cal.getTime();

        // 科室匹配：dept 或 deptCode
        Criteria departmentCriteria = new Criteria().orOperator(
            Criteria.where("deptCode").is(departmentId),
            Criteria.where("dept").is(departmentId)
        );

        // 入科时间早于次日00:00
        Criteria admissionCriteria = new Criteria().orOperator(
            Criteria.where("icuAdmissionTime").lt(dayEnd),
            new Criteria().andOperator(
                Criteria.where("icuAdmissionTime").exists(false),
                Criteria.where("admissionTime").lt(dayEnd)
            )
        );

        // 未出科 或 出科时间 >= 当天00:00
        Criteria dischargeCriteria = new Criteria().orOperator(
            Criteria.where("icuDischargeTime").exists(false),
            Criteria.where("icuDischargeTime").is(null),
            Criteria.where("icuDischargeTime").gte(dayStart)
        );

        Query patientQuery = new Query(new Criteria().andOperator(
            departmentCriteria, admissionCriteria, dischargeCriteria
        ));
        patientQuery.with(Sort.by(Sort.Direction.ASC, "hisBed"));
        List<Document> patientDocs = mongoTemplate.find(patientQuery, Document.class, "patient");

        System.out.println("[HANDOVER] reportDate=" + reportDate + ", departmentId=" + departmentId
            + ", dayStart=" + dayStart + ", dayEnd=" + dayEnd + ", patientCount=" + patientDocs.size());

        // bedside records
        Query bedsideQuery = new Query();
        bedsideQuery.addCriteria(
            Criteria.where("time").gte(dayStart).lt(dayEnd));
        bedsideQuery.with(Sort.by(Sort.Direction.ASC, "time"));
        List<Document> bedsideDocs = mongoTemplate.find(bedsideQuery, Document.class, "bedside");

        // nurse records
        Query nurseQuery = new Query();
        nurseQuery.addCriteria(
            Criteria.where("time").gte(dayStart).lt(dayEnd)
                .and("valid").ne(false));
        nurseQuery.with(Sort.by(Sort.Direction.ASC, "time"));
        List<Document> nurseDocs = mongoTemplate.find(nurseQuery, Document.class, "nurseRecords");

        // draft
        Query draftQuery = new Query();
        draftQuery.addCriteria(
            Criteria.where("departmentId").is(departmentId)
                .and("reportDate").is(reportDate));
        Document draftDoc = mongoTemplate.findOne(draftQuery, Document.class, "handoverDrafts");

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("departmentId", departmentId);
        snapshot.put("departmentName", departmentId);
        snapshot.put("reportDate", reportDate);
        snapshot.put("patients", normalizeDocuments(patientDocs));
        snapshot.put("bedsideRecords", normalizeDocuments(bedsideDocs));
        snapshot.put("bloodSugarRecords", Collections.emptyList());
        snapshot.put("orders", Collections.emptyList());
        snapshot.put("tubeExecutions", Collections.emptyList());
        snapshot.put("nurseRecords", normalizeDocuments(nurseDocs));
        snapshot.put("nurseAccounts", Collections.emptyList());
        snapshot.put("draft", draftDoc != null ? normalizeUtcValue(draftDoc) : defaultDraft(departmentId, reportDate));

        return ResponseEntity.ok(snapshot);
    }

    /**
     * 保存草稿
     */
    @PutMapping("/draft")
    public ResponseEntity<?> saveDraft(@RequestBody Map<String, Object> body) {
        String departmentId = String.valueOf(body.getOrDefault("departmentId", ""));
        Date reportDate = parseDate(body.get("reportDate"));
        Integer requestVersion = (Integer) body.getOrDefault("version", 0);

        Query query = new Query();
        query.addCriteria(
            Criteria.where("departmentId").is(departmentId)
                .and("reportDate").is(reportDate));
        Document existing = mongoTemplate.findOne(query, Document.class, "handoverDrafts");

        if (existing != null) {
            Integer currentVersion = (Integer) existing.getOrDefault("version", 0);
            if (requestVersion != null && !requestVersion.equals(currentVersion)) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("error", "版本冲突，请刷新后合并");
                error.put("latestDraft", normalizeUtcValue(existing));
                return ResponseEntity.status(409).body(error);
            }
        }

        body.put("version", (existing != null ? (Integer) existing.getOrDefault("version", 0) : 0) + 1);
        body.put("updatedAt", new Date());

        if (existing != null) {
            mongoTemplate.save(body, "handoverDrafts");
        } else {
            mongoTemplate.insert(body, "handoverDrafts");
        }

        return ResponseEntity.ok(body);
    }

    private Map<String, Object> defaultDraft(String departmentId, Date reportDate) {
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("departmentId", departmentId);
        draft.put("reportDate", reportDate);
        draft.put("version", 0);
        draft.put("criticalPatients", Collections.emptyList());
        draft.put("patientTextOverrides", Collections.emptyMap());
        draft.put("manualMetrics", Collections.emptyMap());
        draft.put("shiftSignatures", Collections.emptyMap());
        return draft;
    }

    private Date parseDate(Object value) {
        if (value instanceof Date) return (Date) value;
        if (value instanceof String) {
            try { return Date.from(java.time.Instant.parse((String) value)); }
            catch (Exception e) { return new Date(); }
        }
        return new Date();
    }

    @SuppressWarnings("unchecked")
    private Object normalizeUtcValue(Object value) {
        if (value instanceof Date) return ((Date) value).toInstant().toString();
        if (value instanceof Document) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : ((Document) value).entrySet()) {
                result.put(entry.getKey(), normalizeUtcValue(entry.getValue()));
            }
            return result;
        }
        if (value instanceof Map) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                result.put(String.valueOf(entry.getKey()), normalizeUtcValue(entry.getValue()));
            }
            return result;
        }
        if (value instanceof List) {
            List<Object> result = new ArrayList<>();
            for (Object item : (List<?>) value) result.add(normalizeUtcValue(item));
            return result;
        }
        return value;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> normalizeDocuments(List<Document> docs) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Document doc : docs) result.add((Map<String, Object>) normalizeUtcValue(doc));
        return result;
    }
}
