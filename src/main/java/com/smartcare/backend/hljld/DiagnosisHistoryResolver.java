package com.smartcare.backend.hljld;

import org.bson.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;

/**
 * 诊断历史解析（与前端 diagnosis-history.util.ts 规则一致）。
 *
 * <p>规则（2026-09-24 改造）：</p>
 * <ol>
 *   <li>旧逻辑门槛：status == "discharged" 且出科时间 &lt; 2026-09-24 13:00+08:00 → 调用方保持原输出不动。</li>
 *   <li>新逻辑：按 diagnosisHistoryList[].time 时间区间取诊断，再取第一诊断。
 *       匹配：取 time ≤ queryTime 的最后一条；都晚于则取第一条；仅 1 条时不判时间。
 *       第一诊断：按 ; ； , ， | ｜ 拆分取第一段。</li>
 * </ol>
 */
public final class DiagnosisHistoryResolver {

    /** 旧/新逻辑分界点：2026-09-24 13:00 北京时间 = 2026-09-24T05:00:00Z */
    public static final Instant DIAGNOSIS_LOGIC_CUTOFF = Instant.parse("2026-09-24T05:00:00Z");

    private DiagnosisHistoryResolver() {}

    /**
     * 是否启用新诊断逻辑。
     * false → 旧逻辑（已出科且出科时间早于截止点）。
     */
    public static boolean useNewLogic(Document patient) {
        if (patient == null) return true;
        String status = stringValue(patient.get("status")).trim().toLowerCase();
        Instant discharge = HljldPatientTimeResolverNew.resolveDischargeTime(patient);
        boolean legacy = "discharged".equals(status)
            && discharge != null
            && discharge.isBefore(DIAGNOSIS_LOGIC_CUTOFF);
        return !legacy;
    }

    /**
     * 新逻辑解析诊断（调用方需先判断 useNewLogic）。
     * 历史为空时回退 diagnosis → clinicalDiagnosis → admissionDiagnosis，用新拆分。
     */
    public static String resolveDiagnosis(Document patient, Instant queryTime) {
        if (patient == null) return "";
        List<Document> history = normalizeHistory(patient.get("diagnosisHistoryList"));
        if (!history.isEmpty()) {
            Document entry = matchHistory(history, queryTime);
            return firstDiagnosisSegment(stringValue(entry.get("diagnosis")), true);
        }
        String fallback = firstNonEmpty(patient, "clinicalDiagnosis", "diagnosis", "admissionDiagnosis");
        return firstDiagnosisSegment(fallback, true);
    }

    /**
     * 历史匹配：升序；仅 1 条直通；最后一条 time ≤ queryTime；都晚于则第一条。
     */
    public static Document matchHistory(List<Document> history, Instant queryTime) {
        if (history == null || history.isEmpty()) return null;
        if (history.size() == 1) return history.get(0);
        Instant q = queryTime != null ? queryTime : Instant.now();
        Document matched = null;
        for (Document entry : history) {
            Instant t = parseTime(entry.get("time"));
            if (t != null && !t.isAfter(q)) {
                matched = entry;
            }
        }
        return matched != null ? matched : history.get(0);
    }

    /**
     * 取第一诊断段。
     *
     * @param includePipe true → 分隔符 ; ； , ， | ｜；false → 仅 ; ； , ，（旧 truncateDiagnosis）
     */
    public static String firstDiagnosisSegment(String raw, boolean includePipe) {
        if (raw == null || raw.trim().isEmpty()) return "";
        String v = raw.trim();
        char[] seps = includePipe
            ? new char[]{';', '；', ',', '，', '|', '｜'}
            : new char[]{';', '；', ',', '，'};
        int idx = -1;
        for (char sep : seps) {
            int c = v.indexOf(sep);
            if (c >= 0 && (idx < 0 || c < idx)) {
                idx = c;
            }
        }
        return idx >= 0 ? v.substring(0, idx).trim() : v;
    }

    @SuppressWarnings("unchecked")
    private static List<Document> normalizeHistory(Object raw) {
        List<Document> result = new ArrayList<>();
        if (!(raw instanceof List)) return result;
        for (Object item : (List<Object>) raw) {
            if (!(item instanceof Document)) continue;
            Document doc = (Document) item;
            Instant t = parseTime(doc.get("time"));
            if (t == null) continue;
            Document copy = new Document(doc);
            copy.put("time", Date.from(t));
            result.add(copy);
        }
        result.sort(Comparator.comparing(d -> ((Date) d.get("time"))));
        return result;
    }

    private static Instant parseTime(Object value) {
        try {
            return HljldPatientTimeResolverNew.parseValue(value);
        } catch (Exception e) {
            return null;
        }
    }

    private static String firstNonEmpty(Document doc, String... keys) {
        for (String key : keys) {
            String val = stringValue(doc.get(key)).trim();
            if (!val.isEmpty() && !"null".equalsIgnoreCase(val) && !"undefined".equalsIgnoreCase(val)) {
                return val;
            }
        }
        return "";
    }

    private static String stringValue(Object v) {
        return v == null ? "" : v.toString();
    }
}
