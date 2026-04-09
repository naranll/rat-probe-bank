package com.rat_probe.server.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

import java.time.LocalDateTime;

@Entity
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String fromUser;
    private String toUser;
    private double amount;
    private LocalDateTime time;

    public Transaction() {
        time = LocalDateTime.now();
    }
    
    public String getId() {
        return id;
    }

    public String getFromUser() {
        return fromUser;
    }

    public String getToUser() {
        return toUser;
    }

    public double getAmount() {
        return amount;
    }

    public LocalDateTime getTime() {
        return time;
    }

    public void setFromUser(String fromUser) {
        this.fromUser = fromUser;
    }

    public void setToUser(String toUser) {
        this.toUser = toUser;
    }

    public void setAmount(double amount) {
        this.amount = amount;
    }

    public void setTime(LocalDateTime time) {
        this.time = time;
    }
}