package com.smartcare.backend.hljld;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

public final class HljldPdfRequestContext {

    public static final ZoneId ZONE =
        ZoneId.of("Asia/Shanghai");

    private final LocalDate nursingDate;
    private final Instant referenceTime;

    private HljldPdfRequestContext(
        LocalDate nursingDate,
        Instant referenceTime
    ) {
        this.nursingDate = nursingDate;
        this.referenceTime = referenceTime;
    }

    public static HljldPdfRequestContext of(
        String nursingDateText,
        String referenceTimeText
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

        return new HljldPdfRequestContext(
            nursingDate,
            referenceTime
        );
    }

    public LocalDate getNursingDate() {
        return nursingDate;
    }

    public long getReferenceTimeMs() {
        return referenceTime.toEpochMilli();
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

    public boolean shouldShowDaySummary() {
        return getReferenceTimeMs() >=
            getDaySummaryTimeMs();
    }

    public boolean shouldShowFullDaySummary() {
        return getReferenceTimeMs() >=
            getNursingDayEndMs();
    }
}
