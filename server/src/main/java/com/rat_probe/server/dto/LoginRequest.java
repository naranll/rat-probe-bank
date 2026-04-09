package com.rat_probe.server.dto;

public class LoginRequest {
    
    private String username;
    private String password;

    public LoginRequest() {}

    public LoginRequest(String username, String password) {
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
        if (password == null || password.isEmpty()) {
            return "Password is required";
        }
        return null; // null means validation passed
    }
}