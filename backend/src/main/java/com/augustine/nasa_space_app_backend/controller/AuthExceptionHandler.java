package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.ApiError;
import com.augustine.nasa_space_app_backend.security.AttemptLimiter;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class AuthExceptionHandler {
    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ApiError> invalidLogin() {
        return ResponseEntity.status(401).body(new ApiError("Invalid login credentials."));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, ConstraintViolationException.class,
            HttpMessageNotReadableException.class})
    ResponseEntity<ApiError> invalidInput() {
        return ResponseEntity.badRequest().body(new ApiError("Invalid request fields."));
    }

    @ExceptionHandler(AttemptLimiter.TooManyAttemptsException.class)
    ResponseEntity<ApiError> tooManyAttempts() {
        return ResponseEntity.status(429).header("Retry-After", "900")
                .body(new ApiError("Too many attempts. Try again later."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> accessDenied() {
        return ResponseEntity.status(403).body(new ApiError("Access denied."));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<ApiError> persistenceUnavailable() {
        // Do not log raw SQL exceptions: PostgreSQL may include complete credential rows.
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ApiError("Authentication temporarily unavailable."));
    }
}
