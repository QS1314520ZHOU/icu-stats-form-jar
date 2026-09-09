package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import java.util.List;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * 基于 bedside 集合的探测器。
 * 按 pid + 一组 param code + 时间范围检查 bedside 记录是否存在。
 * bedside.time 字段为 ISO 字符串，可做字典序比较。
 */
public class BedsideCodeProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey;
    private final List<String> codes;

    public BedsideCodeProbe(MongoTemplate mongoTemplate, String formKey, List<String> codes) {
        this.mongoTemplate = mongoTemplate;
        this.formKey = formKey;
        this.codes = codes;
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
                    .and("valid").ne(false)
                    .and("code").in(codes);
            Criteria timeOverlap = new Criteria().andOperator(
                    Criteria.where("time").lte(endStr),
                    Criteria.where("time").gte(startStr));

            Query query = new Query(new Criteria().andOperator(base, timeOverlap));
            query.limit(1);

            boolean exists = mongoTemplate.exists(query, "bedside");
            return exists
                    ? IcuFormAvailabilityResponse.available(formKey, -1)
                    : IcuFormAvailabilityResponse.empty(formKey);
        } catch (Exception e) {
            return IcuFormAvailabilityResponse.error(formKey, "查询失败，请稍后重试");
        }
    }
}
