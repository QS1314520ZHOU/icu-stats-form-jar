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
            String startStr = start.toString();
            String endStr = endExclusive.toString();

            Criteria base = Criteria.where("pid").is(pid)
                    .and("scoreType").is(scoreType)
                    .and("valid").ne(false);
            Criteria timeOverlap = new Criteria().andOperator(
                    Criteria.where("time").lte(endStr),
                    Criteria.where("time").gte(startStr));

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
