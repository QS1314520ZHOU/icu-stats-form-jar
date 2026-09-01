import com.smartcare.backend.hljld.HljldUtils;
import org.bson.Document;
import java.util.*;

public class TestRowBuild {
    public static void main(String[] args) {
        // Simulate the exact record from MongoDB
        Document drugExe = new Document();
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        cal.set(2026, Calendar.AUGUST, 29, 9, 0, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startTime = cal.getTime();
        drugExe.put("startTime", startTime);
        drugExe.put("methodCode", "69");
        drugExe.put("status", "finished");
        drugExe.put("_id", "6a922c04701a1916c948c305");

        System.out.println("=== Record ===");
        System.out.println("startTime (Date): " + startTime);
        System.out.println("startTime.getTime(): " + startTime.getTime());

        // Simulate str() - what the row builder does
        String strValue = startTime.toString();
        System.out.println("\nstr(startTime): " + strValue);

        // Step 1: minuteKey from raw string (row builder filtering)
        long minuteKeyFromStr = HljldUtils.minuteKey(strValue);
        System.out.println("\nminuteKey(str): " + minuteKeyFromStr);
        System.out.println("Expected (09:00): " + 29799420L);
        System.out.println("Match: " + (minuteKeyFromStr == 29799420L));

        // Step 2: databaseTimeValue (processDrugExecution)
        double dbTimeVal = HljldUtils.databaseTimeValue(strValue);
        System.out.println("\ndatabaseTimeValue(str): " + dbTimeVal);
        if (!Double.isNaN(dbTimeVal)) {
            long minuteKeyFromDb = (long) Math.floor(dbTimeVal / 60000);
            System.out.println("minuteKey from databaseTimeValue: " + minuteKeyFromDb);
            Date parsedDate = new Date((long) dbTimeVal);
            System.out.println("Parsed date: " + parsedDate);

            // Check if minuteKey(new Date(startMs)) matches
            long minuteKeyFromDate = HljldUtils.minuteKey(parsedDate);
            System.out.println("minuteKey(new Date(startMs)): " + minuteKeyFromDate);
        } else {
            System.out.println("databaseTimeValue returned NaN!");
        }

        // Step 3: Check what the row builder log would print
        System.out.println("\n=== Row Builder Log Would Show ===");
        System.out.println("drugName=吸入用盐酸氨溴索溶液...");
        System.out.println("startTime(str)=" + strValue);
        System.out.println("minuteKey=" + minuteKeyFromStr);
    }
}
