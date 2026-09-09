package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;
import java.util.Date;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

/**
 * 护理记录单 (hljldFormPDFNew) 探测器。
 * 数据来自多个集合：bedside、drugExe、nurseRecords、tubeExe。
 * 任一有效来源在时间范围内有数据即返回 AVAILABLE。
 * 复用 HljldController 已有的区间相交规则。
 */
public class HljldProbe implements IcuFormDataProbe {

    private final MongoTemplate mongoTemplate;
    private final String formKey = "hljldFormPDFNew";

    public HljldProbe(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public String formKey() {
        return formKey;
    }

    @Override
    public IcuFormAvailabilityResponse check(String pid, Instant start, Instant endExclusive) {
        try {
            Date startTime = Date.from(start);
            Date endTime = Date.from(endExclusive);

            // 1. 检查 drugExe（区间相交查询）
            Criteria drugOverlap = new Criteria().andOperator(
                    Criteria.where("startTime").lte(endTime),
                    new Criteria().orOperator(
                            Criteria.where("endTime").exists(false),
                            Criteria.where("endTime").is(null),
                            Criteria.where("endTime").gt(startTime)));
            Query drugQuery = new Query(Criteria.where("pid").is(pid)
                    .and("status").ne("invalid")
                    .andOperator(drugOverlap));
            drugQuery.limit(1);
            if (mongoTemplate.exists(drugQuery, "drugExe")) {
                return IcuFormAvailabilityResponse.available(formKey, -1);
            }

            // 2. 检查 nurseRecords（时间范围 + 有效描述）
            Query nurseQuery = new Query(Criteria.where("pid").is(pid)
                    .and("time").gte(startTime).lt(endTime)
                    .and("valid").ne(false)
                    .and("desc").nin(null, ""));
            nurseQuery.limit(1);
            if (mongoTemplate.exists(nurseQuery, "nurseRecords")) {
                return IcuFormAvailabilityResponse.available(formKey, -1);
            }

            // 3. 检查 tubeExe（嵌套数组时间范围）
            Criteria tubeElemMatch = Criteria.where("tubeRecordList").elemMatch(
                    new Criteria().andOperator(
                            Criteria.where("valid").ne(false),
                            Criteria.where("time").gte(startTime).lt(endTime)));
            Query tubeQuery = new Query(Criteria.where("pid").is(pid)
                    .and("valid").ne(false)
                    .and("status").ne("invalid")
                    .and("tubeRecordList").ne(null)
                    .andOperator(tubeElemMatch));
            tubeQuery.limit(1);
            if (mongoTemplate.exists(tubeQuery, "tubeExe")) {
                return IcuFormAvailabilityResponse.available(formKey, -1);
            }

            // 4. 检查 bedside（时间范围 + 有效记录）
            String startStr = start.toString();
            String endStr = endExclusive.toString();
            Query bedsideQuery = new Query(Criteria.where("pid").is(pid)
                    .and("valid").ne(false)
                    .and("time").gte(startStr).lte(endStr));
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
