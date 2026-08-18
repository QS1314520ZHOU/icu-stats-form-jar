package com.smartcare.backend.service;

import com.smartcare.backend.entity.HljldPageIndex;
import com.smartcare.backend.repository.HljldPageIndexRepository;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.*;

/**
 * ICU 护理记录单页码管理服务
 */
@Service
public class HljldPageIndexService {

    private static final Logger log = LoggerFactory.getLogger(HljldPageIndexService.class);

    private final MongoTemplate mongoTemplate;
    private final HljldPageIndexRepository pageIndexRepository;
    private final HljldPdfService pdfService;

    @Autowired
    public HljldPageIndexService(MongoTemplate mongoTemplate,
                                  HljldPageIndexRepository pageIndexRepository,
                                  HljldPdfService pdfService) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
        this.pdfService = pdfService;
    }

    /**
     * 获取指定日期的页码信息
     * 如果数据库没有索引，自动触发计算并返回 calculating 状态
     */
    public PageIndexResult getPageInfo(String pid, String date) {
        Optional<HljldPageIndex> indexOpt = pageIndexRepository.findByPid(pid);

        if (indexOpt.isEmpty()) {
            // 无索引，自动触发计算
            log.info("数据库无页码索引，自动触发计算: pid={}", pid);
            triggerCalculation(pid);

            // 重新查询（计算可能已同步完成）
            indexOpt = pageIndexRepository.findByPid(pid);
            if (indexOpt.isEmpty()) {
                return new PageIndexResult(1, 1, "failed");
            }
        }

        HljldPageIndex index = indexOpt.get();
        String status = index.getStatus();

        // 正在计算中
        if ("calculating".equals(status)) {
            return new PageIndexResult(1, 1, "calculating");
        }

        // 计算失败
        if ("failed".equals(status)) {
            return new PageIndexResult(1, 1, "failed");
        }

        // 已完成，查找当天数据
        Optional<HljldPageIndex.DailyPageInfo> dailyInfo = index.getDailyPages().stream()
            .filter(d -> d.getDate().equals(date))
            .findFirst();

        if (dailyInfo.isEmpty()) {
            // 索引中没有这一天的数据（可能是新一天），返回最后一页的后续
            if (!index.getDailyPages().isEmpty()) {
                HljldPageIndex.DailyPageInfo last = index.getDailyPages().get(index.getDailyPages().size() - 1);
                return new PageIndexResult(last.getEndPageNo() + 1, 1, "completed");
            }
            return new PageIndexResult(1, 1, "completed");
        }

        return new PageIndexResult(dailyInfo.get().getStartPageNo(), dailyInfo.get().getPageCount(), "completed");
    }

    /**
     * 触发异步计算（不阻塞当前请求）
     */
    private void triggerCalculation(String pid) {
        try {
            // 先标记状态为 calculating
            Document patient = getPatientContext(pid);
            if (patient == null) {
                log.error("未找到患者信息: pid={}", pid);
                return;
            }

            Date admissionTime = patient.getDate("admissionTime");
            if (admissionTime == null) {
                log.error("患者入科时间为空: pid={}", pid);
                return;
            }

            HljldPageIndex index = pageIndexRepository.findByPid(pid).orElse(new HljldPageIndex());
            index.setPid(pid);
            index.setAdmissionTime(admissionTime);
            index.setDischargeTime(patient.getDate("dischargeTime"));
            index.setStatus("calculating");
            index.setProgress(0);
            index.setLastUpdated(new Date());
            pageIndexRepository.save(index);

            // 异步执行计算
            recalculatePageIndexes(pid);
        } catch (Exception e) {
            log.error("触发页码计算失败: pid={}", pid, e);
        }
    }

    /**
     * 重新计算页码（异步）
     */
    @Async
    public void recalculatePageIndexes(String pid) {
        log.info("开始重新计算页码: pid={}", pid);

        // 1. 查询患者入科和出科时间
        Document patient = getPatientContext(pid);
        if (patient == null) {
            log.error("未找到患者信息: pid={}", pid);
            markFailed(pid, "未找到患者信息");
            return;
        }

        Date admissionTime = patient.getDate("admissionTime");
        Date dischargeTime = patient.getDate("dischargeTime");

        if (admissionTime == null) {
            log.error("患者入科时间为空: pid={}", pid);
            markFailed(pid, "入科时间为空");
            return;
        }

        // 2. 确定计算范围
        Calendar cal = Calendar.getInstance();
        cal.setTime(admissionTime);
        cal.set(Calendar.HOUR_OF_DAY, 7);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startDate = cal.getTime();

        Date endDate;
        if (dischargeTime != null) {
            endDate = dischargeTime;
        } else {
            endDate = new Date(); // 当前时间
        }

        // 3. 更新索引状态为计算中
        HljldPageIndex index = pageIndexRepository.findByPid(pid).orElse(new HljldPageIndex());
        index.setPid(pid);
        index.setAdmissionTime(admissionTime);
        index.setDischargeTime(dischargeTime);
        index.setStatus("calculating");
        index.setProgress(0);
        index.setLastUpdated(new Date());
        pageIndexRepository.save(index);

        try {
            // 4. 分批计算
            List<HljldPageIndex.DailyPageInfo> dailyPages = new ArrayList<>();
            int currentPageNo = 1;
            int totalDays = daysBetween(startDate, endDate);
            int processedDays = 0;

            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd");

            cal.setTime(startDate);
            while (!cal.getTime().after(endDate)) {
                String dateStr = dateFormat.format(cal.getTime());

                // 使用 HljldPdfService 的分页逻辑计算当天页数
                int pageCount = pdfService.calculatePageCount(pid, dateStr);

                HljldPageIndex.DailyPageInfo dailyInfo = new HljldPageIndex.DailyPageInfo();
                dailyInfo.setDate(dateStr);
                dailyInfo.setStartPageNo(currentPageNo);
                dailyInfo.setPageCount(pageCount);
                dailyInfo.setEndPageNo(currentPageNo + pageCount - 1);

                dailyPages.add(dailyInfo);
                currentPageNo += pageCount;
                processedDays++;

                // 每处理 7 天保存一次进度
                if (processedDays % 7 == 0) {
                    int progress = (int) ((processedDays * 100.0) / totalDays);
                    index.setProgress(progress);
                    index.setDailyPages(new ArrayList<>(dailyPages));
                    pageIndexRepository.save(index);
                    log.info("页码计算进度: pid={}, {}/{}天, {}%", pid, processedDays, totalDays, progress);
                }

                cal.add(Calendar.DAY_OF_MONTH, 1);
            }

            // 5. 保存最终结果
            index.setDailyPages(dailyPages);
            index.setTotalPages(currentPageNo - 1);
            index.setStatus("completed");
            index.setProgress(100);
            index.setLastUpdated(new Date());
            index.setVersion(index.getVersion() + 1);
            pageIndexRepository.save(index);

            log.info("页码计算完成: pid={}, totalPages={}", pid, index.getTotalPages());

        } catch (Exception e) {
            log.error("页码计算失败: pid={}", pid, e);
            markFailed(pid, e.getMessage());
        }
    }

    /**
     * 标记计算失败
     */
    private void markFailed(String pid, String reason) {
        Optional<HljldPageIndex> indexOpt = pageIndexRepository.findByPid(pid);
        if (indexOpt.isPresent()) {
            HljldPageIndex index = indexOpt.get();
            index.setStatus("failed");
            index.setLastUpdated(new Date());
            pageIndexRepository.save(index);
        }
    }

    /**
     * 获取患者上下文（从 patient 集合）
     * pid 可能是 _id 也可能是 pid 字段
     */
    private Document getPatientContext(String pid) {
        Query query = new Query(new Criteria().orOperator(
            Criteria.where("_id").is(pid),
            Criteria.where("pid").is(pid)
        ));
        return mongoTemplate.findOne(query, Document.class, "patient");
    }

    /**
     * 获取计算状态（供 Controller 调用）
     */
    public Map<String, Object> getCalculationStatus(String pid) {
        Map<String, Object> response = new HashMap<>();
        Optional<HljldPageIndex> indexOpt = pageIndexRepository.findByPid(pid);

        if (indexOpt.isEmpty()) {
            response.put("status", "not_started");
            response.put("progress", 0);
            return response;
        }

        HljldPageIndex index = indexOpt.get();
        response.put("status", index.getStatus());
        response.put("progress", index.getProgress());
        response.put("totalPages", index.getTotalPages());
        return response;
    }

    /**
     * 计算两个日期之间的天数
     */
    private int daysBetween(Date start, Date end) {
        long diff = end.getTime() - start.getTime();
        return (int) (diff / (1000 * 60 * 60 * 24)) + 1;
    }

    /**
     * 页码信息结果（含状态）
     */
    public static class PageIndexResult {
        private final int startPageNo;
        private final int pageCount;
        private final String status; // completed, calculating, failed

        public PageIndexResult(int startPageNo, int pageCount, String status) {
            this.startPageNo = startPageNo;
            this.pageCount = pageCount;
            this.status = status;
        }

        public int getStartPageNo() {
            return startPageNo;
        }

        public int getPageCount() {
            return pageCount;
        }

        public String getStatus() {
            return status;
        }
    }
}
