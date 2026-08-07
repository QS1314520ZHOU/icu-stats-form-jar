package com.smartcare.backend.controller;

import java.util.*;
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
@RequestMapping("/api/v1/icu/handover-report")
@CrossOrigin(origins = {"*"})
public class HandoverReportController {

    private final MongoTemplate mongoTemplate;

    public HandoverReportController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping("/daily")
    public ResponseEntity<Map<String, Object>> daily(
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String departmentCode,
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

        // 科室 OR 匹配
        List<Criteria> departmentOr = new ArrayList<>();
        if (department != null && !department.trim().isEmpty()) {
            departmentOr.add(Criteria.where("dept").is(department.trim()));
            departmentOr.add(Criteria.where("deptCode").is(department.trim()));
        }
        if (departmentCode != null && !departmentCode.trim().isEmpty()) {
            departmentOr.add(Criteria.where("deptCode").is(departmentCode.trim()));
            departmentOr.add(Criteria.where("dept").is(departmentCode.trim()));
        }

        Criteria departmentCriteria = departmentOr.isEmpty()
            ? new Criteria()
            : new Criteria().orOperator(departmentOr.toArray(new Criteria[0]));

        Criteria admissionCriteria = new Criteria().orOperator(
            Criteria.where("icuAdmissionTime").lt(dayEnd),
            new Criteria().andOperator(Criteria.where("icuAdmissionTime").exists(false), Criteria.where("admissionTime").lt(dayEnd))
        );

        Criteria dischargeCriteria = new Criteria().orOperator(
            Criteria.where("icuDischargeTime").exists(false),
            Criteria.where("icuDischargeTime").is(null),
            Criteria.where("icuDischargeTime").gte(dayStart)
        );

        Query patientQuery = new Query(new Criteria().andOperator(departmentCriteria, admissionCriteria, dischargeCriteria));
        patientQuery.with(Sort.by(Sort.Direction.ASC, "hisBed"));
        List<Document> patientDocs = mongoTemplate.find(patientQuery, Document.class, "patient");

        // bedside records (48h window for historical indicators)
        Calendar bedsideCal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        bedsideCal.setTime(dayStart);
        bedsideCal.add(Calendar.HOUR_OF_DAY, -48);
        Date bedsideStart = bedsideCal.getTime();

        Query bedsideQuery = new Query();
        bedsideQuery.addCriteria(Criteria.where("time").gte(bedsideStart).lt(dayEnd));
        bedsideQuery.with(Sort.by(Sort.Direction.ASC, "time"));
        List<Document> bedsideDocs = mongoTemplate.find(bedsideQuery, Document.class, "bedside");

        // blood sugar
        Query bsQuery = new Query();
        bsQuery.addCriteria(Criteria.where("time").gte(dayStart).lt(dayEnd).and("valid").ne(false));
        bsQuery.with(Sort.by(Sort.Direction.ASC, "time"));
        List<Document> bsDocs = mongoTemplate.find(bsQuery, Document.class, "bloodSugar");

        // nurse records
        Query nurseQuery = new Query();
        nurseQuery.addCriteria(Criteria.where("time").gte(dayStart).lt(dayEnd).and("valid").ne(false));
        nurseQuery.with(Sort.by(Sort.Direction.ASC, "time"));
        List<Document> nurseDocs = mongoTemplate.find(nurseQuery, Document.class, "nurseRecords");

        // nurse accounts
        Query acctQuery = new Query();
        acctQuery.addCriteria(Criteria.where("profession").in(Arrays.asList("Nurse", "Matron", "PracticeNurse")));
        List<Document> acctDocs = mongoTemplate.find(acctQuery, Document.class, "account");

        // tube executions (48h window for reintubation indicators)
        Calendar tubeCal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        tubeCal.setTime(dayStart);
        tubeCal.add(Calendar.HOUR_OF_DAY, -48);
        Date tubeStart = tubeCal.getTime();

        Query tubeQuery = new Query();
        tubeQuery.addCriteria(Criteria.where("startTime").gte(tubeStart).lt(dayEnd)
            .and("valid").ne(false)
            .and("status").ne("invalid"));
        tubeQuery.with(Sort.by(Sort.Direction.ASC, "startTime"));
        List<Document> tubeDocs = mongoTemplate.find(tubeQuery, Document.class, "tubeExe");

        // draft
        Query draftQuery = new Query();
        draftQuery.addCriteria(Criteria.where("departmentId").is(department != null ? department : departmentCode)
            .and("reportDate").is(reportDate));
        Document draftDoc = mongoTemplate.findOne(draftQuery, Document.class, "handoverDrafts");

        System.out.println("[HANDOVER] department=" + department + ", departmentCode=" + departmentCode
            + ", dayStart=" + dayStart + ", dayEnd=" + dayEnd
            + ", patients=" + patientDocs.size() + ", bedside=" + bedsideDocs.size()
            + ", bloodSugar=" + bsDocs.size() + ", nurseRecords=" + nurseDocs.size()
            + ", nurseAccounts=" + acctDocs.size() + ", tubeExecutions=" + tubeDocs.size());

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("departmentId", department != null ? department : departmentCode);
        snapshot.put("departmentName", department != null ? department : departmentCode);
        snapshot.put("reportDate", reportDate);
        snapshot.put("patients", normalizeDocuments(patientDocs));
        snapshot.put("bedsideRecords", normalizeDocuments(bedsideDocs));
        snapshot.put("bloodSugarRecords", normalizeDocuments(bsDocs));
        snapshot.put("orders", Collections.emptyList());
        snapshot.put("tubeExecutions", normalizeDocuments(tubeDocs));
        snapshot.put("nurseRecords", normalizeDocuments(nurseDocs));
        snapshot.put("nurseAccounts", normalizeDocuments(acctDocs));
        snapshot.put("draft", draftDoc != null ? normalizeUtcValue(draftDoc) : defaultDraft(department != null ? department : departmentCode, reportDate));

        return ResponseEntity.ok(snapshot);
    }

