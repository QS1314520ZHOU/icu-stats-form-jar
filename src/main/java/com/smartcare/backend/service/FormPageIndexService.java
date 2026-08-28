package com.smartcare.backend.service;

import com.smartcare.backend.entity.FormPageIndex;
import com.smartcare.backend.hljld.HljldPatientResolver;
import com.smartcare.backend.repository.FormPageIndexRepository;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.*;

/**
 * 通用页码管理服务
 * 通过 formType 区分不同表单，一个服务覆盖所有表单
 */
@Service
public class FormPageIndexService {

    private static final Logger log = LoggerFactory.getLogger(FormPageIndexService.class);

    private final FormPageIndexRepository pageIndexRepository;
    private final HljldFlowPdfService flowPdfService;
    private final HljldPatientResolver patientResolver;

    @Autowired
    public FormPageIndexService(FormPageIndexRepository pageIndexRepository,
                                 HljldFlowPdfService flowPdfService,
                                 HljldPatientResolver patientResolver) {
        this.pageIndexRepository = pageIndexRepository;
        this.flowPdfService = flowPdfService;
        this.patientResolver = patientResolver;
    }

    /**
     * 获取指定表单、指定日期的页码信息
     */
    public PageIndexResult getPageInfo(String pid, String formType, String date, String referenceTime) {
        log.info("获取页码信息: pid={}, formType={}, date={}, referenceTime={}", pid, formType, date, referenceTime);

        // 清理重复记录
        cleanDuplicateRecords(pid, formType);

        Optional<FormPageIndex> indexOpt = pageIndexRepository.findTopByPidAndFormType(pid, formType);

        if (indexOpt.isEmpty()) {
            log.info("无页码索引，触发计算: pid={}, formType={}", pid, formType);
            triggerCalculation(pid, formType);
            indexOpt = pageIndexRepository.findTopByPidAndFormType(pid, formType);
            if (indexOpt.isEmpty()) {
                log.warn("页码计算后仍无索引: pid={}, formType={}", pid, formType);
                return new PageIndexResult(1, 1, "failed");
            }
        }

        FormPageIndex index = indexOpt.get();
        String status = index.getStatus();

        // 检查索引是否基于错误的起始日期（入科时间<07:00时应该从前一天开始）
        if ("completed".equals(status) && index.getAdmissionTime() != null
                && !index.getDailyPages().isEmpty()) {
            Calendar calCheck = Calendar.getInstance();
            calCheck.setTime(index.getAdmissionTime());
            int h = calCheck.get(Calendar.HOUR_OF_DAY);
            if (h < 7) {
                calCheck.add(Calendar.DAY_OF_MONTH, -1);
            }
            calCheck.set(Calendar.HOUR_OF_DAY, 7);
            calCheck.set(Calendar.MINUTE, 0);
            calCheck.set(Calendar.SECOND, 0);
            calCheck.set(Calendar.MILLISECOND, 0);
            String expectedFirstDate = new SimpleDateFormat("yyyy-MM-dd").format(calCheck.getTime());
            String actualFirstDate = index.getDailyPages().get(0).getDate();
            if (!expectedFirstDate.equals(actualFirstDate)) {
                log.warn("索引起点日期{}与期望{}不一致，触发重新计算: pid={}", actualFirstDate, expectedFirstDate, pid);
                triggerCalculation(pid, formType);
                return new PageIndexResult(1, 1, "calculating");
            }
        }

        if ("calculating".equals(status)) {
            return new PageIndexResult(1, 1, "calculating");
        }
        if ("failed".equals(status)) {
            return new PageIndexResult(1, 1, "failed");
        }

        Optional<FormPageIndex.DailyPageInfo> dailyInfo = index.getDailyPages().stream()
            .filter(d -> d.getDate().equals(date))
            .findFirst();

        if (dailyInfo.isEmpty()) {
            if (!index.getDailyPages().isEmpty()) {
                String firstDate = index.getDailyPages().get(0).getDate();
                // 请求的日期早于索引中的第一天 → 索引计算起点有误，需要重新计算
                if (date.compareTo(firstDate) < 0) {
                    log.warn("请求日期{}早于索引首日{}，触发重新计算: pid={}", date, firstDate, pid);
                    triggerCalculation(pid, formType);
                    return new PageIndexResult(1, 1, "calculating");
                }
                FormPageIndex.DailyPageInfo last = index.getDailyPages().get(index.getDailyPages().size() - 1);
                return new PageIndexResult(last.getEndPageNo() + 1, 1, "completed");
            }
            return new PageIndexResult(1, 1, "completed");
        }

        return new PageIndexResult(dailyInfo.get().getStartPageNo(), dailyInfo.get().getPageCount(), "completed");
    }

