package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * 健康教育记录单探测器。
 * 集合：healthEducationRecord，时间字段：assessmentTime（Instant）。
 */
public class HealthEducationProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey = "jkjyForm";

    public HealthEducationProbe(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public String formKey() {
        return formKey;
    }

    @Override
    public IcuFormAvailabilityResponse check(String pid, Instant start, Instant endExclusive) {
        try {
            Query query = new Query(Criteria.where("pid").is(pid)
                    .and("valid").ne(false)
                    .and("assessmentTime").gte(start).lt(endExclusive));
            query.limit(1);

            boolean exists = mongoTemplate.exists(query, "healthEducationRecord");
            return exists
                    ? IcuFormAvailabilityResponse.available(formKey, -1)
                    : IcuFormAvailabilityResponse.empty(formKey);
        } catch (Exception e) {
            return IcuFormAvailabilityResponse.error(formKey, "查询失败，请稍后重试");
        }
    }
}
