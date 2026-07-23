package com.smartcare.backend.entity;

import java.util.ArrayList;
import java.util.List;

public class TransfusionPage {
    private String pageId;
    private Integer pageNo;
    private List<TransfusionItem> items = new ArrayList<>();

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public Integer getPageNo() { return pageNo; }
    public void setPageNo(Integer pageNo) { this.pageNo = pageNo; }
    public List<TransfusionItem> getItems() { return items; }
    public void setItems(List<TransfusionItem> items) { this.items = items; }
}