    /**
     * 触发异步计算
     */
    private void triggerCalculation(String pid, String formType) {
        try {
            Document patient = patientResolver.findPatient(pid);
            if (patient == null) {
                log.error("未找到患者信息: pid={}", pid);
                return;
            }

            Date admissionTime = patient.getDate("icuAdmissionTime");
            if (admissionTime == null) {
                admissionTime = patient.getDate("admissionTime");
            }
            if (admissionTime == null) {
                log.error("患者入科时间为空: pid={}", pid);
                return;
            }

            FormPageIndex index = pageIndexRepository.findTopByPidAndFormType(pid, formType)
                .orElse(new FormPageIndex());
            index.setPid(pid);
            index.setFormType(formType);
            index.setAdmissionTime(admissionTime);
            Date dischargeTimeTrigger = patient.getDate("icuDischargeTime");
            if (dischargeTimeTrigger == null) dischargeTimeTrigger = patient.getDate("dischargeTime");
            index.setDischargeTime(dischargeTimeTrigger);
            index.setStatus("calculating");
            index.setProgress(0);
            index.setLastUpdated(new Date());
            pageIndexRepository.save(index);

            recalculatePageIndexes(pid, formType);
        } catch (Exception e) {
            log.error("触发页码计算失败: pid={}, formType={}", pid, formType, e);
        }
    }

