package com.smartcare.backend.hljld;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Date;

/**
 * 患者年龄解析器。
 *
 * 支持多种生日格式：
 * - java.util.Date
 * - java.time.Instant
 * - BsonDateTime
 * - Number时间戳
 * - ISO字符串 (yyyy-MM-ddTHH:mm:ss.SSSZ)
 * - yyyy-MM-dd
 * - yyyy/MM/dd
 *
 * 生日字段优先级：
 * 1. birthday
 * 2. birthDate
 * 3. birth
 * 4. patientBirthday
 * 5. birthDay
 * 6. birthdayStr
 * 7. dateOfBirth
 * 8. dob
 *
 * 如果所有生日字段缺失或无效，回退到age/patientAge字段。
 */
public final class HljldPatientAgeResolver {

    private static final Logger log = LoggerFactory.getLogger(HljldPatientAgeResolver.class);

    /** 统一时区：Asia/Shanghai */
    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");

    /** 生日字段优先级列表 */
    private static final String[] BIRTHDAY_FIELDS = {
        "birthday", "birthDate", "birth", "patientBirthday",
        "birthDay", "birthdayStr", "dateOfBirth", "dob"
    };

    /** 年龄回退字段优先级列表 */
    private static final String[] AGE_FIELDS = {"age", "patientAge"};

    private HljldPatientAgeResolver() {}

    /**
     * 解析患者年龄。
     *
     * @param patient       患者文档
     * @param referenceDate 参考日期（护理日日期）
     * @return 年龄字符串，无法解析时返回空字符串
     */
    public static String resolveAge(Document patient, LocalDate referenceDate) {
        if (patient == null || referenceDate == null) {
            return "";
        }

        // 尝试从生日字段计算年龄
        LocalDate birthday = parseBirthday(patient);
        if (birthday != null) {
            // 禁止未来生日返回负数
            if (birthday.isAfter(referenceDate)) {
                log.warn("患者生日在未来: birthday={}, referenceDate={}", birthday, referenceDate);
                return "";
            }
            long years = ChronoUnit.YEARS.between(birthday, referenceDate);
            return String.valueOf(years);
        }

        // 回退到age字段
        for (String field : AGE_FIELDS) {
            String ageStr = getStringValue(patient, field);
            if (!ageStr.isEmpty()) {
                return ageStr;
            }
        }

        return "";
    }

    /**
     * 解析生日字段，返回LocalDate。
     */
    private static LocalDate parseBirthday(Document patient) {
        for (String field : BIRTHDAY_FIELDS) {
            Object value = patient.get(field);
            if (value == null) {
                continue;
            }

            LocalDate birthday = parseBirthdayValue(value);
            if (birthday != null) {
                return birthday;
            }
        }
        return null;
    }

    /**
     * 解析生日值，支持多种类型。
     */
    private static LocalDate parseBirthdayValue(Object value) {
        if (value == null) {
            return null;
        }

        // java.util.Date
        if (value instanceof Date) {
            return ((Date) value).toInstant()
                .atZone(SHANGHAI_ZONE)
                .toLocalDate();
        }

        // java.time.Instant
        if (value instanceof Instant) {
            return ((Instant) value)
                .atZone(SHANGHAI_ZONE)
                .toLocalDate();
        }

        // BsonDateTime (org.bson.types.BsonDateTime)
        if (value.getClass().getName().equals("org.bson.types.BsonDateTime")) {
            try {
                long millis = (long) value.getClass().getMethod("getValue").invoke(value);
                return Instant.ofEpochMilli(millis)
                    .atZone(SHANGHAI_ZONE)
                    .toLocalDate();
            } catch (Exception e) {
                log.debug("解析BsonDateTime失败: {}", e.getMessage());
                return null;
            }
        }

        // Number时间戳（毫秒）
        if (value instanceof Number) {
            long millis = ((Number) value).longValue();
            // 判断是秒级还是毫秒级时间戳
            if (millis > 1e12) {
                // 毫秒级
                return Instant.ofEpochMilli(millis)
                    .atZone(SHANGHAI_ZONE)
                    .toLocalDate();
            } else {
                // 秒级
                return Instant.ofEpochSecond(millis)
                    .atZone(SHANGHAI_ZONE)
                    .toLocalDate();
            }
        }

        // 字符串
        if (value instanceof String) {
            return parseDateString((String) value);
        }

        return null;
    }

    /**
     * 解析日期字符串，支持多种格式。
     */
    private static LocalDate parseDateString(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            return null;
        }

        String str = dateStr.trim();

        // ISO格式：yyyy-MM-ddTHH:mm:ss.SSSZ 或类似
        if (str.contains("T")) {
            try {
                return Instant.parse(str)
                    .atZone(SHANGHAI_ZONE)
                    .toLocalDate();
            } catch (DateTimeParseException e) {
                // 尝试其他ISO格式
                try {
                    // 移除时区信息，尝试解析
                    String cleaned = str.replaceAll("[Zz]$", "");
                    if (cleaned.endsWith("+00:00")) {
                        cleaned = cleaned.substring(0, cleaned.length() - 6);
                    }
                    Instant instant = Instant.parse(cleaned + "Z");
                    return instant.atZone(SHANGHAI_ZONE).toLocalDate();
                } catch (DateTimeParseException e2) {
                    log.debug("解析ISO日期字符串失败: {}", str);
                }
            }
        }

        // yyyy-MM-dd
        try {
            return LocalDate.parse(str, DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException e) {
            // 继续尝试其他格式
        }

        // yyyy/MM/dd
        try {
            return LocalDate.parse(str.replace("/", "-"), DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException e) {
            log.debug("解析日期字符串失败: {}", str);
        }

        return null;
    }

    /**
     * 安全获取字符串值。
     */
    private static String getStringValue(Document doc, String key) {
        Object v = doc.get(key);
        if (v == null) {
            return "";
        }
        String str = v.toString().trim();
        if ("null".equalsIgnoreCase(str) || "undefined".equalsIgnoreCase(str)) {
            return "";
        }
        return str;
    }
}
