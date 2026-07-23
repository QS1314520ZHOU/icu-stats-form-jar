package com.smartcare.backend.controller;
import com.smartcare.backend.entity.PiccoRecordExtra;
import com.smartcare.backend.repository.PiccoRecordExtraRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/icu/picco-extra")
@CrossOrigin(origins="*")
public class PiccoRecordExtraController{
 private final PiccoRecordExtraRepository repo;
 public PiccoRecordExtraController(PiccoRecordExtraRepository repo){this.repo=repo;}
 @GetMapping("/latest") public PiccoRecordExtra latest(@RequestParam String pid){List<PiccoRecordExtra> list=repo.findByPidOrderByUpdatedAtDesc(pid);return list.isEmpty()?null:list.get(0);}
 @PostMapping("/save") public PiccoRecordExtra save(@RequestBody PiccoRecordExtra body){
  if(body.getPid()==null||body.getPid().isBlank())throw new IllegalArgumentException("pid不能为空");
  List<PiccoRecordExtra> old=repo.findByPidOrderByUpdatedAtDesc(body.getPid());if(!old.isEmpty())body.setId(old.get(0).getId());
  body.setUpdatedAt(LocalDateTime.now().toString());body.setValid(true);return repo.save(body);
 }
}
