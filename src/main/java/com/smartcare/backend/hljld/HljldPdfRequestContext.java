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
    private final Instant dischargeTime;  // 出科时间
    private final String dischargedType;  // 出科类型（转出/转科/死亡/治愈/好转/自动出院等）

    private HljldPdfRequestContext(
        LocalDate nursingDate,
        Instant referenceTime,
        Instant admissionTime,
        Instant dischargeTime,
        String dischargedType
    ) {
        this.nursingDate = nursingDate;
        this.referenceTime = referenceTime;
        this.admissionTime = admissionTime;
        this.dischargeTime = dischargeTime;
        this.dischargedType = dischargedType;
    }

    /**
     * 统一护理日计算：根据时间戳计算所属护理日。
     * 护理日边界为 [D 07:00, D+1 07:00)，07:00 属于当天，06:59 属于前一天。
     *
     * @param instant 时间戳
     * @return 所属护理日日期（Asia/Shanghai 时区）
     */
    public static LocalDate nursingDateOf(Instant instant) {
        if (instant == null) {
            instant = Instant.now();
        }
        ZonedDateTime zdt = instant.atZone(ZONE);
        // 07:00 边界：小时 < 7 → 归前一天
        if (zdt.getHour() < 7) {
            return zdt.toLocalDate().minusDays(1);
        }
        return zdt.toLocalDate();
    }

    /**
     * 获取有效出科护理日。
     * <p>仅当出科时间存在且 referenceTime >= dischargeTime 时返回出科护理日，
     * 否则返回 null（表示患者尚未出科或时间未到）。</p>
     */
    public LocalDate getEffectiveDischargeNursingDate() {
        if (dischargeTime == null) {
            return null;
        }
        if (referenceTime.toEpochMilli() < dischargeTime.toEpochMilli()) {
            return null;
        }
        return nursingDateOf(dischargeTime);
    }

    public static HljldPdfRequestContext of(
        String nursingDateText,
        String referenceTimeText
    ) {
        return of(nursingDateText, referenceTimeText, null, null, null);
    }

    public static HljldPdfRequestContext of(
        String nursingDateText,
        String referenceTimeText,
        String admissionTimeText
    ) {
        return of(nursingDateText, referenceTimeText, admissionTimeText, null, null);
    }

    public static HljldPdfRequestContext of(
        String nursingDateText,
        String referenceTimeText,
        String admissionTimeText,
        String dischargeTimeText
    ) {
        return of(nursingDateText, referenceTimeText, admissionTimeText, dischargeTimeText, null);
    }

    public static HljldPdfRequestContext of(
        String nursingDateText,
        String referenceTimeText,
        String admissionTimeText,
        String dischargeTimeText,
        String dischargedType
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

        Instant dischargeTime = null;
        if (dischargeTimeText != null && !dischargeTimeText.trim().isEmpty()) {
            try {
                dischargeTime = OffsetDateTime.parse(dischargeTimeText.trim()).toInstant();
            } catch (Exception e) {
                // 尝试解析日期时间格式
                try {
                    java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
                    sdf.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
                    Date d = sdf.parse(dischargeTimeText.trim());
                    dischargeTime = d.toInstant();
                } catch (Exception ex) {
                    // 忽略解析错误
                }
            }
        }

        return new HljldPdfRequestContext(
            nursingDate,
            referenceTime,
            admissionTime,
            dischargeTime,
            dischargedType
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

    public Instant getDischargeTime() {
        return dischargeTime;
    }

    public long getDischargeTimeMs() {
        return dischargeTime != null ? dischargeTime.toEpochMilli() : 0;
    }

    public String getDischargedType() {
        return dischargedType;
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
     * 判断是否是入科第一天。
     * 规则：入科时间在本护理日范围内（07:00 - 次日07:00）
     */
    public boolean isFirstDayOfAdmission() {
        if (admissionTime == null) {
            return false;
        }
        long admissionMs = admissionTime.toEpochMilli();
        long nursingDayStartMs = getNursingDayStartMs();
        long nursingDayEndMs = getNursingDayEndMs();
        return admissionMs >= nursingDayStartMs && admissionMs < nursingDayEndMs;
    }

    /**
     * 判断是否是出科当天。
     * 规则：出科时间在本护理日范围内（07:00 - 次日07:00）
     */
    public boolean isDischargeDay() {
        if (dischargeTime == null) {
            return false;
        }
        long dischargeMs = dischargeTime.toEpochMilli();
        long nursingDayStartMs = getNursingDayStartMs();
        long nursingDayEndMs = getNursingDayEndMs();
        return dischargeMs >= nursingDayStartMs && dischargeMs < nursingDayEndMs;
    }

    /**
     * 计算入科第一天的小时数（用于xx小时小结标题）。
     * 从入科时间到当前参考时间的小时数，分钟>=30则+1小时。
     * 如果当前时间超过17:00，则计算到17:00的小时数。
     */
    public long getDaySummaryHours() {
        if (admissionTime == null) {
            return 0;
        }
        long admissionMs = admissionTime.toEpochMilli();
        long daySummaryTimeMs = getDaySummaryTimeMs();
        long referenceMs = getReferenceTimeMs();

        // 计算结束时间：取17:00和当前时间的较小值
        long endMs = Math.min(daySummaryTimeMs, referenceMs);

        // 如果入科时间在17:00之后，不生成小结
        if (admissionMs >= daySummaryTimeMs) {
            return 0;
        }

        // 计算时长
        long durationMs = endMs - admissionMs;
        long hours = durationMs / (1000 * 60 * 60);
        long minutes = (durationMs % (1000 * 60 * 60)) / (1000 * 60);

        // 分钟>=30则+1小时
        if (minutes >= 30) {
            hours++;
        }

        return hours;
    }

    /**
     * 计算出科总结的小时数。
     * - 如果是入科当天出科：从入科时间到出科时间
     * - 否则：从7:00到出科时间
     * 分钟>=30则+1小时。
     */
    public long getDischargeSummaryHours() {
        if (dischargeTime == null) {
            return 0;
        }
        long dischargeMs = dischargeTime.toEpochMilli();

        // 判断是否是入科当天出科
        if (isFirstDayOfAdmission() && isDischargeDay()) {
            // 入科当天出科：从入科时间开始计算
            long admissionMs = admissionTime.toEpochMilli();
            long durationMs = dischargeMs - admissionMs;
            long hours = durationMs / (1000 * 60 * 60);
            long minutes = (durationMs % (1000 * 60 * 60)) / (1000 * 60);
            if (minutes >= 30) {
                hours++;
            }
            return hours;
        } else {
            // 非入科当天出科：从7:00开始计算
            long nursingDayStartMs = getNursingDayStartMs();
            long durationMs = dischargeMs - nursingDayStartMs;
            long hours = durationMs / (1000 * 60 * 60);
            long minutes = (durationMs % (1000 * 60 * 60)) / (1000 * 60);
            if (minutes >= 30) {
                hours++;
            }
            return hours;
        }
    }

    /**
     * 判断是否应该显示日间小结。
     * 规则：
     * 1. 入科第一天：
     *    - 17:00之前：显示xx小时小结
     *    - 17:00之后：不显示小结
     * 2. 非入科第一天：
     *    - 当前时间必须 >= 17:00
     *    - 患者入科时间必须在当天 17:00 之前（如果入科时间在当天）
     * 3. 出科当天：
     *    - 如果出科时间 < 17:00，不显示日间小结（患者已离开）
     *    - 如果出科时间 >= 17:00，正常显示日间小结
     */
    public boolean shouldShowDaySummary() {
        // 出科当天的特殊逻辑：如果出科时间 < 17:00，不显示日间小结
        if (isDischargeDay() && dischargeTime != null) {
            long dischargeMs = dischargeTime.toEpochMilli();
            long daySummaryTimeMs = getDaySummaryTimeMs();
            if (dischargeMs < daySummaryTimeMs) {
                // 出科时间在17:00之前，患者已离开，不显示日间小结
                return false;
            }
        }

        // 入科第一天的特殊逻辑
        if (isFirstDayOfAdmission()) {
            long admissionMs = admissionTime.toEpochMilli();
            long daySummaryTimeMs = getDaySummaryTimeMs();
            long referenceMs = getReferenceTimeMs();

            // 入科时间在17:00之后，不显示小结
            if (admissionMs >= daySummaryTimeMs) {
                return false;
            }

            // 入科时间在17:00之前，且当前时间 >= 入科时间，显示xx小时小结
            return referenceMs >= admissionMs;
        }

        // 非入科第一天的正常逻辑（包括出科当天）
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
     * 规则：
     * 1. 当前时间必须 >= 次日07:00
     * 2. 如果是出科当天，且出科时间 < 次日07:00，不显示（出科时停止统计）
     */
    public boolean shouldShowFullDaySummary() {
        // 如果是出科当天，检查出科时间是否在次日07:00之前
        if (isDischargeDay() && dischargeTime != null) {
            long dischargeMs = dischargeTime.toEpochMilli();
            long nursingDayEndMs = getNursingDayEndMs();
            // 出科时间在次日07:00之前，停止显示24小时总结
            if (dischargeMs < nursingDayEndMs) {
                return false;
            }
        }

        return getReferenceTimeMs() >= getNursingDayEndMs();
    }

    /**
     * 判断是否应该显示出科总结。
     * 规则：
     * 1. 必须是出科当天
     * 2. 当前时间必须 >= 出科时间
     * 3. 必须是"转出"类型才显示（其他出科类型如死亡、治愈、好转等不显示）
     */
    public boolean shouldShowDischargeSummary() {
        // 只有"转出"类型才显示
        if (dischargedType == null || !"转出".equals(dischargedType.trim())) {
            return false;
        }

        if (!isDischargeDay()) {
            return false;
        }

        long dischargeMs = dischargeTime.toEpochMilli();
        long referenceMs = getReferenceTimeMs();

        // 当前时间必须 >= 出科时间
        return referenceMs >= dischargeMs;
    }

    /**
     * 获取出科总结标题（如"9小时出科总结"）。
     * 从7:00到出科时间的小时数，分钟>=30则+1小时。
     */
    public String getDischargeSummaryTitle() {
        long hours = getDischargeSummaryHours();
        if (hours <= 0) {
            return "出科总结";
        }
        return hours + "小时出科总结";
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

    /**
     * 获取日间小结标题（如"9小时小结"）。
     * 入科第一天时，从入科时间到17:00或当前时间的小时数。
     */
    public String getDaySummaryTitle() {
        if (!isFirstDayOfAdmission()) {
            return "日间小结";
        }

        long hours = getDaySummaryHours();
        if (hours <= 0) {
            return "日间小结";
        }
        return hours + "小时小结";
    }
}
