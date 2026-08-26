package com.smartcare.backend.hljld;

/**
 * 时间轴项目，对应前端 HljldTimelineItem。
 * 可以是时间组数据行，也可以是小结/总结行。
 */
public class HljldTimelineItem {
    public enum Kind { TIME_GROUP, DAY_SUMMARY, SHIFT_SUMMARY, FULL_DAY_SUMMARY, DISCHARGE_SUMMARY }

    private Kind kind;
    private String key = "";
    private long timestamp;
    private HljldTimeGroup group;
    private HljldSummary summary;

    public HljldTimelineItem() {}

    public static HljldTimelineItem ofGroup(HljldTimeGroup group) {
        HljldTimelineItem item = new HljldTimelineItem();
        item.kind = Kind.TIME_GROUP;
        item.key = group.getKey();
        item.timestamp = group.getTimestamp();
        item.group = group;
        return item;
    }

    public static HljldTimelineItem ofSummary(Kind kind, String key, long timestamp, HljldSummary summary) {
        HljldTimelineItem item = new HljldTimelineItem();
        item.kind = kind;
        item.key = key;
        item.timestamp = timestamp;
        item.summary = summary;
        return item;
    }

    /**
     * 简化版：根据 Summary Kind 自动推断 TimelineItem Kind。
     */
    public static HljldTimelineItem ofSummary(HljldSummary summary) {
        Kind kind;
        String key;
        switch (summary.getKind()) {
            case DAY: kind = Kind.DAY_SUMMARY; key = "day-summary"; break;
            case SHIFT: kind = Kind.SHIFT_SUMMARY; key = "shift-summary"; break;
            case FULL_DAY: kind = Kind.FULL_DAY_SUMMARY; key = "full-day-summary"; break;
            case DISCHARGE: kind = Kind.DISCHARGE_SUMMARY; key = "discharge-summary"; break;
            default: kind = Kind.DAY_SUMMARY; key = "summary"; break;
        }
        long ts = summary.getTime() != null ? summary.getTime().getTime() : System.currentTimeMillis();
        return ofSummary(kind, key, ts, summary);
    }

    public Kind getKind() { return kind; }
    public void setKind(Kind kind) { this.kind = kind; }
    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    public HljldTimeGroup getGroup() { return group; }
    public void setGroup(HljldTimeGroup group) { this.group = group; }
    public HljldSummary getSummary() { return summary; }
    public void setSummary(HljldSummary summary) { this.summary = summary; }
}
