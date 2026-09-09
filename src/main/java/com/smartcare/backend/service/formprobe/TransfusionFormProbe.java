package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * 输血记录单探测器（虽然不进入统一调阅下拉框，但保留探测能力供白名单使用）。
 * 集合：icu_transfusion_record，按 pid 存在性检查。
 */
public class TransfusionFormProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey = "transfusionForm";

    public TransfusionFormProbe(MongoTemplate mongoTemplate) {
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
                    .and("valid").ne(false));
            query.limit(1);

            boolean exists = mongoTemplate.exists(query, "icu_transfusion_record");
            return exists
                    ? IcuFormAvailabilityResponse.available(formKey, -1)
                    : IcuFormAvailabilityResponse.empty(formKey);
        } catch (Exception e) {
            return IcuFormAvailabilityResponse.error(formKey, "查询失败，请稍后重试");
        }
    }
}
