package com.smartcare.backend.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;

/**
 * 护理记录单每日页数记录。
 * 用于计算跨日连续页码：从入科日累加到目标日前一天的页数总和即为起始页码。
 */
@Document(collection = "hljld_page_count")
public class HljldPageCount {

    @Id
    private String id;
    private String pid;
    private LocalDate nursingDate;
    private int pageCount;

    public HljldPageCount() {}

    public HljldPageCount(String pid, LocalDate nursingDate, int pageCount) {
        this.pid = pid;
        this.nursingDate = nursingDate;
        this.pageCount = pageCount;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public LocalDate getNursingDate() { return nursingDate; }
    public void setNursingDate(LocalDate nursingDate) { this.nursingDate = nursingDate; }
    public int getPageCount() { return pageCount; }
    public void setPageCount(int pageCount) { this.pageCount = pageCount; }
}
