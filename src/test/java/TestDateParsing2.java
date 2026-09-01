import java.text.SimpleDateFormat;
import java.util.*;
import java.util.regex.*;

public class TestDateParsing2 {
    public static void main(String[] args) throws Exception {
        // The exact string that str() produces for this Date
        String raw = "Sat Aug 29 09:00:00 CST 2026";
        System.out.println("=== Simulating databaseTimeValue parsing ===");
        System.out.println("raw: " + raw);

        // Pattern 1 from parseLegacyCstString
        Matcher m1 = Pattern.compile(
            "^[A-Za-z]{3}\\s+([A-Za-z]{3})\\s+(\\d{1,2})\\s+(\\d{2}):(\\d{2}):(\\d{2})\\s+[A-Za-z]{2,5}\\s+(\\d{4})$"
        ).matcher(raw);

        Map<String, Integer> months = new HashMap<>();
        months.put("Jan", 0); months.put("Feb", 1); months.put("Mar", 2);
        months.put("Apr", 3); months.put("May", 4); months.put("Jun", 5);
        months.put("Jul", 6); months.put("Aug", 7); months.put("Sep", 8);
        months.put("Oct", 9); months.put("Nov", 10); months.put("Dec", 11);

        long CST_OFFSET_MS = 8L * 3600 * 1000;

        if (m1.find()) {
            Integer mi = months.get(m1.group(1));
            System.out.println("Pattern1 matched!");
            System.out.println("  month=" + m1.group(1) + " -> " + mi);
            System.out.println("  day=" + m1.group(2));
            System.out.println("  hh=" + m1.group(3));
            System.out.println("  mm=" + m1.group(4));
            System.out.println("  ss=" + m1.group(5));
            System.out.println("  year=" + m1.group(6));

            int year = Integer.parseInt(m1.group(6));
            int day = Integer.parseInt(m1.group(2));
            int hh = Integer.parseInt(m1.group(3));
            int mm = Integer.parseInt(m1.group(4));
            int ss = Integer.parseInt(m1.group(5));

            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            cal.set(year, mi, day, hh, mm, ss);
            cal.set(Calendar.MILLISECOND, 0);
            long utcMs = cal.getTimeInMillis();
            long result = utcMs - CST_OFFSET_MS;

            System.out.println("  cal (UTC) getTimeInMillis: " + utcMs);
            System.out.println("  cal (UTC) date: " + new Date(utcMs));
            System.out.println("  result = utcMs - CST_OFFSET: " + result);
            System.out.println("  result date: " + new Date(result));
            System.out.println("  minuteKey: " + (result / 60000));
            System.out.println("  Expected: " + 29799420L);
        } else {
            System.out.println("Pattern1 did NOT match!");
        }

        // Now simulate the SIMPLEDateFormat fallback
        System.out.println("\n=== SimpleDateFormat fallback ===");
        SimpleDateFormat sdf = new SimpleDateFormat("EEE MMM dd HH:mm:ss zzz yyyy", Locale.US);
        try {
            Date d = sdf.parse(raw);
            System.out.println("SDF parsed: " + d);
            System.out.println("SDF getTime: " + d.getTime());
            System.out.println("SDF minuteKey: " + (d.getTime() / 60000));
        } catch (Exception e) {
            System.out.println("SDF FAILED: " + e.getMessage());
        }

        // Check: what does minuteKey(new Date(1787965200000)) return?
        System.out.println("\n=== minuteKey from Date object directly ===");
        Date directDate = new Date(1787965200000L);
        System.out.println("new Date(1787965200000): " + directDate);
        System.out.println("toString: " + directDate.toString());

        // Simulate minuteKey function
        String directStr = directDate.toString();
        Matcher m1b = Pattern.compile(
            "^[A-Za-z]{3}\\s+([A-Za-z]{3})\\s+(\\d{1,2})\\s+(\\d{2}):(\\d{2}):(\\d{2})\\s+[A-Za-z]{2,5}\\s+(\\d{4})$"
        ).matcher(directStr);
        if (m1b.find()) {
            Integer mi = months.get(m1b.group(1));
            int year = Integer.parseInt(m1b.group(6));
            int day = Integer.parseInt(m1b.group(2));
            int hh = Integer.parseInt(m1b.group(3));
            int mm = Integer.parseInt(m1b.group(4));
            int ss = Integer.parseInt(m1b.group(5));
            Calendar cal2 = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            cal2.set(year, mi, day, hh, mm, ss);
            cal2.set(Calendar.MILLISECOND, 0);
            long utcMs2 = cal2.getTimeInMillis() - CST_OFFSET_MS;
            System.out.println("minuteKey from re-parsing toString: " + (utcMs2 / 60000));
        }
    }
}
