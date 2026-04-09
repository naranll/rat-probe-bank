package com.rat_probe.server.dto;

import java.time.LocalDateTime;

public class TransactionHistoryResponse {
    
    private String id;
    private String fromUser;
    private String toUser;
    private double amount;
    private LocalDateTime time;
    private String type; // "SENT" or "RECEIVED"

    // Default constructor
    public TransactionHistoryResponse() {}

    // Constructor with all parameters
    public TransactionHistoryResponse(String id, String fromUser, String toUser, 
                                     double amount, LocalDateTime time, String type) {
        this.id = id;
        this.fromUser = fromUser;
        this.toUser = toUser;
        this.amount = amount;
        this.time = time;
        this.type = type;
    }

    // Getters
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

    public String getType() {
        return type;
    }

    // Setters
    public void setId(String id) {
        this.id = id;
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

    public void setType(String type) {
        this.type = type;
    }
}