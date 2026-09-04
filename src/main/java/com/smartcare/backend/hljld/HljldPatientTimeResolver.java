package com.smartcare.backend.hljld;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.TimeZone;

/**
 * 患者时间字段解析工具。
 *
 * <p>MongoDB 中的时间字段可能以多种格式存储：
 * {@link Date}（BSON Date）、{@link Number}（epoch millis）、{@link String}
 * （ISO-8601 或 yyyy-MM-dd HH:mm:ss）。本工具统一解析为 {@link Instant}。</p>
 */
public final class HljldPatientTimeResolver {

    private static final Logger log = LoggerFactory.getLogger(HljldPatientTimeResolver.class);
    private static final ZoneId ZONE = HljldPdfRequestContext.ZONE;

    private HljldPatientTimeResolver() {}

    /**
     * 从患者 Document 解析时间字段（按优先级尝试多个字段名）。
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
            log.debug("时间字段 {} 解析失败: {} ({})", field, value, value.getClass().getSimpleName());
        }
        return null;
    }

    /**
     * 解析单个值为 Instant，支持以下类型：
     * <ul>
     *   <li>{@link Date}（BSON Date）</li>
     *   <li>{@link Instant}</li>
     *   <li>{@link Number}（epoch millis）</li>
     *   <li>{@link String}（ISO-8601 或 yyyy-MM-dd HH:mm:ss）</li>
     * </ul>
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

        // Number（epoch millis）
        if (value instanceof Number) {
            long millis = ((Number) value).longValue();
            if (millis > 0) {
                return Instant.ofEpochMilli(millis);
            }
            return null;
        }

        // String（ISO-8601 或 yyyy-MM-dd HH:mm:ss）
        if (value instanceof String) {
            return parseTimeString((String) value);
        }

        return null;
    }

    /**
     * 解析时间字符串为 Instant。
     *
     * @param text 时间字符串
     * @return Instant，解析失败返回 null
     */
    public static Instant parseTimeString(String text) {
        if (text == null || text.trim().isEmpty()) return null;
        String trimmed = text.trim();

        // 尝试 ISO-8601（OffsetDateTime）
        try {
            return OffsetDateTime.parse(trimmed).toInstant();
        } catch (Exception ignored) {}

        // 尝试 yyyy-MM-dd HH:mm:ss（无时区偏移，默认 Asia/Shanghai）
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            sdf.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
            Date d = sdf.parse(trimmed);
            return d.toInstant();
        } catch (Exception ignored) {}

        // 尝试 yyyy-MM-dd（仅日期，默认当天 07:00）
        try {
            java.time.LocalDate ld = java.time.LocalDate.parse(trimmed);
            return ld.atTime(7, 0).atZone(ZONE).toInstant();
        } catch (Exception ignored) {}

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
}