    /**
     * 重新计算页码（异步）
     */
    @Async
    public void recalculatePageIndexes(String pid, String formType) {
        Document patient = patientResolver.findPatient(pid);
        if (patient == null) {
            log.error("页码计算-未找到患者: pid={}", pid);
            markFailed(pid, formType, "未找到患者信息");
            return;
        }

        Date admissionTime = patient.getDate("icuAdmissionTime");
        if (admissionTime == null) admissionTime = patient.getDate("admissionTime");
        Date dischargeTime = patient.getDate("icuDischargeTime");
        if (dischargeTime == null) dischargeTime = patient.getDate("dischargeTime");

        if (admissionTime == null) {
            log.error("页码计算-入科时间为空: pid={}", pid);
            markFailed(pid, formType, "入科时间为空");
            return;
        }

        // 确定起始护理日：护理日为 [当日07:00, 次日07:00)
        // 入科时间 < 07:00 → 归上一护理日（与前端 nursingDateForTimestamp 一致）
        Calendar cal = Calendar.getInstance();
        cal.setTime(admissionTime);
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        int minute = cal.get(Calendar.MINUTE);
        if (hour < 7) {
            // 07:00之前 → 前一天的07:00（与前端 nursingDateForTimestamp 一致）
            cal.add(Calendar.DAY_OF_MONTH, -1);
        }
        cal.set(Calendar.HOUR_OF_DAY, 7);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startDate = cal.getTime();
        Date endDate = (dischargeTime != null) ? dischargeTime : new Date();

        FormPageIndex index = pageIndexRepository.findTopByPidAndFormType(pid, formType)
            .orElse(new FormPageIndex());
        index.setPid(pid);
        index.setFormType(formType);
        index.setAdmissionTime(admissionTime);
        index.setDischargeTime(dischargeTime);
        index.setStatus("calculating");
        index.setProgress(0);
        index.setLastUpdated(new Date());
        pageIndexRepository.save(index);

        try {
            List<FormPageIndex.DailyPageInfo> dailyPages = new ArrayList<>();
            int currentPageNo = 1;
            int totalDays = daysBetween(startDate, endDate);
            int processedDays = 0;

            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd");
            cal.setTime(startDate);

            while (!cal.getTime().after(endDate)) {
                String dateStr = dateFormat.format(cal.getTime());
                // 使用当前时间作为referenceTime进行页码计算
                String referenceTime = java.time.OffsetDateTime.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
                int pageCount = flowPdfService.calculateFlowPageCount(pid, dateStr, referenceTime);

                FormPageIndex.DailyPageInfo dailyInfo = new FormPageIndex.DailyPageInfo();
                dailyInfo.setDate(dateStr);
                dailyInfo.setStartPageNo(currentPageNo);
                dailyInfo.setPageCount(pageCount);
                dailyInfo.setEndPageNo(currentPageNo + pageCount - 1);

                dailyPages.add(dailyInfo);
                currentPageNo += pageCount;
                processedDays++;

                if (processedDays % 7 == 0) {
                    int progress = (int) ((processedDays * 100.0) / totalDays);
                    index.setProgress(progress);
                    index.setDailyPages(new ArrayList<>(dailyPages));
                    pageIndexRepository.save(index);
                }

                cal.add(Calendar.DAY_OF_MONTH, 1);
            }

            index.setDailyPages(dailyPages);
            index.setTotalPages(currentPageNo - 1);
            index.setStatus("completed");
            index.setProgress(100);
            index.setLastUpdated(new Date());
            index.setVersion(index.getVersion() + 1);
            pageIndexRepository.save(index);

            log.info("页码计算完成: pid={}, formType={}, totalPages={}", pid, formType, index.getTotalPages());

        } catch (Exception e) {
            log.error("页码计算失败: pid={}, formType={}", pid, formType, e);
            markFailed(pid, formType, e.getMessage());
        }
    }

    private void markFailed(String pid, String formType, String reason) {
        Optional<FormPageIndex> indexOpt = pageIndexRepository.findTopByPidAndFormType(pid, formType);
        if (indexOpt.isPresent()) {
            FormPageIndex index = indexOpt.get();
            index.setStatus("failed");
            index.setLastUpdated(new Date());
            pageIndexRepository.save(index);
        }
    }

    public Map<String, Object> getCalculationStatus(String pid, String formType) {
        Map<String, Object> response = new HashMap<>();
        Optional<FormPageIndex> indexOpt = pageIndexRepository.findTopByPidAndFormType(pid, formType);
        if (indexOpt.isEmpty()) {
            response.put("status", "not_started");
            response.put("progress", 0);
            return response;
        }
        FormPageIndex index = indexOpt.get();
        response.put("status", index.getStatus());
        response.put("progress", index.getProgress());
        response.put("totalPages", index.getTotalPages());
        return response;
    }

    private int daysBetween(Date start, Date end) {
        return (int) ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    /**
     * 清理重复的页码记录
     */
    private void cleanDuplicateRecords(String pid, String formType) {
        List<FormPageIndex> allRecords = pageIndexRepository.findAllByPidAndFormType(pid, formType);
        if (allRecords.size() > 1) {
            log.warn("发现重复页码记录: pid={}, formType={}, count={}", pid, formType, allRecords.size());
            // 保留第一条，删除其余
            for (int i = 1; i < allRecords.size(); i++) {
                pageIndexRepository.deleteById(allRecords.get(i).getId());
            }
        }
    }

    public static class PageIndexResult {
        private final int startPageNo;
        private final int pageCount;
        private final String status;

        public PageIndexResult(int startPageNo, int pageCount, String status) {
            this.startPageNo = startPageNo;
            this.pageCount = pageCount;
            this.status = status;
        }

        public int getStartPageNo() { return startPageNo; }
        public int getPageCount() { return pageCount; }
        public String getStatus() { return status; }
    }
}
