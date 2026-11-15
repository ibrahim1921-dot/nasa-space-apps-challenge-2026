package com.augustine.nasa_space_app_backend.service;

/** Fixed public errors only; never expose SQL or manifest contents. */
public class CaptureRegistrationException extends RuntimeException {
    private final int status;
    public CaptureRegistrationException(int status, String message) {
        super(message);
        this.status = status;
    }
    public int status() { return status; }
}
