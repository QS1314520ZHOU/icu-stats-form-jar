package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import java.util.Date;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * 基于 tubeExe 集合的探测器。
 * 按 pid + type 检查管道维护记录是否存在。
 * 管道维护的时间在 tubeRecordList 嵌套数组中，需要使用 elemMatch 精确查询。
 */
public class TubeExeProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey;
    private final String tubeType;

    public TubeExeProbe(MongoTemplate mongoTemplate, String formKey, String tubeType) {
        this.mongoTemplate = mongoTemplate;
        this.formKey = formKey;
        this.tubeType = tubeType;
    }

    @Override
    public String formKey() {
        return formKey;
    }

    @Override
    public IcuFormAvailabilityResponse check(String pid, Instant start, Instant endExclusive) {
        try {
            Date startDate = Date.from(start);
            Date endDate = Date.from(endExclusive);

            Criteria base = Criteria.where("pid").is(pid)
                    .and("type").is(tubeType)
                    .and("valid").ne(false)
                    .and("status").ne("invalid");
            Criteria elemMatch = Criteria.where("tubeRecordList").elemMatch(
                    new Criteria().andOperator(
                            Criteria.where("valid").ne(false),
                            Criteria.where("time").gte(startDate).lt(endDate)));

            Query query = new Query(new Criteria().andOperator(base, elemMatch));
            query.limit(1);

            boolean exists = mongoTemplate.exists(query, "tubeExe");
            return exists
                    ? IcuFormAvailabilityResponse.available(formKey, -1)
                    : IcuFormAvailabilityResponse.empty(formKey);
        } catch (Exception e) {
            return IcuFormAvailabilityResponse.error(formKey, "查询失败，请稍后重试");
        }
    }
}
