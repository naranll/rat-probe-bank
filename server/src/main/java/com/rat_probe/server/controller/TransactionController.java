package com.rat_probe.server.controller;

import com.rat_probe.server.model.Account;
import com.rat_probe.server.model.Transaction;
import com.rat_probe.server.model.User;
import com.rat_probe.server.repository.AccountRepository;
import com.rat_probe.server.repository.TransactionRepository;
import com.rat_probe.server.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/transfer")
@CrossOrigin("http://localhost:5173")
public class TransactionController {

    private final UserRepository userRepo;
    private final AccountRepository accountRepo;
    private final TransactionRepository txRepo;

    public TransactionController(UserRepository u, AccountRepository a, TransactionRepository t){
        userRepo = u;
        accountRepo = a;
        txRepo = t;
    }

    @PostMapping
    @Transactional // Critical: Ensures atomicity - both accounts update or neither
    public String transfer(
            @RequestParam String from,
            @RequestParam String to,
            @RequestParam double amount
    ){

        User sender = userRepo.findByUsername(from).orElseThrow();
        User receiver = userRepo.findByUsername(to).orElseThrow();

        Account fromAcc = accountRepo.findByUser(sender).orElseThrow();
        Account toAcc = accountRepo.findByUser(receiver).orElseThrow();

        if(fromAcc.getBalance() < amount)
            throw new RuntimeException("Not enough money");

        fromAcc.setBalance(fromAcc.getBalance() - amount);
        toAcc.setBalance(toAcc.getBalance() + amount);

        accountRepo.save(fromAcc);
        accountRepo.save(toAcc);

        Transaction tx = new Transaction();
        tx.setFromUser(from);    // ← ADD THIS
        tx.setToUser(to);        // ← ADD THIS
        tx.setAmount(amount);    // ← ADD THIS
        txRepo.save(tx);

        return "Transfer complete";
    }

    @GetMapping("/history/{username}")
    public List<Transaction> getHistory(@PathVariable String username) {
        return txRepo.findByFromUserOrToUserOrderByTimeDesc(username, username);
    }

    @GetMapping("/all")
    public List<Transaction> getAllTransactions() {
        return txRepo.findAll();
    }
}
