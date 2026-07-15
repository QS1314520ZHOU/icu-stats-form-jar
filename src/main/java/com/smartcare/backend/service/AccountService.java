package com.smartcare.backend.service;

import com.smartcare.backend.entity.account.Account;
import com.smartcare.backend.repository.AccountRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class AccountService {
public AccountService(AccountRepository repository) {
this.repository = repository;
}

public List<Account> findAll() {
return this.repository.findAll();
}
private final AccountRepository repository;
public List<Account> findByProfession(String profession) {
return this.repository.findByProfession(profession);
}
public List<Account> findAllById(List<String> ids) {
return (List<Account>) this.repository.findAllById(ids);
}
}

