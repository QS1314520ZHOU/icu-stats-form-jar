package com.smartcare.backend.hljld;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Date;

/**
 * 患者时间字段解析工具（严格模式）。
 *
 * <p>MongoDB 中的时间字段可能以多种格式存储：
 * {@link Date}（BSON Date）、{@link Number}（epoch millis）、{@link String}
 * （ISO-8601 或 yyyy-MM-dd HH:mm:ss）。本工具统一解析为 {@link Instant}。</p>
 *
 * <p>使用严格 {@link DateTimeFormatter}，不允许日期自动滚动
 * （如 2026-02-30、25:70:00 等非法时间将解析失败）。</p>
 */
public final class HljldPatientTimeResolver {

    private static final Logger log = LoggerFactory.getLogger(HljldPatientTimeResolver.class);
    private static final ZoneId ZONE = HljldPdfRequestContext.ZONE;

    /** 严格 yyyy-MM-dd HH:mm:ss 格式化器（Asia/Shanghai） */
    private static final DateTimeFormatter STRICT_DATETIME_FMT =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private HljldPatientTimeResolver() {}

    /**
     * 从患者 Document 解析时间字段（按优先级尝试多个字段名）。
     * 高优先级字段非空但格式错误时，记录 warn 并继续尝试低优先级字段。
     *
     * @param patient    患者 Document
     * @param fieldNames 字段名列表（按优先级排列，依次尝试）
     * @return 解析后的时间，全部失败返回 null
     */
    public static Instant resolveTime(Document patient, String... fieldNames) {
        if (patient == null) return null;
        for (String field : fieldNames) {
            Object value = patient.get(field);
            if (value == null) continue;
            Instant result = parseValue(value);
            if (result != null) {
                log.debug("解析时间字段 {}: {} -> {}", field, value, result);
                return result;
            }
            log.warn("时间字段 {} 解析失败: type={}, value={}",
                field, value.getClass().getSimpleName(), truncate(value.toString()));
        }
        return null;
    }

    /**
     * 解析单个值为 Instant，支持以下类型：
     * <ul>
     *   <li>{@link Date}（BSON Date）</li>
     *   <li>{@link Instant}</li>
     *   <li>{@link Number}（epoch millis 或 epoch 秒）</li>
     *   <li>数字字符串（epoch millis）</li>
     *   <li>{@link String} ISO-8601 或 yyyy-MM-dd HH:mm:ss 或 yyyy-MM-dd</li>
     * </ul>
     *
     * @throws IllegalArgumentException 当非空字符串格式非法时
     */
    public static Instant parseValue(Object value) {
        if (value == null) return null;

        // Date（BSON Date）
        if (value instanceof Date) {
            return ((Date) value).toInstant();
        }

        // Instant
        if (value instanceof Instant) {
            return (Instant) value;
        }

        // Number（epoch millis 或 epoch 秒）
        if (value instanceof Number) {
            long num = ((Number) value).longValue();
            if (num <= 0) return null;
            // 区分毫秒和秒：> 1e12 视为毫秒，否则视为秒
            if (num > 1_000_000_000_000L) {
                return Instant.ofEpochMilli(num);
            } else {
                return Instant.ofEpochSecond(num);
            }
        }

        // String
        if (value instanceof String) {
            String trimmed = ((String) value).trim();
            if (trimmed.isEmpty()) return null;
            return parseTimeStringStrict(trimmed);
        }

        return null;
    }

    /**
     * 严格解析时间字符串为 Instant。
     *
     * <p>支持格式（按优先级）：</p>
     * <ol>
     *   <li>ISO-8601（含时区偏移）：2026-09-04T10:30:00+08:00</li>
     *   <li>yyyy-MM-dd HH:mm:ss（无时区，按 Asia/Shanghai 解析）</li>
     *   <li>yyyy-MM-dd（仅日期，按当天 07:00 解析）</li>
     * </ol>
     *
     * @param text 时间字符串
     * @return Instant，解析失败返回 null
     */
    public static Instant parseTimeStringStrict(String text) {
        if (text == null || text.trim().isEmpty()) return null;
        String trimmed = text.trim();

        // 1. 尝试 ISO-8601（OffsetDateTime）
        try {
            return OffsetDateTime.parse(trimmed).toInstant();
        } catch (DateTimeParseException ignored) {}

        // 2. 尝试 yyyy-MM-dd HH:mm:ss（严格，Asia/Shanghai）
        try {
            LocalDateTime ldt = LocalDateTime.parse(trimmed, STRICT_DATETIME_FMT);
            return ldt.atZone(ZONE).toInstant();
        } catch (DateTimeParseException ignored) {}

        // 3. 尝试 yyyy-MM-dd（仅日期，默认当天 07:00）
        try {
            LocalDate ld = LocalDate.parse(trimmed);
            return ld.atTime(7, 0).atZone(ZONE).toInstant();
        } catch (DateTimeParseException ignored) {}

        log.warn("无法解析时间字符串: {}", trimmed);
        return null;
    }

    /**
     * 从患者 Document 解析入科时间。
     */
    public static Instant resolveAdmissionTime(Document patient) {
        return resolveTime(patient, "icuAdmissionTime", "admissionTime");
    }

    /**
     * 从患者 Document 解析出科时间。
     */
    public static Instant resolveDischargeTime(Document patient) {
        return resolveTime(patient, "icuDischargeTime", "dischargeTime");
    }

    private static String truncate(String s) {
        return s.length() > 80 ? s.substring(0, 80) + "..." : s;
    }
}
