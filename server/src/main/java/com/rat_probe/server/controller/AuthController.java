package com.rat_probe.server.controller;

import com.rat_probe.server.model.Account;
import com.rat_probe.server.model.User;
import com.rat_probe.server.repository.AccountRepository;
import com.rat_probe.server.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
@CrossOrigin("http://localhost:5173")
public class AuthController {

    private final UserRepository userRepo;
    private final AccountRepository accountRepo;
    private final PasswordEncoder passwordEncoder; // NEW: for password encryption

    // UPDATED: Added passwordEncoder parameter
    public AuthController(UserRepository u, AccountRepository a, PasswordEncoder p) {
        userRepo = u;
        accountRepo = a;
        passwordEncoder = p; // Spring Boot will automatically provide this
    }

    @PostMapping("/signup")
    public String signup(@RequestBody User user) {
        
        if (userRepo.findByUsername(user.getUsername()).isPresent()) {
            return "Error: Username already exists";
        }
        
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        
        userRepo.save(user);

        Account acc = new Account();
        acc.setUser(user);
        acc.setBalance(1000); // starting balance

        accountRepo.save(acc);

        return "User created";
    }

    @PostMapping("/login")
    public User login(@RequestBody User request) {
        
        return userRepo.findByUsername(request.getUsername())
                .filter(u -> passwordEncoder.matches(request.getPassword(), u.getPassword()))
                .orElseThrow(() -> new RuntimeException("Invalid login"));
    }
}