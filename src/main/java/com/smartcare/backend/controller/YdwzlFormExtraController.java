package com.smartcare.backend.controller;

import com.smartcare.backend.entity.YdwzlFormExtra;
import com.smartcare.backend.repository.YdwzlFormExtraRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/ydwzl-extra"})
@CrossOrigin(origins = {"*"})
public class YdwzlFormExtraController {
    private final YdwzlFormExtraRepository repo;

    public YdwzlFormExtraController(YdwzlFormExtraRepository repo) {
        this.repo = repo;
    }

    /** 获取患者最后一次保存的数据 */
    @GetMapping("/latest")
    public YdwzlFormExtra latest(@RequestParam String pid) {
        List<YdwzlFormExtra> list = this.repo.findByPidOrderByEditTimeDesc(pid);
        return list.isEmpty() ? null : list.get(0);
    }

    /** 按日期查询 */
    @GetMapping("/detail")
    public YdwzlFormExtra detail(@RequestParam String pid,
                                 @RequestParam String recordDate) {
        List<YdwzlFormExtra> list = this.repo.findByPidAndRecordDate(pid, recordDate);
        return list.isEmpty() ? null : list.get(0);
    }

    /** upsert 保存 */
    @PostMapping("/save")
    public YdwzlFormExtra save(@RequestBody YdwzlFormExtra body) {
        List<YdwzlFormExtra> existing = this.repo.findByPidAndRecordDate(
                body.getPid(), body.getRecordDate());
        if (!existing.isEmpty()) {
            YdwzlFormExtra e = existing.get(0);
            body.setId(e.getId());
            body.setCreateUser(e.getCreateUser());
            body.setCreateTime(e.getCreateTime());
        } else {
            body.setCreateTime(LocalDateTime.now().toString());
        }
        body.setEditTime(LocalDateTime.now().toString());
        body.setValid(true);
        if (body.getFormCode() == null || body.getFormCode().isEmpty()) {
            body.setFormCode("ydwzlForm");
        }
        return this.repo.save(body);
    }
}
