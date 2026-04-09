package com.rat_probe.server.dto;

public class TransferRequest {
    
    private String from;
    private String to;
    private double amount;

    // Default constructor
    public TransferRequest() {}

    // Constructor with parameters
    public TransferRequest(String from, String to, double amount) {
        this.from = from;
        this.to = to;
        this.amount = amount;
    }

    // Getters
    public String getFrom() {
        return from;
    }

    public String getTo() {
        return to;
    }

    public double getAmount() {
        return amount;
    }

    // Setters
    public void setFrom(String from) {
        this.from = from;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public void setAmount(double amount) {
        this.amount = amount;
    }

    // Manual validation method (call this in your controller)
    public String validate() {
        if (from == null || from.trim().isEmpty()) {
            return "Sender username is required";
        }
        if (to == null || to.trim().isEmpty()) {
            return "Receiver username is required";
        }
        if (amount <= 0) {
            return "Amount must be positive";
        }
        if (from.equals(to)) {
            return "Cannot transfer to yourself";
        }
        return null; // null means validation passed
    }
}