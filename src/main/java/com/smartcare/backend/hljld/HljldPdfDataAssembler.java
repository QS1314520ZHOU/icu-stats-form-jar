package com.smartcare.backend.hljld;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 编排数据构建全流程，对应前端 toViewModel 的核心逻辑。
 *
 * 职责：
 * 1. 从 Loader 获取原始数据
 * 2. 确定时间范围（护理日、有效范围、截断点）
 * 3. 调用 Utils 处理数据
 * 4. 调用 RowBuilder 构建行和分组
 * 5. 调用 SummaryCalculator 构建小结
 * 6. 组装最终的 HljldViewModel
 */
@Service
public class HljldPdfDataAssembler {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfDataAssembler.class);

    @Autowired
    private HljldNursingDayLoader loader;

    @Autowired
    private HljldRowBuilder rowBuilder;

    @Autowired
    private HljldSummaryCalculator summaryCalculator;

    /**
     * 构建视图模型，对应前端 toViewModel。
     *
     * @param nursingDay 护理日日期字符串，格式 yyyy-MM-dd
     * @param deptId     科室ID
     * @param patientId  患者ID
     * @param page       页码（从0开始）
     * @param pageSize   每页数据行数
     * @return HljldViewModel
     */
    public HljldViewModel buildViewModel(String nursingDay, String deptId, String patientId, int page, int pageSize, String referenceTime) {
        // 1. 解析护理日日期并确定范围
        java.time.LocalDate localDate = java.time.LocalDate.parse(nursingDay, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE);
        Date nursingDayStart = Date.from(java.time.ZonedDateTime.of(localDate.atTime(7, 0), java.time.ZoneId.of("Asia/Shanghai")).toInstant());
        Date nursingDayEnd = Date.from(java.time.ZonedDateTime.of(localDate.plusDays(1).atTime(7, 0), java.time.ZoneId.of("Asia/Shanghai")).toInstant());

        // 2. 加载原始数据（包括患者信息）
        HljldSourceData source = loader.loadAll(patientId, nursingDayStart, nursingDayEnd);

        // 3. 获取入科时间（优先使用 icuAdmissionTime，其次 admissionTime）
        String admissionTimeStr = null;
        if (source.getPatientInfo() != null) {
            Object admissionTimeObj = source.getPatientInfo().get("icuAdmissionTime");
            if (admissionTimeObj == null) {
                admissionTimeObj = source.getPatientInfo().get("admissionTime");
            }
            log.info("患者入科时间原始值: {}", admissionTimeObj);
            if (admissionTimeObj instanceof Date) {
                // 使用 ISO 8601 格式，时区偏移量带冒号
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
                sdf.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
                admissionTimeStr = sdf.format((Date) admissionTimeObj);
            } else if (admissionTimeObj instanceof String) {
                admissionTimeStr = (String) admissionTimeObj;
            }
        }
        log.info("入科时间字符串: {}", admissionTimeStr);

        // 使用 HljldPdfRequestContext 统一管理时间
        HljldPdfRequestContext context = HljldPdfRequestContext.of(nursingDay, referenceTime, admissionTimeStr);
        log.info("Context入科时间: {}", context.getAdmissionTime());
        log.info("shouldShowDaySummary: {}", context.shouldShowDaySummary());
        long nowMs = context.getReferenceTimeMs();

        // 3. 获取当前护士签名
        String currentNurseName = resolveCurrentNurseName(source, nowMs);

        // 4. 构建时间行（使用护理日范围，传入固定的 nowMs）
        List<HljldTimeRow> timeRows = rowBuilder.buildRows(source, nursingDayStart, nursingDayEnd, false, nowMs);

        // 5. 构建显示分组
        List<HljldTimeGroup> displayGroups = rowBuilder.buildDisplayGroups(timeRows);

        // 5.1 从 displayGroups 中分离出续用行（key 以 "carry-over-" 开头）
        List<HljldTimeGroup> continuationGroups = new ArrayList<>();
        List<HljldTimeGroup> regularGroups = new ArrayList<>();
        for (HljldTimeGroup group : displayGroups) {
            if (group.getKey() != null && group.getKey().startsWith("carry-over-")) {
                continuationGroups.add(group);
            } else {
                regularGroups.add(group);
            }
        }

        // 6. 昨天的护理日开始时间
        Date yesterdayStart = HljldUtils.startOfNursingDay(Date.from(localDate.minusDays(1).atStartOfDay(java.time.ZoneId.of("Asia/Shanghai")).toInstant()));

        // 7. 构建小结
        HljldSummary daySummary = summaryCalculator.buildSummary(
            HljldSummary.Kind.DAY, source, nursingDayStart, nursingDayEnd, yesterdayStart, nowMs);

        HljldSummary shiftSummary = summaryCalculator.buildSummary(
            HljldSummary.Kind.SHIFT, source, nursingDayStart, nursingDayEnd, yesterdayStart, nowMs);

        HljldSummary fullDaySummary = summaryCalculator.buildSummary(
            HljldSummary.Kind.FULL_DAY, source, nursingDayStart, nursingDayEnd, yesterdayStart, nowMs);

        HljldSummary dischargeSummary = summaryCalculator.buildSummary(
            HljldSummary.Kind.DISCHARGE, source, nursingDayStart, nursingDayEnd, yesterdayStart, nowMs);

        // 11. 构建时间轴（使用 context 控制门禁）
        List<HljldTimelineItem> timeline = summaryCalculator.buildTimeline(
            context, regularGroups, continuationGroups, daySummary, fullDaySummary);

        // 12. 构建分页数据
        // 将续用行和普通行合并用于分页计算
        List<HljldTimeGroup> allGroupsForPaging = new ArrayList<>();
        allGroupsForPaging.addAll(continuationGroups);
        allGroupsForPaging.addAll(regularGroups);

        int totalRows = allGroupsForPaging.stream().mapToInt(g -> g.getRows().size()).sum();
        int totalPages = (int) Math.ceil((double) totalRows / pageSize);

        // 分页截取
        int startRow = page * pageSize;
        int endRow = Math.min(startRow + pageSize, totalRows);
        int startGroupIndex = 0;
        int startOffset = 0;
        int accumulated = 0;

        for (int i = 0; i < allGroupsForPaging.size(); i++) {
            HljldTimeGroup group = allGroupsForPaging.get(i);
            if (accumulated + group.getRows().size() > startRow) {
                startGroupIndex = i;
                startOffset = startRow - accumulated;
                break;
            }
            accumulated += group.getRows().size();
        }

        List<HljldTimeGroup> pagedGroups = new ArrayList<>();
        int remaining = pageSize;
        for (int i = startGroupIndex; i < allGroupsForPaging.size() && remaining > 0; i++) {
            HljldTimeGroup group = allGroupsForPaging.get(i);
            List<HljldDisplayRow> rows = group.getRows();
            int offset = (i == startGroupIndex) ? startOffset : 0;
            int count = Math.min(rows.size() - offset, remaining);

            HljldTimeGroup pagedGroup = new HljldTimeGroup();
            pagedGroup.setKey(group.getKey());
            pagedGroup.setTimestamp(group.getTimestamp());
            pagedGroup.setRows(rows.subList(offset, offset + count));
            pagedGroups.add(pagedGroup);

            remaining -= count;
        }

        // 13. 收集引流液名称列表
        List<String> drainNames = collectDrainNames(source);

        // 14. 组装视图模型
        HljldViewModel viewModel = new HljldViewModel();
        viewModel.setNursingDay(nursingDay);
        viewModel.setNurseSignature(currentNurseName);
        viewModel.setDisplayGroups(pagedGroups);
        viewModel.setDaySummary(daySummary);
        viewModel.setShiftSummary(shiftSummary);
        viewModel.setFullDaySummary(fullDaySummary);
        viewModel.setDischargeSummary(dischargeSummary);
        viewModel.setTimeline(timeline);
        viewModel.setPage(page);
        viewModel.setPageSize(pageSize);
        viewModel.setTotalRows(totalRows);
        viewModel.setTotalPages(totalPages);
        viewModel.setDrainNames(drainNames);
        viewModel.setContext(context);

        return viewModel;
    }

    /**
     * 构建打印用的视图模型（无分页，包含所有数据）。
     * 对应前端 printPDF 时获取所有数据。
     */
    public HljldViewModel buildPrintViewModel(String nursingDay, String deptId, String patientId, String referenceTime) {
        return buildViewModel(nursingDay, deptId, patientId, 0, Integer.MAX_VALUE, referenceTime);
    }

    /**
     * 计算页数，供 FormPageIndexService 调用。
     * 使用与实际 PDF 生成一致的 timeline 行计数。
     */
    public int calculatePageCount(String nursingDay, String deptId, String patientId, int pageSize) {
        long nowMs = System.currentTimeMillis();

        java.time.LocalDate localDate = java.time.LocalDate.parse(nursingDay, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE);
        Date nursingDayStart = HljldUtils.startOfNursingDay(Date.from(localDate.atStartOfDay(java.time.ZoneId.of("Asia/Shanghai")).toInstant()));
        Date nursingDayEnd = HljldUtils.endOfNursingDay(Date.from(localDate.atStartOfDay(java.time.ZoneId.of("Asia/Shanghai")).toInstant()));

        HljldSourceData source = loader.loadAll(patientId, nursingDayStart, nursingDayEnd);

        List<HljldTimeRow> timeRows = rowBuilder.buildRows(source, nursingDayStart, nursingDayEnd, false, nowMs);
        List<HljldTimeGroup> displayGroups = rowBuilder.buildDisplayGroups(timeRows);

        // 与 generateDailyPdf 使用相同的 timeline 行计数
        int totalRows = countTimelinePrintableRows(displayGroups, nowMs);
        return (int) Math.ceil((double) totalRows / pageSize);
    }

    /**
     * 统计 timeline 中可打印行数：displayGroup 行 + 小结摘要行。
     * 与 generateDailyPdf 中的分页逻辑保持一致。
     */
    public int countTimelinePrintableRows(List<HljldTimeGroup> displayGroups, long nowMs) {
        int displayRows = displayGroups.stream().mapToInt(g -> g.getRows().size()).sum();
        // 小结摘要行：每个小结至少占 1 行（日间小结、班段小结、24h总结、出科总结）
        // 实际 PDF 中如果 summary 存在，会额外占行
        int summaryRows = 0;
        // 当前 PDF 实际只渲染 displayGroups，summary 在 ViewModel 中计算但未渲染
        // 修复后 summary 行也参与分页
        return displayRows + summaryRows;
    }

    // ══════════════════════════════════════════════════════════
    //  私有辅助方法
    // ══════════════════════════════════════════════════════════

    private String resolveCurrentNurseName(HljldSourceData source, long nowMs) {
        String signUserId = HljldUtils.resolveYishiSignerId(nowMs, source.getBedside());
        if (signUserId.isEmpty()) return "";
        return source.getAccountMap().getOrDefault(signUserId, "");
    }

    private List<String> collectDrainNames(HljldSourceData source) {
        Set<String> seen = new LinkedHashSet<>();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        sdf.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));

        for (Document record : source.getBedside()) {
            if (!HljldUtils.isDrainCode(str(record, "code"))) continue;

            String timeStr = str(record, "time");
            if (timeStr.isEmpty()) continue;

            try {
                Date time = sdf.parse(timeStr);
                String name = HljldUtils.drainName(str(record, "code"));
                if (!name.isEmpty()) {
                    seen.add(name);
                }
            } catch (Exception e) {
                // skip
            }
        }

        return new ArrayList<>(seen);
    }

    private static String str(Document doc, String key) {
        Object v = doc.get(key);
        return v != null ? v.toString().trim() : "";
    }

    /**
     * 视图模型DTO。
     */
    public static class HljldViewModel {
        private String nursingDay;
        private String nurseSignature;
        private List<HljldTimeGroup> displayGroups;
        private HljldSummary daySummary;
        private HljldSummary shiftSummary;
        private HljldSummary fullDaySummary;
        private HljldSummary dischargeSummary;
        private List<HljldTimelineItem> timeline;
        private int page;
        private int pageSize;
        private int totalRows;
        private int totalPages;
        private List<String> drainNames;
        private HljldPdfRequestContext context;  // 请求上下文

        // Getters and Setters
        public String getNursingDay() { return nursingDay; }
        public void setNursingDay(String nursingDay) { this.nursingDay = nursingDay; }
        public String getNurseSignature() { return nurseSignature; }
        public void setNurseSignature(String nurseSignature) { this.nurseSignature = nurseSignature; }
        public List<HljldTimeGroup> getDisplayGroups() { return displayGroups; }
        public void setDisplayGroups(List<HljldTimeGroup> displayGroups) { this.displayGroups = displayGroups; }
        public HljldSummary getDaySummary() { return daySummary; }
        public void setDaySummary(HljldSummary daySummary) { this.daySummary = daySummary; }
        public HljldSummary getShiftSummary() { return shiftSummary; }
        public void setShiftSummary(HljldSummary shiftSummary) { this.shiftSummary = shiftSummary; }
        public HljldSummary getFullDaySummary() { return fullDaySummary; }
        public void setFullDaySummary(HljldSummary fullDaySummary) { this.fullDaySummary = fullDaySummary; }
        public HljldSummary getDischargeSummary() { return dischargeSummary; }
        public void setDischargeSummary(HljldSummary dischargeSummary) { this.dischargeSummary = dischargeSummary; }
        public List<HljldTimelineItem> getTimeline() { return timeline; }
        public void setTimeline(List<HljldTimelineItem> timeline) { this.timeline = timeline; }
        public int getPage() { return page; }
        public void setPage(int page) { this.page = page; }
        public int getPageSize() { return pageSize; }
        public void setPageSize(int pageSize) { this.pageSize = pageSize; }
        public int getTotalRows() { return totalRows; }
        public void setTotalRows(int totalRows) { this.totalRows = totalRows; }
        public int getTotalPages() { return totalPages; }
        public void setTotalPages(int totalPages) { this.totalPages = totalPages; }
        public List<String> getDrainNames() { return drainNames; }
        public void setDrainNames(List<String> drainNames) { this.drainNames = drainNames; }
        public HljldPdfRequestContext getContext() { return context; }
        public void setContext(HljldPdfRequestContext context) { this.context = context; }
    }
}
