package com.smartcare.backend.hljld;

/**
 * 时间轴项目，对应前端 HljldTimelineItem。
 * 可以是时间组数据行，也可以是小结/总结行。
 */
public class HljldTimelineItem {
    public enum Kind {
        CONTINUATION,        // 护理日07:00续用行
        TIME_GROUP,          // 普通明细
        DAY_SUMMARY,         // 17:00日间小结
        DAY_SETTLEMENT,      // 17:00结算行，排在日间小结后
        SHIFT_SUMMARY,       // 班段小结
        FULL_DAY_SUMMARY,    // 次日07:00总结
        DISCHARGE_SUMMARY    // 出科总结
    }

    // ── 排序优先级常量 ──
    public static final int SORT_RANK_CONTINUATION   = 0;
    public static final int SORT_RANK_TIME_GROUP     = 10;
    public static final int SORT_RANK_DAY_SUMMARY    = 20;
    public static final int SORT_RANK_DAY_SETTLEMENT = 30;
    public static final int SORT_RANK_FULL_DAY       = 40;
    public static final int SORT_RANK_SHIFT          = 50;
    public static final int SORT_RANK_DISCHARGE      = 60;

    private Kind kind;
    private String key = "";
    private long timestamp;
    private int sortRank = 0; // 排序优先级，同一时间戳内按此排序
    private HljldTimeGroup group;
    private HljldSummary summary;

    public HljldTimelineItem() {}

    public static HljldTimelineItem ofGroup(HljldTimeGroup group) {
        HljldTimelineItem item = new HljldTimelineItem();
        item.kind = Kind.TIME_GROUP;
        item.key = group.getKey();
        item.timestamp = group.getTimestamp();
        item.sortRank = SORT_RANK_TIME_GROUP; // 普通明细
        item.group = group;
        return item;
    }

    public static HljldTimelineItem ofSummary(Kind kind, String key, long timestamp, HljldSummary summary) {
        HljldTimelineItem item = new HljldTimelineItem();
        item.kind = kind;
        item.key = key;
        item.timestamp = timestamp;
        item.summary = summary;
        // 根据类型设置排序优先级
        switch (kind) {
            case CONTINUATION: item.sortRank = SORT_RANK_CONTINUATION; break;
            case TIME_GROUP: item.sortRank = SORT_RANK_TIME_GROUP; break;
            case DAY_SUMMARY: item.sortRank = SORT_RANK_DAY_SUMMARY; break;
            case DAY_SETTLEMENT: item.sortRank = SORT_RANK_DAY_SETTLEMENT; break;
            case FULL_DAY_SUMMARY: item.sortRank = SORT_RANK_FULL_DAY; break;
            case SHIFT_SUMMARY: item.sortRank = SORT_RANK_SHIFT; break;
            case DISCHARGE_SUMMARY: item.sortRank = SORT_RANK_DISCHARGE; break;
            default: item.sortRank = SORT_RANK_TIME_GROUP; break;
        }
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
        long ts = summary.getTime() != null ? summary.getTime().getTime() : 0;
        return ofSummary(kind, key, ts, summary);
    }

    /**
     * 创建续用行。
     */
    public static HljldTimelineItem ofContinuation(String key, long timestamp, HljldTimeGroup group) {
        HljldTimelineItem item = new HljldTimelineItem();
        item.kind = Kind.CONTINUATION;
        item.key = key;
        item.timestamp = timestamp;
        item.sortRank = SORT_RANK_CONTINUATION; // 续用行最先
        item.group = group;
        return item;
    }

    /**
     * 创建结算行。
     */
    public static HljldTimelineItem ofSettlement(String key, long timestamp, HljldSummary summary) {
        HljldTimelineItem item = new HljldTimelineItem();
        item.kind = Kind.DAY_SETTLEMENT;
        item.key = key;
        item.timestamp = timestamp;
        item.sortRank = SORT_RANK_DAY_SETTLEMENT; // 结算行在日间小结后
        item.summary = summary;
        return item;
    }

    public Kind getKind() { return kind; }
    public void setKind(Kind kind) { this.kind = kind; }
    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    public int getSortRank() { return sortRank; }
    public void setSortRank(int sortRank) { this.sortRank = sortRank; }
    public HljldTimeGroup getGroup() { return group; }
    public void setGroup(HljldTimeGroup group) { this.group = group; }
    public HljldSummary getSummary() { return summary; }
    public void setSummary(HljldSummary summary) { this.summary = summary; }
}
