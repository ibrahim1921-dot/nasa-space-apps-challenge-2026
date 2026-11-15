package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.ApiError;
import com.augustine.nasa_space_app_backend.service.CaptureRegistrationException;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(-1)
@RestControllerAdvice(assignableTypes = SimulationCaptureController.class)
public class SimulationCaptureExceptionHandler {
    @ExceptionHandler(CaptureRegistrationException.class)
    ResponseEntity<ApiError> registration(CaptureRegistrationException exception) {
        return ResponseEntity.status(exception.status()).body(new ApiError(exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiError> invalidId() {
        return ResponseEntity.badRequest().body(new ApiError("Invalid simulation capture identifier."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> conflict() {
        return ResponseEntity.status(409).body(new ApiError("Simulation capture state conflicts with registration."));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<ApiError> unavailable() {
        return ResponseEntity.status(503).body(new ApiError("Simulation capture storage temporarily unavailable."));
    }
}
