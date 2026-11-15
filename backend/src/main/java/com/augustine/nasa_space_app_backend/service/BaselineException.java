package com.augustine.nasa_space_app_backend.service;

public class BaselineException extends RuntimeException {
    private final int status;
    public BaselineException(int status, String message) { super(message); this.status = status; }
    public int status() { return status; }
}
