package com.smartcare.backend.hljld;

import org.bson.Document;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldPatientAgeResolver 单元测试。
 */
class HljldPatientAgeResolverTest {

    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");

    @Test
    void testResolveAgeFromDate() {
        // 测试java.util.Date类型生日
        Document patient = new Document();
        // 1950-08-03 00:00:00+08:00 (UTC: 1950-08-02T16:00:00Z)
        Date birthday = Date.from(LocalDate.of(1950, 8, 3)
            .atStartOfDay(SHANGHAI_ZONE)
            .toInstant());
        patient.put("birthday", birthday);

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("76", age, "Age should be 76");
    }

    @Test
    void testResolveAgeFromString() {
        // 测试字符串类型生日
        Document patient = new Document();
        patient.put("birthday", "1950-08-03");

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("76", age, "Age should be 76");
    }

    @Test
    void testResolveAgeFromISO() {
        // 测试ISO格式生日
        Document patient = new Document();
        patient.put("birthday", "1950-08-02T16:00:00.000Z");

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("76", age, "Age should be 76");
    }

    @Test
    void testResolveAgeFallbackToAgeField() {
        // 测试回退到age字段
        Document patient = new Document();
        patient.put("age", "65");

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("65", age, "Should fallback to age field");
    }

    @Test
    void testFutureBirthdayReturnsEmpty() {
        // 测试未来生日返回空
        Document patient = new Document();
        patient.put("birthday", "2030-01-01");

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("", age, "Future birthday should return empty");
    }

    @Test
    void testNullPatientReturnsEmpty() {
        // 测试null患者返回空
        String age = HljldPatientAgeResolver.resolveAge(null, LocalDate.now());
        assertEquals("", age, "Null patient should return empty");
    }

    @Test
    void testNullReferenceDateReturnsEmpty() {
        // 测试null参考日期返回空
        Document patient = new Document();
        patient.put("birthday", "1950-08-03");

        String age = HljldPatientAgeResolver.resolveAge(patient, null);
        assertEquals("", age, "Null reference date should return empty");
    }

    @Test
    void testMultipleBirthdayFields() {
        // 测试多个生日字段优先级
        Document patient = new Document();
        patient.put("birthDate", "1950-08-03");
        patient.put("birth", "1960-01-01");  // 应该被忽略，因为birthDate优先

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("76", age, "Should use first valid birthday field");
    }

    @Test
    void testSlashDateFormat() {
        // 测试yyyy/MM/dd格式
        Document patient = new Document();
        patient.put("birthday", "1950/08/03");

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("76", age, "Should parse yyyy/MM/dd format");
    }

    @Test
    void testTimestampMillis() {
        // 测试毫秒时间戳
        Document patient = new Document();
        long timestamp = LocalDate.of(1950, 8, 3)
            .atStartOfDay(SHANGHAI_ZONE)
            .toInstant()
            .toEpochMilli();
        patient.put("birthday", timestamp);

        LocalDate referenceDate = LocalDate.of(2026, 8, 26);
        String age = HljldPatientAgeResolver.resolveAge(patient, referenceDate);

        assertEquals("76", age, "Should parse millisecond timestamp");
    }
}
