package com.rat_probe.server.repository;

import com.rat_probe.server.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TransactionRepository extends JpaRepository<Transaction, String> {
    
    // NEW: This method finds all transactions for a user
    // Spring Boot automatically creates the SQL query from the method name!
    // "findBy" + "FromUser" + "Or" + "ToUser" + "OrderBy" + "Time" + "Desc"
    // Becomes: SELECT * FROM transaction WHERE from_user = ? OR to_user = ? ORDER BY time DESC
    List<Transaction> findByFromUserOrToUserOrderByTimeDesc(String fromUser, String toUser);
}