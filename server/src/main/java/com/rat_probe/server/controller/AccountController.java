package com.rat_probe.server.controller;

import com.rat_probe.server.model.User;
import com.rat_probe.server.repository.AccountRepository;
import com.rat_probe.server.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/account")
@CrossOrigin("http://localhost:5173")
public class AccountController {

    private final UserRepository userRepo;
    private final AccountRepository accountRepo;

    public AccountController(UserRepository u, AccountRepository a){
        userRepo = u;
        accountRepo = a;
    }

    @GetMapping("/balance/{username}")
    public double balance(@PathVariable String username){

        User user = userRepo.findByUsername(username).orElseThrow();

        return accountRepo.findByUser(user).orElseThrow().getBalance();
    }
}