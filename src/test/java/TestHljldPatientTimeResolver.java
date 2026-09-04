import com.smartcare.backend.hljld.HljldPatientTimeResolver;
import org.bson.Document;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldPatientTimeResolver 单元测试。
 *
 * <p>覆盖 MongoDB 患者时间字段的多格式解析：
 * Date、Instant、Number (epoch millis)、ISO-8601 String、yyyy-MM-dd HH:mm:ss。</p>
 */
public class TestHljldPatientTimeResolver {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    // ══════════════════════════════════════════════════════════
    //  Date (BSON Date) 解析
    // ══════════════════════════════════════════════════════════

    @Test
    public void testParseDateType() {
        Instant expected = ZonedDateTime.of(2026, 9, 4, 10, 30, 0, 0, ZONE).toInstant();
        Date dateValue = Date.from(expected);

        Document patient = new Document("icuAdmissionTime", dateValue);
        Instant result = HljldPatientTimeResolver.resolveAdmissionTime(patient);

        assertNotNull(result, "应解析 Date 类型");
        assertEquals(expected.toEpochMilli(), result.toEpochMilli(), "毫秒精度应一致");
        System.out.println("[PASS] testParseDateType");
    }

    // ══════════════════════════════════════════════════════════
    //  Number (epoch millis) 解析
    // ══════════════════════════════════════════════════════════

    @Test
    public void testParseNumberType() {
        Instant expected = ZonedDateTime.of(2026, 9, 4, 10, 30, 0, 0, ZONE).toInstant();
        long millis = expected.toEpochMilli();

        Document patient = new Document("icuDischargeTime", millis);
        Instant result = HljldPatientTimeResolver.resolveDischargeTime(patient);

        assertNotNull(result, "应解析 Number 类型");
        assertEquals(millis, result.toEpochMilli(), "毫秒精度应一致");
        System.out.println("[PASS] testParseNumberType");
    }

    // ══════════════════════════════════════════════════════════
    //  ISO-8601 String 解析
    // ══════════════════════════════════════════════════════════

    @Test
    public void testParseIso8601String() {
        String isoStr = "2026-09-04T10:30:00+08:00";
        Instant expected = ZonedDateTime.of(2026, 9, 4, 10, 30, 0, 0, ZONE).toInstant();

        Document patient = new Document("icuAdmissionTime", isoStr);
        Instant result = HljldPatientTimeResolver.resolveAdmissionTime(patient);

        assertNotNull(result, "应解析 ISO-8601 字符串");
        assertEquals(expected.toEpochMilli(), result.toEpochMilli(), "毫秒精度应一致");
        System.out.println("[PASS] testParseIso8601String");
    }

    // ══════════════════════════════════════════════════════════
    //  yyyy-MM-dd HH:mm:ss String 解析
    // ══════════════════════════════════════════════════════════

    @Test
    public void testParseDateTimeString() {
        String dateTimeStr = "2026-09-04 10:30:00";
        Instant expected = ZonedDateTime.of(2026, 9, 4, 10, 30, 0, 0, ZONE).toInstant();

        Document patient = new Document("icuAdmissionTime", dateTimeStr);
        Instant result = HljldPatientTimeResolver.resolveAdmissionTime(patient);

        assertNotNull(result, "应解析 yyyy-MM-dd HH:mm:ss 字符串");
        assertEquals(expected.toEpochMilli(), result.toEpochMilli(), "毫秒精度应一致");
        System.out.println("[PASS] testParseDateTimeString");
    }

    // ══════════════════════════════════════════════════════════
    //  yyyy-MM-dd String 解析（默认 07:00）
    // ══════════════════════════════════════════════════════════

    @Test
    public void testParseDateString() {
        String dateStr = "2026-09-04";
        Instant expected = ZonedDateTime.of(2026, 9, 4, 7, 0, 0, 0, ZONE).toInstant();

        Document patient = new Document("icuAdmissionTime", dateStr);
        Instant result = HljldPatientTimeResolver.resolveAdmissionTime(patient);

        assertNotNull(result, "应解析 yyyy-MM-dd 字符串");
        assertEquals(expected.toEpochMilli(), result.toEpochMilli(), "应默认 07:00");
        System.out.println("[PASS] testParseDateString");
    }

    // ══════════════════════════════════════════════════════════
    //  字段优先级
    // ══════════════════════════════════════════════════════════

    @Test
    public void testFieldPriority() {
        Instant icuTime = Instant.ofEpochMilli(1725420600000L);
        Instant generalTime = Instant.ofEpochMilli(1725420000000L);

        // icuAdmissionTime 优先于 admissionTime
        Document patient = new Document()
            .append("icuAdmissionTime", Date.from(icuTime))
            .append("admissionTime", Date.from(generalTime));

        Instant result = HljldPatientTimeResolver.resolveAdmissionTime(patient);
        assertNotNull(result);
        assertEquals(icuTime.toEpochMilli(), result.toEpochMilli(), "应优先使用 icuAdmissionTime");

        // 仅 admissionTime
        Document patient2 = new Document("admissionTime", Date.from(generalTime));
        Instant result2 = HljldPatientTimeResolver.resolveAdmissionTime(patient2);
        assertNotNull(result2);
        assertEquals(generalTime.toEpochMilli(), result2.toEpochMilli(), "回退到 admissionTime");

        System.out.println("[PASS] testFieldPriority");
    }

    // ══════════════════════════════════════════════════════════
    //  null 和空值处理
    // ══════════════════════════════════════════════════════════

    @Test
    public void testNullAndEmptyHandling() {
        // null patient
        assertNull(HljldPatientTimeResolver.resolveAdmissionTime(null), "null patient 应返回 null");

        // 空 document
        assertNull(HljldPatientTimeResolver.resolveAdmissionTime(new Document()), "空 document 应返回 null");

        // null 值
        Document patient = new Document("icuAdmissionTime", null);
        assertNull(HljldPatientTimeResolver.resolveAdmissionTime(patient), "null 值应返回 null");

        // 空字符串
        Document patient2 = new Document("icuAdmissionTime", "");
        assertNull(HljldPatientTimeResolver.resolveAdmissionTime(patient2), "空字符串应返回 null");

        System.out.println("[PASS] testNullAndEmptyHandling");
    }

    // ══════════════════════════════════════════════════════════
    //  Instant 类型直接传递
    // ══════════════════════════════════════════════════════════

    @Test
    public void testInstantType() {
        Instant expected = ZonedDateTime.of(2026, 9, 4, 14, 0, 0, 0, ZONE).toInstant();

        Document patient = new Document("icuAdmissionTime", expected);
        Instant result = HljldPatientTimeResolver.resolveAdmissionTime(patient);

        assertNotNull(result, "应解析 Instant 类型");
        assertEquals(expected.toEpochMilli(), result.toEpochMilli());
        System.out.println("[PASS] testInstantType");
    }
}
