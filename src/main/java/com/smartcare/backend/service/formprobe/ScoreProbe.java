package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * 基于 score 集合的探测器。
 * 按 pid + scoreType 检查评分记录是否存在。
 * Score.time 字段为 ISO 字符串，可做字典序比较。
 */
public class ScoreProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey;
    private final String scoreType;

    public ScoreProbe(MongoTemplate mongoTemplate, String formKey, String scoreType) {
        this.mongoTemplate = mongoTemplate;
        this.formKey = formKey;
        this.scoreType = scoreType;
    }

    @Override
    public String formKey() {
        return formKey;
    }

    @Override
    public IcuFormAvailabilityResponse check(String pid, Instant start, Instant endExclusive) {
        try {
            // 将 Instant 转换为上海时区的本地时间字符串进行比较
            // 数据库中 time 字段格式可能是 "2026-09-05 09:33:00" 或 ISO 格式
            java.time.ZoneId shanghaiZone = java.time.ZoneId.of("Asia/Shanghai");
            java.time.LocalDateTime startLocal = java.time.LocalDateTime.ofInstant(start, shanghaiZone);
            java.time.LocalDateTime endLocal = java.time.LocalDateTime.ofInstant(endExclusive, shanghaiZone);

            // 生成多种格式的时间字符串用于匹配
            String startStr = start.toString(); // ISO 格式: 2026-09-01T00:00:00Z
            String endStr = endExclusive.toString();
            String startLocalStr = startLocal.toString().replace("T", " "); // 2026-09-01 00:00
            String endLocalStr = endLocal.toString().replace("T", " ");

            Criteria base = Criteria.where("pid").is(pid)
                    .and("scoreType").is(scoreType)
                    .and("valid").ne(false);

            // 使用 orOperator 匹配多种时间格式
            Criteria timeGte = new Criteria().orOperator(
                    Criteria.where("time").gte(startStr),
                    Criteria.where("time").gte(startLocalStr));
            Criteria timeLte = new Criteria().orOperator(
                    Criteria.where("time").lte(endStr),
                    Criteria.where("time").lte(endLocalStr));

            Criteria timeOverlap = new Criteria().andOperator(timeGte, timeLte);

            Query query = new Query(new Criteria().andOperator(base, timeOverlap));
            query.limit(1);

            boolean exists = mongoTemplate.exists(query, "score");
            return exists
                    ? IcuFormAvailabilityResponse.available(formKey, -1)
                    : IcuFormAvailabilityResponse.empty(formKey);
        } catch (Exception e) {
            return IcuFormAvailabilityResponse.error(formKey, "查询失败，请稍后重试");
        }
    }
}
