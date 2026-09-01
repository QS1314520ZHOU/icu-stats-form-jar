import java.text.SimpleDateFormat;
import java.util.*;
import java.util.regex.*;

public class TestParsing {
    public static void main(String[] args) throws Exception {
        // Simulate what str(Date) produces on server
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        cal.set(2026, Calendar.AUGUST, 29, 9, 0, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date date = cal.getTime();
        String strValue = date.toString();
        System.out.println("Date.toString(): " + strValue);

        // Pattern 1: matches "Sat Aug 29 09:00:00 CST 2026"
        Matcher m1 = Pattern.compile(
            "^[A-Za-z]{3}\\s+([A-Za-z]{3})\\s+(\\d{1,2})\\s+(\\d{2}):(\\d{2}):(\\d{2})\\s+[A-Za-z]{2,5}\\s+(\\d{4})$"
        ).matcher(strValue);
        System.out.println("Pattern1 matches: " + m1.find());

        // Pattern 2: matches "Sat Aug 29 2026 09:00:00 GMT+0800"
        Matcher m2 = Pattern.compile(
            "^[A-Za-z]{3}\\s+([A-Za-z]{3})\\s+(\\d{1,2})\\s+(\\d{4})\\s+(\\d{2}):(\\d{2}):(\\d{2})\\s+GMT([+-]\\d{4})$"
        ).matcher(strValue);
        System.out.println("Pattern2 matches: " + m2.find());

        // SimpleDateFormat test
        SimpleDateFormat sdf = new SimpleDateFormat("EEE MMM dd HH:mm:ss zzz yyyy", Locale.US);
        System.out.println("\nSimpleDateFormat with Locale.US:");
        try {
            Date d = sdf.parse(strValue);
            System.out.println("  Parsed: " + d);
            System.out.println("  getTime: " + d.getTime());
            System.out.println("  minuteKey: " + (d.getTime() / 60000));
        } catch (Exception e) {
            System.out.println("  PARSE FAILED: " + e.getMessage());
        }

        // Also test with Locale.CHINA
        SimpleDateFormat sdf2 = new SimpleDateFormat("EEE MMM dd HH:mm:ss zzz yyyy", Locale.CHINA);
        System.out.println("\nSimpleDateFormat with Locale.CHINA:");
        try {
            Date d = sdf2.parse(strValue);
            System.out.println("  Parsed: " + d);
            System.out.println("  getTime: " + d.getTime());
            System.out.println("  minuteKey: " + (d.getTime() / 60000));
        } catch (Exception e) {
            System.out.println("  PARSE FAILED: " + e.getMessage());
        }

        System.out.println("\nExpected minuteKey (09:00 CST): " + 29799420L);
    }
}