    /**
     * 字段级补丁保存，支持并发修改。
     * 不再使用整份PUT覆盖。
     */
    @PatchMapping("/draft")
    public ResponseEntity<?> patchDraft(@RequestBody Map<String, Object> body) {
        String departmentId = String.valueOf(body.getOrDefault("departmentId", ""));
        Date reportDate = parseDate(body.get("reportDate"));
        Integer baseVersion = (Integer) body.getOrDefault("baseVersion", 0);
        List<Map<String, Object>> changes = (List<Map<String, Object>>) body.getOrDefault("changes", Collections.emptyList());

        if (changes.isEmpty()) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "未提供任何修改");
            return ResponseEntity.badRequest().body(error);
        }

        // 查找现有草稿
        Query query = new Query();
        query.addCriteria(Criteria.where("departmentId").is(departmentId).and("reportDate").is(reportDate));
        Document existing = mongoTemplate.findOne(query, Document.class, "handoverDrafts");

        // 版本检查
        if (existing != null) {
            Integer currentVersion = (Integer) existing.getOrDefault("version", 0);
            if (baseVersion != null && !baseVersion.equals(currentVersion)) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("error", "版本冲突，请刷新后合并");
                error.put("latestDraft", normalizeUtcValue(existing));
                return ResponseEntity.status(409).body(error);
            }
        }

        // 如果草稿不存在，创建默认草稿
        if (existing == null) {
            existing = new Document(defaultDraft(departmentId, reportDate));
            mongoTemplate.insert(existing, "handoverDrafts");
        }

        // 应用所有变更
        Update update = new Update();
        Map<String, Object> fieldVersions = (Map<String, Object>) existing.getOrDefault("fieldVersions", new LinkedHashMap<>());
        boolean hasConflict = false;
        String conflictField = null;

        for (Map<String, Object> change : changes) {
            String type = String.valueOf(change.get("type"));

            switch (type) {
                case "replaceCriticalPatients":
                    applyReplaceCriticalPatients(update, change);
                    break;
                case "setPatientText":
                    if (applySetPatientText(update, change, fieldVersions)) {
                        hasConflict = true;
                        conflictField = "patientText." + change.get("rowKey") + "." + change.get("shift");
                    }
                    break;
                case "setManualMetric":
                    if (applySetManualMetric(update, change, fieldVersions)) {
                        hasConflict = true;
                        conflictField = "manualMetrics." + change.get("metricKey") + "." + change.get("shift");
                    }
                    break;
                case "setShiftSignature":
                    if (applySetShiftSignature(update, change, fieldVersions)) {
                        hasConflict = true;
                        conflictField = "shiftSignatures." + change.get("shift");
                    }
                    break;
                case "setHeadNurseSignature":
                    if (applySetHeadNurseSignature(update, change, fieldVersions)) {
                        hasConflict = true;
                        conflictField = "headNurseSignature";
                    }
                    break;
                case "setRemark":
                    if (applySetRemark(update, change, fieldVersions)) {
                        hasConflict = true;
                        conflictField = "remarks." + change.get("shift");
                    }
                    break;
                case "setOtherText":
                    if (applySetOtherText(update, change, fieldVersions)) {
                        hasConflict = true;
                        conflictField = "otherTexts." + change.get("shift");
                    }
                    break;
                default:
                    Map<String, Object> error = new LinkedHashMap<>();
                    error.put("error", "未知的变更类型: " + type);
                    return ResponseEntity.badRequest().body(error);
            }
        }

        // 如果有字段级冲突，返回409
        if (hasConflict) {
            Document latest = mongoTemplate.findOne(query, Document.class, "handoverDrafts");
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "字段已被其他用户修改: " + conflictField);
            error.put("latestDraft", normalizeUtcValue(latest));
            return ResponseEntity.status(409).body(error);
        }

        // 递增全局版本号
        update.inc("version", 1);
        update.set("updatedAt", new Date());
        update.set("fieldVersions", fieldVersions);

        // 执行原子更新
        mongoTemplate.updateFirst(query, update, "handoverDrafts");

        // 返回更新后的草稿
        Document updated = mongoTemplate.findOne(query, Document.class, "handoverDrafts");
        return ResponseEntity.ok(normalizeUtcValue(updated));
    }

    /**
     * 替换危重患者选择。
     */
    @SuppressWarnings("unchecked")
    private void applyReplaceCriticalPatients(Update update, Map<String, Object> change) {
        List<String> patientIds = (List<String>) change.getOrDefault("patientIds", Collections.emptyList());
        String selectedBy = String.valueOf(change.getOrDefault("selectedBy", ""));

        List<Map<String, Object>> criticalPatients = new ArrayList<>();
        for (String patientId : patientIds) {
            Map<String, Object> selection = new LinkedHashMap<>();
            selection.put("patientId", patientId);
            selection.put("selectedAt", new Date());
            selection.put("selectedBy", selectedBy);
            criticalPatients.add(selection);
        }

        update.set("criticalPatients", criticalPatients);
    }

    /**
     * 设置患者交班文本。
     * 返回true表示有字段级冲突。
     */
    @SuppressWarnings("unchecked")
    private boolean applySetPatientText(Update update, Map<String, Object> change, Map<String, Object> fieldVersions) {
        String rowKey = String.valueOf(change.get("rowKey"));
        String shift = String.valueOf(change.get("shift"));
        String value = String.valueOf(change.getOrDefault("value", ""));
        Integer expectedVersion = (Integer) change.get("expectedFieldVersion");

        String fieldPath = "patientTexts." + rowKey + "." + shift;
        Integer currentFieldVersion = (Integer) fieldVersions.getOrDefault(fieldPath, 0);

        // 字段级版本检查
        if (expectedVersion != null && !expectedVersion.equals(currentFieldVersion)) {
            return true;
        }

        // 使用MongoDB嵌套路径更新
        update.set(fieldPath, value);

        // 递增字段版本
        fieldVersions.put(fieldPath, currentFieldVersion + 1);

        return false;
    }

    /**
     * 设置手工安全指标。
     * 返回true表示有字段级冲突。
     */
    @SuppressWarnings("unchecked")
    private boolean applySetManualMetric(Update update, Map<String, Object> change, Map<String, Object> fieldVersions) {
        String metricKey = String.valueOf(change.get("metricKey"));
        String shift = String.valueOf(change.get("shift"));
        String value = String.valueOf(change.getOrDefault("value", ""));
        Integer expectedVersion = (Integer) change.get("expectedFieldVersion");

        String fieldPath = "manualMetrics." + metricKey + "." + shift;
        Integer currentFieldVersion = (Integer) fieldVersions.getOrDefault(fieldPath, 0);

        // 字段级版本检查
        if (expectedVersion != null && !expectedVersion.equals(currentFieldVersion)) {
            return true;
        }

        // 使用MongoDB嵌套路径更新
        update.set(fieldPath, value);

        // 递增字段版本
        fieldVersions.put(fieldPath, currentFieldVersion + 1);

        return false;
    }

    /**
     * 设置班次护士签名。
     * 返回true表示有字段级冲突。
     */
    @SuppressWarnings("unchecked")
    private boolean applySetShiftSignature(Update update, Map<String, Object> change, Map<String, Object> fieldVersions) {
        String shift = String.valueOf(change.get("shift"));
        String accountId = String.valueOf(change.getOrDefault("accountId", ""));
        Integer expectedVersion = (Integer) change.get("expectedFieldVersion");

        String fieldPath = "shiftSignatures." + shift;
        Integer currentFieldVersion = (Integer) fieldVersions.getOrDefault(fieldPath, 0);

        // 字段级版本检查
        if (expectedVersion != null && !expectedVersion.equals(currentFieldVersion)) {
            return true;
        }

        // 使用MongoDB嵌套路径更新
        update.set(fieldPath, accountId);

        // 递增字段版本
        fieldVersions.put(fieldPath, currentFieldVersion + 1);

        return false;
    }

    /**
     * 设置护士长签名。
     * 返回true表示有字段级冲突。
     */
    @SuppressWarnings("unchecked")
    private boolean applySetHeadNurseSignature(Update update, Map<String, Object> change, Map<String, Object> fieldVersions) {
        String accountId = String.valueOf(change.getOrDefault("accountId", ""));
        Integer expectedVersion = (Integer) change.get("expectedFieldVersion");

        String fieldPath = "headNurseSignature";
        Integer currentFieldVersion = (Integer) fieldVersions.getOrDefault(fieldPath, 0);

        // 字段级版本检查
        if (expectedVersion != null && !expectedVersion.equals(currentFieldVersion)) {
            return true;
        }

        // 使用MongoDB嵌套路径更新
        update.set(fieldPath, accountId);

        // 递增字段版本
        fieldVersions.put(fieldPath, currentFieldVersion + 1);

        return false;
    }

    /**
     * 设置备注。
     * 返回true表示有字段级冲突。
     */
    @SuppressWarnings("unchecked")
    private boolean applySetRemark(Update update, Map<String, Object> change, Map<String, Object> fieldVersions) {
        String shift = String.valueOf(change.get("shift"));
        String value = String.valueOf(change.getOrDefault("value", ""));
        Integer expectedVersion = (Integer) change.get("expectedFieldVersion");

        String fieldPath = "remarks." + shift;
        Integer currentFieldVersion = (Integer) fieldVersions.getOrDefault(fieldPath, 0);

        // 字段级版本检查
        if (expectedVersion != null && !expectedVersion.equals(currentFieldVersion)) {
            return true;
        }

        // 使用MongoDB嵌套路径更新
        update.set(fieldPath, value);

        // 递增字段版本
        fieldVersions.put(fieldPath, currentFieldVersion + 1);

        return false;
    }

    /**
     * 设置"其它"内容。
     * 返回true表示有字段级冲突。
     */
    @SuppressWarnings("unchecked")
    private boolean applySetOtherText(Update update, Map<String, Object> change, Map<String, Object> fieldVersions) {
        String shift = String.valueOf(change.get("shift"));
        String value = String.valueOf(change.getOrDefault("value", ""));
        Integer expectedVersion = (Integer) change.get("expectedFieldVersion");

        String fieldPath = "otherTexts." + shift;
        Integer currentFieldVersion = (Integer) fieldVersions.getOrDefault(fieldPath, 0);

        // 字段级版本检查
        if (expectedVersion != null && !expectedVersion.equals(currentFieldVersion)) {
            return true;
        }

        // 使用MongoDB嵌套路径更新
        update.set(fieldPath, value);

        // 递增字段版本
        fieldVersions.put(fieldPath, currentFieldVersion + 1);

        return false;
    }

    private Map<String, Object> defaultDraft(String departmentId, Date reportDate) {
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("departmentId", departmentId);
        draft.put("reportDate", reportDate);
        draft.put("version", 0);
        draft.put("criticalPatients", Collections.emptyList());
        draft.put("patientTexts", Collections.emptyMap());
        draft.put("manualMetrics", Collections.emptyMap());
        draft.put("shiftSignatures", Collections.emptyMap());
        draft.put("remarks", Collections.emptyMap());
        draft.put("otherTexts", Collections.emptyMap());
        draft.put("fieldVersions", Collections.emptyMap());
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
