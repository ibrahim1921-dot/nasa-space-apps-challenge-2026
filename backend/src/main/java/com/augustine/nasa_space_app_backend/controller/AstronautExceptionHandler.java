package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.ApiError;
import com.augustine.nasa_space_app_backend.service.AstronautNotFoundException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = AstronautController.class)
public class AstronautExceptionHandler {
    @ExceptionHandler(AstronautNotFoundException.class)
    ResponseEntity<ApiError> missingProfile() {
        return ResponseEntity.status(404).body(new ApiError("Astronaut profile not found."));
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
    ResponseEntity<ApiError> invalidIdentifier() {
        return ResponseEntity.badRequest().body(new ApiError("Invalid astronaut identifier."));
    }
}
