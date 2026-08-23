package com.smartcare.backend.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 通用页码索引
 * 一个表服务所有表单，通过 pid + formType 唯一标识
 */
@Data
@Document(collection = "form_page_index")
public class FormPageIndex {

    @Id
    private String id;

    /**
     * 患者ID
     */
    private String pid;

    /**
     * 表单类型标识（如 hljld、hljld2、braden、ecmo 等）
     */
    private String formType;

    /**
     * 入科时间
     */
    private Date admissionTime;

    /**
     * 出院时间（可能为 null，表示患者仍在科）
     */
    private Date dischargeTime;

    /**
     * 每天的页码信息
     */
    private List<DailyPageInfo> dailyPages = new ArrayList<>();

    /**
     * 总页数
     */
    private int totalPages;

    /**
     * 最后更新时间
     */
    private Date lastUpdated;

    /**
     * 版本号，用于乐观锁
     */
    private int version = 1;

    /**
     * 计算状态
     * - completed: 计算完成
     * - calculating: 计算中
     * - failed: 计算失败
     */
    private String status = "completed";

    /**
     * 计算进度（0-100）
     */
    private int progress;

    @Data
    public static class DailyPageInfo {
        /** 护理日日期（格式：yyyy-MM-dd） */
        private String date;
        /** 该天起始页码 */
        private int startPageNo;
        /** 该天总页数 */
        private int pageCount;
        /** 该天结束页码 = startPageNo + pageCount - 1 */
        private int endPageNo;
        /** 数据内容哈希，用于判断是否需要重新生成 */
        private String contentHash;
    }
}