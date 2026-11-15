package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.ApiError;
import com.augustine.nasa_space_app_backend.service.*;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(-1)
@RestControllerAdvice(assignableTypes=MonitoringRuleController.class)
public class MonitoringRuleExceptionHandler {
 @ExceptionHandler(BaselineException.class)
 ResponseEntity<ApiError> rule(BaselineException error) { return ResponseEntity.status(error.status()).body(new ApiError(error.getMessage())); }
 @ExceptionHandler(AstronautNotFoundException.class)
 ResponseEntity<ApiError> missing() { return ResponseEntity.status(404).body(new ApiError("Astronaut profile not found.")); }
 @ExceptionHandler(MethodArgumentTypeMismatchException.class)
 ResponseEntity<ApiError> invalid() { return ResponseEntity.badRequest().body(new ApiError("Invalid monitoring rule identifier or selection time.")); }
 @ExceptionHandler(DataIntegrityViolationException.class)
 ResponseEntity<ApiError> conflict() { return ResponseEntity.status(409).body(new ApiError("Monitoring rule conflicts with retained history.")); }
}
