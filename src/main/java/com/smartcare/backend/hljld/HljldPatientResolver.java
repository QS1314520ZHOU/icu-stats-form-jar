package com.smartcare.backend.hljld;

import org.bson.Document;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一患者查询解析器。
 *
 * 支持多种患者标识查询：
 * 1. _id (ObjectId)
 * 2. pid
 * 3. hisPid
 * 4. mrn
 *
 * 患者字段标准化：
 * - 床号: bedNo → hisBed → bedCode
 * - 姓名: name → patientName
 * - 住院号: mrn → hospitalNo → hisPid
 * - 性别: sex → gender (映射为"男"/"女")
 * - 诊断: diagnosis → clinicalDiagnosis → admissionDiagnosis
 */
@Component
public class HljldPatientResolver {

    private static final Logger log = LoggerFactory.getLogger(HljldPatientResolver.class);

    private final MongoTemplate mongoTemplate;

    @Autowired
    public HljldPatientResolver(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    /**
     * 根据患者标识查找患者。
     *
     * @param identifier 患者标识（ObjectId字符串、pid、hisPid或mrn）
     * @return 患者文档，未找到时返回null
     */
    public Document findPatient(String identifier) {
        if (identifier == null || identifier.trim().isEmpty()) {
            return null;
        }

        String value = identifier.trim();
        List<Criteria> criteria = new ArrayList<>();

        // 尝试ObjectId
        if (ObjectId.isValid(value)) {
            criteria.add(Criteria.where("_id").is(new ObjectId(value)));
        }

        // 尝试其他字段
        criteria.add(Criteria.where("pid").is(value));
        criteria.add(Criteria.where("hisPid").is(value));
        criteria.add(Criteria.where("mrn").is(value));

        Query query = new Query(
            new Criteria().orOperator(
                criteria.toArray(new Criteria[0])
            )
        );

        Document patient = mongoTemplate.findOne(query, Document.class, "patient");
        if (patient != null) {
            log.debug("找到患者: identifier={}", identifier);
        } else {
            log.debug("未找到患者: identifier={}", identifier);
        }

        return patient;
    }

    /**
     * 标准化患者信息。
     *
     * @param patient 原始患者文档
     * @return 标准化后的患者信息Map
     */
    public Map<String, String> standardizePatient(Document patient) {
        Map<String, String> info = new LinkedHashMap<>();

        if (patient == null) {
            info.put("bedNo", "");
            info.put("name", "未知");
            info.put("mrn", "");
            info.put("sex", "");
            info.put("age", "");
            info.put("diagnosis", "");
            return info;
        }

        // 床号: bedNo → hisBed → bedCode
        info.put("bedNo", getFirstNonEmpty(patient, "bedNo", "hisBed", "bedCode"));

        // 姓名: name → patientName
        info.put("name", getFirstNonEmpty(patient, "name", "patientName"));

        // 住院号: mrn → hospitalNo → hisPid
        info.put("mrn", getFirstNonEmpty(patient, "mrn", "hospitalNo", "hisPid"));

        // 性别: sex → gender (映射为"男"/"女")
        String sex = getFirstNonEmpty(patient, "sex", "gender");
        info.put("sex", mapGender(sex));

        // 诊断: diagnosis → clinicalDiagnosis → admissionDiagnosis
        String diagnosis = getFirstNonEmpty(patient, "diagnosis", "clinicalDiagnosis", "admissionDiagnosis");
        info.put("diagnosis", truncateDiagnosis(diagnosis));

        return info;
    }

    /**
     * 构建患者信息字符串。
     *
     * @param patient 患者文档
     * @param age     年龄
     * @return 格式化的患者信息字符串
     */
    public String buildPatientInfo(Document patient, String age) {
        Map<String, String> info = standardizePatient(patient);

        StringBuilder sb = new StringBuilder();
        sb.append("床号：").append(info.get("bedNo"));
        sb.append("  姓名：").append(info.get("name"));
        sb.append("  住院号：").append(info.get("mrn"));
        sb.append("  性别：").append(info.get("sex"));
        sb.append("  年龄：").append(age != null ? age : "");
        sb.append("  诊断：").append(info.get("diagnosis"));

        return sb.toString();
    }

    /**
     * 获取第一个非空值。
     */
    private String getFirstNonEmpty(Document doc, String... keys) {
        for (String key : keys) {
            Object v = doc.get(key);
            if (v != null) {
                String val = v.toString().trim();
                if (!val.isEmpty() && !"null".equalsIgnoreCase(val) && !"undefined".equalsIgnoreCase(val)) {
                    return val;
                }
            }
        }
        return "";
    }

    /**
     * 映射性别文本。
     */
    private String mapGender(String gender) {
        if (gender == null || gender.trim().isEmpty()) {
            return "";
        }
        String v = gender.trim();
        if ("Female".equalsIgnoreCase(v) || "F".equalsIgnoreCase(v) || "女".equals(v)) {
            return "女";
        }
        if ("Male".equalsIgnoreCase(v) || "M".equalsIgnoreCase(v) || "男".equals(v)) {
            return "男";
        }
        return v;
    }

    /**
     * 截断诊断文本，只保留第一个诊断。
     */
    private String truncateDiagnosis(String diagnosis) {
        if (diagnosis == null || diagnosis.trim().isEmpty()) {
            return "";
        }
        String v = diagnosis.trim();

        // 找到第一个分隔符
        int idx = -1;
        for (char sep : new char[]{';', '；', ',', '，'}) {
            int c = v.indexOf(sep);
            if (c >= 0 && (idx < 0 || c < idx)) {
                idx = c;
            }
        }

        return idx >= 0 ? v.substring(0, idx).trim() : v;
    }
}
