package com.augustine.nasa_space_app_backend.service;

public class AstronautNotFoundException extends RuntimeException {
    public AstronautNotFoundException() { super("Astronaut profile not found."); }
}
