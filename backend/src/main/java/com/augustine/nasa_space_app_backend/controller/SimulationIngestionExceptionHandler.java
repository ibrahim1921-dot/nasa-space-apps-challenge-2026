package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.service.*;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.util.Map;

@Order(-2)
@RestControllerAdvice(assignableTypes = SimulationIngestionController.class)
public class SimulationIngestionExceptionHandler {
    @ExceptionHandler(SimulationIngestionException.class)
    ResponseEntity<?> ingestion(SimulationIngestionException exception) {
        if (!exception.requiredScope().isEmpty()) {
            return ResponseEntity.status(exception.status()).body(Map.of("error", exception.code(),
                    "message", "An approved comparison scope is required before ingestion.", "requiredScope", exception.requiredScope()));
        }
        return ResponseEntity.status(exception.status()).body(Map.of("error", exception.code()));
    }
    @ExceptionHandler(CaptureRegistrationException.class)
    ResponseEntity<?> capture(CaptureRegistrationException exception) {
        return ResponseEntity.status(exception.status()).body(Map.of("error", exception.getMessage()));
    }
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<?> identifier() { return ResponseEntity.badRequest().body(Map.of("error", "invalid_capture_identifier")); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict() { return ResponseEntity.status(409).body(Map.of("error", "observation_integrity_conflict")); }
    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<?> unavailable() { return ResponseEntity.status(503).body(Map.of("error", "ingestion_temporarily_unavailable")); }
}
