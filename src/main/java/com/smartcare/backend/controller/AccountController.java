package com.smartcare.backend.controller;

import com.smartcare.backend.entity.account.Account;
import com.smartcare.backend.service.AccountService;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/accounts"})
@CrossOrigin(origins = {"*"})
public class AccountController {
    private final AccountService service;

    public AccountController(AccountService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<AccountDto>> listAll(@RequestParam(required = false) String profession) {
        List<Account> accounts;
        if (profession != null && !profession.trim().isEmpty()) {
            accounts = this.service.findByProfession(profession.trim());
        } else {
            accounts = this.service.findAll();
        }
        List<AccountDto> list = accounts.stream()
                .filter(a -> a.getValid() == null || !"invalid".equalsIgnoreCase(a.getValid().trim()))
                .map(a -> new AccountDto(a.getUsername(), a.getTrueName()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(list);
    }

    @GetMapping("/listByIds")
    public ResponseEntity<List<Account>> listByIds(@RequestParam String ids) {
        List<String> idList = (ids == null || ids.isEmpty())
                ? List.of()
                : Arrays.asList(ids.split(","));
        return ResponseEntity.ok(this.service.findAllById(idList));
    }

    public static class AccountDto {
        private String accountId;
        private String accountName;

        public String getAccountId() { return this.accountId; }
        public void setAccountId(String accountId) { this.accountId = accountId; }
        public String getAccountName() { return this.accountName; }
        public void setAccountName(String accountName) { this.accountName = accountName; }
        public AccountDto(String accountId, String accountName) {
            this.accountId = accountId;
            this.accountName = accountName;
        }
    }
}
