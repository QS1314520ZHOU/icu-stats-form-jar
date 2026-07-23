package com.smartcare.backend.service;

import com.smartcare.backend.entity.TransfusionPage;
import com.smartcare.backend.entity.TransfusionRecord;
import com.smartcare.backend.repository.TransfusionRecordRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class TransfusionRecordService {
    private final TransfusionRecordRepository repo;

    public TransfusionRecordService(TransfusionRecordRepository repo) { this.repo = repo; }

    public Optional<TransfusionRecord> findByPid(String pid) { return repo.findByPid(pid); }

    public TransfusionRecord savePage(String pid, TransfusionPage page, String operatorId) {
        TransfusionRecord record = repo.findByPid(pid).orElseGet(() -> {
            TransfusionRecord r = new TransfusionRecord();
            r.setPid(pid);
            r.setCreatedBy(operatorId);
            r.setCreatedAt(Instant.now());
            return r;
        });
        if (page.getPageId() == null || page.getPageId().isEmpty()) page.setPageId(UUID.randomUUID().toString());

        List<TransfusionPage> pages = record.getPages() != null ? record.getPages() : new ArrayList<>();
        boolean found = false;
        for (int i = 0; i < pages.size(); i++) {
            if (pages.get(i).getPageId().equals(page.getPageId())) { pages.set(i, page); found = true; break; }
        }
        if (!found) pages.add(page);

        for (int i = 0; i < pages.size(); i++) pages.get(i).setPageNo(i + 1);
        record.setPages(pages);
        record.setUpdatedBy(operatorId);
        record.setUpdatedAt(Instant.now());
        return repo.save(record);
    }

    public TransfusionRecord deletePage(String pid, String pageId, String operatorId) {
        TransfusionRecord record = repo.findByPid(pid).orElseThrow(() -> new RuntimeException("记录不存在"));
        List<TransfusionPage> pages = record.getPages() != null ? record.getPages() : new ArrayList<>();
        pages.removeIf(p -> p.getPageId().equals(pageId));
        for (int i = 0; i < pages.size(); i++) pages.get(i).setPageNo(i + 1);
        record.setPages(pages);
        record.setUpdatedBy(operatorId);
        record.setUpdatedAt(Instant.now());
        return repo.save(record);
    }
}
