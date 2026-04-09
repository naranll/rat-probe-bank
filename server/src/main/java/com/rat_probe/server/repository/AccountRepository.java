package com.rat_probe.server.repository;

import com.rat_probe.server.model.Account;
import com.rat_probe.server.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account,String> {

    Optional<Account> findByUser(User user);

}
