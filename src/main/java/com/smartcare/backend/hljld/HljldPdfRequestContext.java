package com.smartcare.backend.hljld;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * PDF生成请求上下文，封装业务时间参数。
 * 所有时间判断必须基于此上下文中的referenceTime，不能使用系统当前时间。
 */
public final class HljldPdfRequestContext {

    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");

    /** 护理日日期 */
    private final LocalDate nursingDate;

    /** 业务截止时间（所有时间判断的基准） */
    private final ZonedDateTime referenceTime;

    /**
     * @param nursingDate   护理日日期
     * @param referenceTime 业务截止时间
     */
    public HljldPdfRequestContext(LocalDate nursingDate, ZonedDateTime referenceTime) {
        this.nursingDate = nursingDate;
        this.referenceTime = referenceTime;
    }

    /**
     * 从字符串创建上下文。
     * 如果referenceTimeStr为空，则使用护理日17:00作为默认值。
     *
     * @param nursingDateStr    护理日日期字符串，格式 yyyy-MM-dd
     * @param referenceTimeStr  业务时间字符串，格式 yyyy-MM-ddTHH:mm:ss+HH:mm，可为空
     */
    public static HljldPdfRequestContext of(String nursingDateStr, String referenceTimeStr) {
        LocalDate nursingDate = LocalDate.parse(nursingDateStr);

        ZonedDateTime referenceTime;
        if (referenceTimeStr == null || referenceTimeStr.trim().isEmpty()) {
            // 默认使用护理日17:00
            referenceTime = nursingDate.atTime(17, 0).atZone(SHANGHAI_ZONE);
        } else {
            referenceTime = ZonedDateTime.parse(referenceTimeStr);
        }

        return new HljldPdfRequestContext(nursingDate, referenceTime);
    }

    /**
     * 使用当前系统时间创建上下文（仅用于兼容旧调用）。
     * 新代码应始终显式传入referenceTime。
     */
    public static HljldPdfRequestContext ofCurrentTime(String nursingDateStr) {
        LocalDate nursingDate = LocalDate.parse(nursingDateStr);
        ZonedDateTime now = ZonedDateTime.now(SHANGHAI_ZONE);
        return new HljldPdfRequestContext(nursingDate, now);
    }

    public LocalDate getNursingDate() {
        return nursingDate;
    }

    public ZonedDateTime getReferenceTime() {
        return referenceTime;
    }

    /** 获取referenceTime的毫秒时间戳 */
    public long getReferenceTimeMs() {
        return referenceTime.toInstant().toEpochMilli();
    }

    /** 护理日开始时间（当日07:00） */
    public ZonedDateTime getDayStart() {
        return nursingDate.atTime(7, 0).atZone(SHANGHAI_ZONE);
    }

    /** 日间小结时间点（当日17:00） */
    public ZonedDateTime getDaySummaryTime() {
        return nursingDate.atTime(17, 0).atZone(SHANGHAI_ZONE);
    }

    /** 次日07:00（24小时总结时间点） */
    public ZonedDateTime getNextDayStart() {
        return nursingDate.plusDays(1).atTime(7, 0).atZone(SHANGHAI_ZONE);
    }

    /** 护理日开始时间毫秒 */
    public long getDayStartMs() {
        return getDayStart().toInstant().toEpochMilli();
    }

    /** 日间小结时间点毫秒 */
    public long getDaySummaryTimeMs() {
        return getDaySummaryTime().toInstant().toEpochMilli();
    }

    /** 次日07:00毫秒 */
    public long getNextDayStartMs() {
        return getNextDayStart().toInstant().toEpochMilli();
    }

    /** 是否应显示日间小结（referenceTime >= 当日17:00） */
    public boolean shouldShowDaySummary() {
        return getReferenceTimeMs() >= getDaySummaryTimeMs();
    }

    /** 是否应显示24小时总结（referenceTime >= 次日07:00） */
    public boolean shouldShowFullDaySummary() {
        return getReferenceTimeMs() >= getNextDayStartMs();
    }
}
