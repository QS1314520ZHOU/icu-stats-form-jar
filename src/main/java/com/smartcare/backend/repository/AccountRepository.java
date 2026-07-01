package com.smartcare.backend.repository;

import com.smartcare.backend.entity.account.Account;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AccountRepository extends MongoRepository<Account, String> {
List<Account> findByProfession(String paramString);
}

