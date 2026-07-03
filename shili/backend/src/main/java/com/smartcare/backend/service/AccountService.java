package com.smartcare.backend.service;

import com.smartcare.backend.entity.account.Account;
import com.smartcare.backend.repository.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AccountService {
    private final AccountRepository repository;

    public List<Account> findAll() {
        return repository.findAll();
    }

    public List<Account> findByProfession(String profession) {
        return repository.findByProfession(profession);
    }
}
