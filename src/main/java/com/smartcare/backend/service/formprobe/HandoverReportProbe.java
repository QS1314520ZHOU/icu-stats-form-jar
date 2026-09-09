package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import java.util.Date;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * 交班报告探测器。
 * 交班报告按科室和日期生成，但统一调阅按患者维度查询。
 * 检查 nurseRecords 中该患者在时间范围内是否有有效记录。
 */
public class HandoverReportProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey = "handoverReport";

    public HandoverReportProbe(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
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

            // 交班报告依赖 nurseRecords、bedside 等数据，检查 nurseRecords 中该患者是否有数据
            Query nurseQuery = new Query(Criteria.where("pid").is(pid)
                    .and("time").gte(startDate).lt(endDate)
                    .and("valid").ne(false));
            nurseQuery.limit(1);
            if (mongoTemplate.exists(nurseQuery, "nurseRecords")) {
                return IcuFormAvailabilityResponse.available(formKey, -1);
            }

            // 也检查 bedside 记录
            Query bedsideQuery = new Query(Criteria.where("pid").is(pid)
                    .and("valid").ne(false)
                    .and("time").gte(startDate).lt(endDate));
            bedsideQuery.limit(1);
            if (mongoTemplate.exists(bedsideQuery, "bedside")) {
                return IcuFormAvailabilityResponse.available(formKey, -1);
            }

            return IcuFormAvailabilityResponse.empty(formKey);
        } catch (Exception e) {
            return IcuFormAvailabilityResponse.error(formKey, "查询失败，请稍后重试");
        }
    }
}
