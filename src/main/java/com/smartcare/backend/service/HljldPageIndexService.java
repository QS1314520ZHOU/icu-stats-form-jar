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
import java.util.stream.Collectors;

/**
 * ICU 护理记录单页码管理服务
 */
@Service
public class HljldPageIndexService {

    private static final Logger log = LoggerFactory.getLogger(HljldPageIndexService.class);

    private final MongoTemplate mongoTemplate;
    private final HljldPageIndexRepository pageIndexRepository;

    // 每页数据行数（用于估算页数）
    private static final int ROWS_PER_PAGE = 25;

    @Autowired
    public HljldPageIndexService(MongoTemplate mongoTemplate, HljldPageIndexRepository pageIndexRepository) {
        this.mongoTemplate = mongoTemplate;
        this.pageIndexRepository = pageIndexRepository;
    }

    /**
     * 获取指定日期的页码信息
     */
    public PageIndexInfo getPageInfo(String pid, String date) {
        Optional<HljldPageIndex> indexOpt = pageIndexRepository.findByPid(pid);
        if (indexOpt.isEmpty()) {
            return new PageIndexInfo(1, 1);
        }

        HljldPageIndex index = indexOpt.get();
        Optional<HljldPageIndex.DailyPageInfo> dailyInfo = index.getDailyPages().stream()
            .filter(d -> d.getDate().equals(date))
            .findFirst();

        if (dailyInfo.isEmpty()) {
            return new PageIndexInfo(1, 1);
        }

        return new PageIndexInfo(dailyInfo.get().getStartPageNo(), dailyInfo.get().getPageCount());
    }

    /**
     * 获取指定日期的起始页码
     */
    public int getStartPageNo(String pid, String date) {
        return getPageInfo(pid, date).getStartPageNo();
    }

    /**
     * 获取指定日期的页数
     */
    public int getPageCount(String pid, String date) {
        return getPageInfo(pid, date).getpageCount();
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
            return;
        }

        Date admissionTime = patient.getDate("admissionTime");
        Date dischargeTime = patient.getDate("dischargeTime");

        if (admissionTime == null) {
            log.error("患者入科时间为空: pid={}", pid);
            return;
        }

        // 2. 确定计算范围
        Calendar cal = Calendar.getInstance();
        cal.setTime(admissionTime);
        cal.set(Calendar.HOUR_OF_DAY, 0);
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

                // 计算当天页数
                int pageCount = calculatePageCount(pid, dateStr);

                HljldPageIndex.DailyPageInfo dailyInfo = new HljldPageIndex.DailyPageInfo();
                dailyInfo.setDate(dateStr);
                dailyInfo.setStartPageNo(currentPageNo);
                dailyInfo.setPageCount(pageCount);
                dailyInfo.setEndPageNo(currentPageNo + pageCount - 1);

                dailyPages.add(dailyInfo);
                currentPageNo += pageCount;
                processedDays++;

                // 更新进度
                int progress = (int) ((processedDays * 100.0) / totalDays);
                index.setProgress(progress);
                pageIndexRepository.save(index);

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
            index.setStatus("failed");
            index.setLastUpdated(new Date());
            pageIndexRepository.save(index);
        }
    }

    /**
     * 计算某天的页数
     */
    private int calculatePageCount(String pid, String date) {
        // 查询当天数据量
        Query query = new Query(Criteria.where("pid").is(pid).and("date").is(date));
        Document record = mongoTemplate.findOne(query, Document.class, "hljld_records");

        if (record == null) {
            return 1; // 空白页
        }

        List<?> timeline = record.getList("timeline", Document.class);
        if (timeline == null || timeline.isEmpty()) {
            return 1; // 空白页
        }

        // 估算页数
        int totalRows = 0;
        for (Object item : timeline) {
            if (item instanceof Document) {
                Document doc = (Document) item;
                String kind = doc.getString("kind");

                if ("time-group".equals(kind)) {
                    List<?> rows = doc.getList("rows", Document.class);
                    totalRows += rows != null ? rows.size() : 1;
                } else if (kind != null && kind.contains("summary")) {
                    totalRows += 2; // 小结占2行
                }
            }
        }

        return Math.max(1, (int) Math.ceil((double) totalRows / ROWS_PER_PAGE));
    }

    /**
     * 获取患者上下文
     */
    private Document getPatientContext(String pid) {
        Query query = new Query(Criteria.where("pid").is(pid));
        return mongoTemplate.findOne(query, Document.class, "patients");
    }

    /**
     * 计算两个日期之间的天数
     */
    private int daysBetween(Date start, Date end) {
        long diff = end.getTime() - start.getTime();
        return (int) (diff / (1000 * 60 * 60 * 24)) + 1;
    }

    /**
     * 页码信息
     */
    public static class PageIndexInfo {
        private final int startPageNo;
        private final int pageCount;

        public PageIndexInfo(int startPageNo, int pageCount) {
            this.startPageNo = startPageNo;
            this.pageCount = pageCount;
        }

        public int getStartPageNo() {
            return startPageNo;
        }

        public int getpageCount() {
            return pageCount;
        }
    }
}
