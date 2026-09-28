package com.smartcare.backend.controller;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 皮肤护理（skinCareInfo）压力性损伤评估明细读取。
 *
 * <p>该集合由 SmartCare 主系统的皮肤护理模块写入（_class = ...skinCare.SkinCareInfo），
 * 本服务只读，用于把 {@code pressureInjuryAssessList} 的评估描述同步到 Braden 表单的「其他」列。
 */
@RestController
@RequestMapping({"/api/v1/icu/skin-care"})
@CrossOrigin(origins = {"*"})
public class SkinCareAssessController {

    /** 只取该类型的压力性损伤评估记录 */
    private static final String TYPE_PRESSURE_INJURY = "压力性损伤评估";
    private static final String COLLECTION = "skinCareInfo";

    private final MongoTemplate mongoTemplate;

    public SkinCareAssessController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    /**
     * 取患者的压力性损伤评估明细，按 recordTime 升序返回。
     *
     * <p>前端以 recordTime 的时刻与 Braden 行 time 做精确匹配，故保留原始时间值不做格式化。
     */
    @GetMapping("/pressure-injury")
    public List<Map<String, Object>> pressureInjury(@RequestParam String pid) {
        Query query = new Query(Criteria.where("pid").is(pid).and("type").is(TYPE_PRESSURE_INJURY));
        List<Document> docs = mongoTemplate.find(query, Document.class, COLLECTION);

        List<Map<String, Object>> result = new ArrayList<>();
        for (Document doc : docs) {
            if (!isValidDoc(doc)) continue;
            Object rawList = doc.get("pressureInjuryAssessList");
            if (!(rawList instanceof List)) continue;
            for (Object item : (List<?>) rawList) {
                if (!(item instanceof Document)) continue;
                Document entry = (Document) item;
                if (Boolean.FALSE.equals(entry.get("valid"))) continue;

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", entry.get("_id") == null ? "" : String.valueOf(entry.get("_id")));
                row.put("recordTime", entry.get("recordTime"));
                row.put("skinMessage", entry.get("skinMessage") == null ? "" : String.valueOf(entry.get("skinMessage")));
                row.put("part", doc.get("part") == null ? "" : String.valueOf(doc.get("part")));
                row.put("assessDate", doc.get("assessDate"));
                result.add(row);
            }
        }
        // 稳定输出顺序，便于前端「同一条 recordTime 只同步一次」的去重结果可复现
        result.sort(Comparator.comparingLong(row -> instantOf(row.get("recordTime"))));
        return result;
    }

    /** 文档级软删标记：status 缺失或为 valid 才展示 */
    private boolean isValidDoc(Document doc) {
        Object status = doc.get("status");
        if (status == null) return true;
        String text = String.valueOf(status).trim();
        return text.isEmpty() || "valid".equalsIgnoreCase(text);
    }

    private long instantOf(Object value) {
        if (value instanceof Date) return ((Date) value).getTime();
        if (value instanceof Number) return ((Number) value).longValue();
        return 0L;
    }
}
