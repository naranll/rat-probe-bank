package com.rat_probe.server.repository;

import com.rat_probe.server.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User,String> {

    Optional<User> findByUsername(String username);

}