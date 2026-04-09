package com.rat_probe.server.dto;

public class SignupRequest {
    
    private String username;
    private String password;

    // Default constructor
    public SignupRequest() {}

    // Constructor with parameters
    public SignupRequest(String username, String password) {
        this.username = username;
        this.password = password;
    }

    // Getters
    public String getUsername() {
        return username;
    }

    public String getPassword() {
        return password;
    }

    // Setters
    public void setUsername(String username) {
        this.username = username;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    // Manual validation method (call this in your controller)
    public String validate() {
        if (username == null || username.trim().isEmpty()) {
            return "Username is required";
        }
        if (username.length() < 3 || username.length() > 50) {
            return "Username must be between 3 and 50 characters";
        }
        if (password == null || password.isEmpty()) {
            return "Password is required";
        }
        if (password.length() < 6) {
            return "Password must be at least 6 characters";
        }
        return null; // null means validation passed
    }
}