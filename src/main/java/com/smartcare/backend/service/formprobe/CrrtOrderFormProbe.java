package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * CRRT 治疗医嘱单探测器。
 * 集合：crrt_order_form，时间字段：orderTime（String，ISO 格式）。
 */
public class CrrtOrderFormProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey = "crrtOrderForm";

    public CrrtOrderFormProbe(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
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

            Query query = new Query(Criteria.where("pid").is(pid)
                    .and("orderTime").gte(startStr).lt(endStr));
            query.limit(1);

            boolean exists = mongoTemplate.exists(query, "crrt_order_form");
            return exists
                    ? IcuFormAvailabilityResponse.available(formKey, -1)
                    : IcuFormAvailabilityResponse.empty(formKey);
        } catch (Exception e) {
            return IcuFormAvailabilityResponse.error(formKey, "查询失败，请稍后重试");
        }
    }
}
