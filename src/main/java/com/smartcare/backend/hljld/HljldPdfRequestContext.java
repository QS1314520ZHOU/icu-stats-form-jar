package com.smartcare.backend.hljld;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Date;

public final class HljldPdfRequestContext {

    public static final ZoneId ZONE =
        ZoneId.of("Asia/Shanghai");

    private final LocalDate nursingDate;
    private final Instant referenceTime;
    private final Instant admissionTime;  // 入科时间

    private HljldPdfRequestContext(
        LocalDate nursingDate,
        Instant referenceTime,
        Instant admissionTime
    ) {
        this.nursingDate = nursingDate;
        this.referenceTime = referenceTime;
        this.admissionTime = admissionTime;
    }

    public static HljldPdfRequestContext of(
        String nursingDateText,
        String referenceTimeText
    ) {
        return of(nursingDateText, referenceTimeText, null);
    }

    public static HljldPdfRequestContext of(
        String nursingDateText,
        String referenceTimeText,
        String admissionTimeText
    ) {
        LocalDate nursingDate =
            LocalDate.parse(nursingDateText);

        Instant referenceTime =
            referenceTimeText == null ||
            referenceTimeText.trim().isEmpty()
                ? Instant.now()
                : OffsetDateTime
                    .parse(referenceTimeText.trim())
                    .toInstant();

        Instant admissionTime = null;
        if (admissionTimeText != null && !admissionTimeText.trim().isEmpty()) {
            try {
                admissionTime = OffsetDateTime.parse(admissionTimeText.trim()).toInstant();
            } catch (Exception e) {
                // 尝试解析日期时间格式
                try {
                    java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
                    sdf.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
                    Date d = sdf.parse(admissionTimeText.trim());
                    admissionTime = d.toInstant();
                } catch (Exception ex) {
                    // 忽略解析错误
                }
            }
        }

        return new HljldPdfRequestContext(
            nursingDate,
            referenceTime,
            admissionTime
        );
    }

    public LocalDate getNursingDate() {
        return nursingDate;
    }

    public long getReferenceTimeMs() {
        return referenceTime.toEpochMilli();
    }

    public Instant getAdmissionTime() {
        return admissionTime;
    }

    public long getAdmissionTimeMs() {
        return admissionTime != null ? admissionTime.toEpochMilli() : 0;
    }

    public ZonedDateTime getNursingDayStart() {
        return nursingDate
            .atTime(7, 0)
            .atZone(ZONE);
    }

    public ZonedDateTime getDaySummaryTime() {
        return nursingDate
            .atTime(17, 0)
            .atZone(ZONE);
    }

    public ZonedDateTime getNursingDayEnd() {
        return nursingDate
            .plusDays(1)
            .atTime(7, 0)
            .atZone(ZONE);
    }

    public long getNursingDayStartMs() {
        return getNursingDayStart()
            .toInstant()
            .toEpochMilli();
    }

    public long getDaySummaryTimeMs() {
        return getDaySummaryTime()
            .toInstant()
            .toEpochMilli();
    }

    public long getNursingDayEndMs() {
        return getNursingDayEnd()
            .toInstant()
            .toEpochMilli();
    }

    public long getEffectiveEndMs() {
        return Math.min(
            getReferenceTimeMs(),
            getNursingDayEndMs()
        );
    }

    /**
     * 判断是否应该显示日间小结。
     * 规则：
     * 1. 当前时间必须 >= 17:00
     * 2. 患者入科时间必须在当天 17:00 之前（如果入科时间在当天）
     */
    public boolean shouldShowDaySummary() {
        if (getReferenceTimeMs() < getDaySummaryTimeMs()) {
            return false;
        }

        // 如果有入科时间，检查入科时间是否在当天17:00之前
        if (admissionTime != null) {
            long admissionMs = admissionTime.toEpochMilli();
            long nursingDayStartMs = getNursingDayStartMs();
            long daySummaryTimeMs = getDaySummaryTimeMs();

            // 如果入科时间在本护理日范围内
            if (admissionMs >= nursingDayStartMs && admissionMs < daySummaryTimeMs) {
                // 入科时间在17:00之前，显示日间小结
                return true;
            } else if (admissionMs >= daySummaryTimeMs) {
                // 入科时间在17:00之后，不显示日间小结
                return false;
            }
            // 入科时间在本护理日之前，正常显示
        }

        return true;
    }

    /**
     * 判断是否应该显示24小时总结。
     * 规则：当前时间必须 >= 次日07:00
     */
    public boolean shouldShowFullDaySummary() {
        return getReferenceTimeMs() >=
            getNursingDayEndMs();
    }

    /**
     * 计算总结标题（如"11小时总结"）。
     * 从入科时间到次日07:00的小时数，分钟>=30则+1小时。
     */
    public String getFullDaySummaryTitle() {
        if (admissionTime == null) {
            return "24小时总结";
        }

        long admissionMs = admissionTime.toEpochMilli();
        long nursingDayEndMs = getNursingDayEndMs();

        // 如果入科时间在本护理日之前，显示24小时总结
        if (admissionMs < getNursingDayStartMs()) {
            return "24小时总结";
        }

        // 计算从入科时间到次日07:00的毫秒数
        long durationMs = nursingDayEndMs - admissionMs;
        long durationHours = durationMs / (1000 * 60 * 60);
        long durationMinutes = (durationMs % (1000 * 60 * 60)) / (1000 * 60);

        // 分钟>=30则+1小时
        if (durationMinutes >= 30) {
            durationHours++;
        }

        if (durationHours <= 0) {
            return "24小时总结";
        }

        return durationHours + "小时总结";
    }
}
