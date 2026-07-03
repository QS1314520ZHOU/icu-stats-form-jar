package com.smartcare.backend.controller;

import com.smartcare.backend.entity.account.Account;
import com.smartcare.backend.service.AccountService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/icu/accounts")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AccountController {
    private final AccountService service;

    @GetMapping
    public ResponseEntity<List<AccountDto>> listAll(@RequestParam(required = false) String profession) {
        List<Account> accounts;
        if (profession != null && !profession.trim().isEmpty()) {
            accounts = service.findByProfession(profession.trim());
        } else {
            accounts = service.findAll();
        }
        
        List<AccountDto> list = accounts.stream()
                .map(a -> new AccountDto(a.getUsername(), a.getTrueName()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(list);
    }

    @Data
    public static class AccountDto {
        private String accountId;
        private String accountName;

        public AccountDto(String accountId, String accountName) {
            this.accountId = accountId;
            this.accountName = accountName;
        }
    }
}
