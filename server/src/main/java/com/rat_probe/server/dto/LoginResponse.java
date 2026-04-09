package com.rat_probe.server.dto;

public class LoginResponse {
    
    private String userId;
    private String username;
    private String message;

    // Default constructor required by Spring
    public LoginResponse() {}

    // Constructor with all fields
    public LoginResponse(String userId, String username, String message) {
        this.userId = userId;
        this.username = username;
        this.message = message;
    }

    // Getters and Setters
    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}