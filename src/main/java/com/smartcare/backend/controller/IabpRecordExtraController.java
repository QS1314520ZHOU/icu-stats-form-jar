package com.smartcare.backend.controller;
import com.smartcare.backend.entity.IabpRecordExtra;
import com.smartcare.backend.repository.IabpRecordExtraRepository;
import java.time.LocalDateTime;import java.util.List;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/icu/iabp-extra") @CrossOrigin(origins="*")
public class IabpRecordExtraController{
 private final IabpRecordExtraRepository repo;public IabpRecordExtraController(IabpRecordExtraRepository repo){this.repo=repo;}
 @GetMapping("/latest") public IabpRecordExtra latest(@RequestParam String pid){List<IabpRecordExtra> list=repo.findByPidOrderByUpdatedAtDesc(pid);return list.isEmpty()?null:list.get(0);}
 @PostMapping("/save") public IabpRecordExtra save(@RequestBody IabpRecordExtra body){if(body.getPid()==null||body.getPid().isBlank())throw new IllegalArgumentException("pid不能为空");List<IabpRecordExtra> old=repo.findByPidOrderByUpdatedAtDesc(body.getPid());if(!old.isEmpty())body.setId(old.get(0).getId());body.setUpdatedAt(LocalDateTime.now().toString());body.setValid(true);return repo.save(body);}
}
