package com.rat_probe.server.model;

import jakarta.persistence.*;

@Entity
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private double balance;

    @OneToOne
    private User user;

    public Account(){}

    // Added getId() - you might need this later
    public String getId() { 
        return id; 
    }

    public double getBalance() { 
        return balance; 
    }

    public void setBalance(double balance) { 
        this.balance = balance; 
    }

    public User getUser() { 
        return user; 
    }

    public void setUser(User user) { 
        this.user = user; 
    }
}