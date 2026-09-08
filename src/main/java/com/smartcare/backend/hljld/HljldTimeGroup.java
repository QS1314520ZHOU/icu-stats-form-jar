package com.smartcare.backend.hljld;

import java.util.ArrayList;
import java.util.List;

/**
 * 时间组，对应前端 HljldTimeGroup。
 */
public class HljldTimeGroup {
    private String key = "";
    private long timestamp;
    private List<HljldDisplayRow> rows = new ArrayList<>();
    /** 是否经过时间调整（尿量等整点数据+1小时显示） */
    private boolean timeAdjusted = false;

    public HljldTimeGroup() {}

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    public List<HljldDisplayRow> getRows() { return rows; }
    public void setRows(List<HljldDisplayRow> rows) { this.rows = rows; }
    public boolean isTimeAdjusted() { return timeAdjusted; }
    public void setTimeAdjusted(boolean timeAdjusted) { this.timeAdjusted = timeAdjusted; }
}
