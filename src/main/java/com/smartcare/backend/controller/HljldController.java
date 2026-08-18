package com.smartcare.backend.controller;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.smartcare.backend.entity.HljldPageCount;
import com.smartcare.backend.repository.HljldPageCountRepository;

@RestController
@RequestMapping("/api/v1/icu/hljld")
@CrossOrigin(origins = {"*"})
public class HljldController {

    private final MongoTemplate mongoTemplate;
    private final HljldPageCountRepository pageCountRepository;

    public HljldController(MongoTemplate mongoTemplate, HljldPageCountRepository pageCountRepository) {
        this.mongoTemplate = mongoTemplate;
        this.pageCountRepository = pageCountRepository;
    }

    @GetMapping("/drug-executions")
    public List<Map<String, Object>> drugExecutions(
            @RequestParam String pid,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date endTime) {
        // 区间相交：跨 07:00 仍在执行的持续用药必须取回，否则本护理日会漏算
        Criteria overlap = new Criteria().andOperator(
                Criteria.where("startTime").lte(endTime),
                new Criteria().orOperator(
                        Criteria.where("endTime").exists(false),
                        Criteria.where("endTime").is(null),
                        Criteria.where("endTime").gt(startTime)));

        Query query = new Query(Criteria.where("pid").is(pid)
                .and("status").ne("invalid")
                .andOperator(overlap));
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
        String pidTrimmed = pid != null ? pid.trim() : "";
        System.out.println("[HLJLD][nurse-records] pid=" + pidTrimmed
            + ", pidLength=" + pidTrimmed.length()
            + ", startTime=" + startTime
            + ", endTime=" + endTime);
        Query query = new Query();
        query.addCriteria(
                Criteria.where("pid").is(pidTrimmed)
                        .and("time").gte(startTime).lt(endTime)
                        .and("valid").ne(false)
                        .and("desc").nin(null, ""));
        query.with(Sort.by(Sort.Direction.ASC, "time"));
        List<Document> docs = mongoTemplate.find(query, Document.class, "nurseRecords");
        System.out.println("[HLJLD][nurse-records] resultCount=" + docs.size());
        return normalizeDocuments(docs);
    }

    @GetMapping("/tube-executions")
    public List<Map<String, Object>> tubeExecutions(
            @RequestParam String pid,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date endTime) {
        // 按pid查询tubeExe，后端过滤tubeRecordList时间范围
        Query query = new Query();
        query.addCriteria(
                Criteria.where("pid").is(pid)
                        .and("valid").ne(false)
                        .and("status").ne("invalid")
                        .and("tubeRecordList").ne(null));
        query.with(Sort.by(Sort.Direction.ASC, "startTime"));
        List<Document> docs = mongoTemplate.find(query, Document.class, "tubeExe");

        // 过滤tubeRecordList中不在时间范围内的记录
        List<Map<String, Object>> result = new ArrayList<>();
        for (Document doc : docs) {
            @SuppressWarnings("unchecked")
            Map<String, Object> normalized = (Map<String, Object>) normalizeUtcValue(doc);

            // 检查tubeExe自身的valid/status
            Object valid = normalized.get("valid");
            if (Boolean.FALSE.equals(valid)) continue;
            Object status = normalized.get("status");
            if ("invalid".equalsIgnoreCase(String.valueOf(status == null ? "" : status).trim())) continue;

            // 过滤tubeRecordList
            Object tubeRecordListObj = normalized.get("tubeRecordList");
            if (tubeRecordListObj instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> tubeRecords = (List<Map<String, Object>>) tubeRecordListObj;
                List<Map<String, Object>> filtered = new ArrayList<>();
                for (Map<String, Object> record : tubeRecords) {
                    // 检查record的valid/status
                    Object rValid = record.get("valid");
                    if (Boolean.FALSE.equals(rValid)) continue;
                    Object rStatus = record.get("status");
                    if ("invalid".equalsIgnoreCase(String.valueOf(rStatus == null ? "" : rStatus).trim())) continue;

                    // 检查time是否在范围内
                    Object timeObj = record.get("time");
                    if (timeObj instanceof Date) {
                        Date recordTime = (Date) timeObj;
                        if (recordTime.compareTo(startTime) >= 0 && recordTime.compareTo(endTime) < 0) {
                            filtered.add(record);
                        }
                    } else if (timeObj instanceof String) {
                        // 已经被normalizeUtcValue转换为UTC ISO字符串，尝试解析
                        try {
                            java.time.Instant instant = java.time.Instant.parse((String) timeObj);
                            long recordMs = instant.toEpochMilli();
                            if (recordMs >= startTime.getTime() && recordMs < endTime.getTime()) {
                                filtered.add(record);
                            }
                        } catch (Exception ignored) {
                            // 无法解析的时间，跳过
                        }
                    }
                }
                normalized.put("tubeRecordList", filtered);
            }

            result.add(normalized);
        }
        return result;
    }

    @GetMapping("/tube-views")
    public List<Map<String, Object>> tubeViews() {
        Query query = new Query();
        query.addCriteria(
                Criteria.where("valid").ne(false)
                        .and("status").ne("invalid"));
        query.with(Sort.by(Sort.Direction.ASC, "tubeType"));
        List<Document> docs = mongoTemplate.find(query, Document.class, "configTubeView");
        return normalizeDocuments(docs);
    }

    /**
     * 递归将 Document 中的 Date/ObjectId 字段转换为可直接给前端使用的值：
     * - Date -> UTC ISO 字符串
     * - ObjectId -> 24位十六进制字符串
     */
    private Object normalizeUtcValue(Object value) {
        if (value instanceof Date) {
            return ((Date) value).toInstant().toString();
        }
        if (value instanceof ObjectId) {
            return ((ObjectId) value).toHexString();
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

    // ── 跨日连续页码 ──

    /**
     * 获取从入科日到指定日期前一天的累计页数（即该日打印时的起始页码）。
     * GET /api/v1/icu/hljld/start-page?pid=xxx&admissionDate=2024-01-15&currentDate=2024-01-20
     * 返回: { "startPageNo": 42 }
     */
    @GetMapping("/start-page")
    public Map<String, Object> getStartPageNo(
            @RequestParam String pid,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate admissionDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate currentDate) {
        LocalDate dayBefore = currentDate.minusDays(1);
        // 查询从入科日到昨天的页数记录
        List<HljldPageCount> records = pageCountRepository.findByPidAndNursingDateBetween(
                pid, admissionDate, dayBefore);
        int total = 0;
        for (HljldPageCount r : records) {
            total += r.getPageCount();
        }
        // 起始页码 = 累计页数 + 1
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("startPageNo", total + 1);
        return result;
    }

    /**
     * 保存某日的页数（打印完成后调用）。
     * POST /api/v1/icu/hljld/page-count
     * Body: { "pid": "xxx", "nursingDate": "2024-01-20", "pageCount": 3 }
     */
    @PostMapping("/page-count")
    public HljldPageCount savePageCount(@RequestBody HljldPageCount body) {
        LocalDate nursingDate = body.getNursingDate();
        String pid = body.getPid();
        // upsert: 已存在则更新，否则新建
        HljldPageCount existing = pageCountRepository.findByPidAndNursingDate(pid, nursingDate).orElse(null);
        if (existing != null) {
            existing.setPageCount(body.getPageCount());
            return pageCountRepository.save(existing);
        }
        return pageCountRepository.save(body);
    }
}
