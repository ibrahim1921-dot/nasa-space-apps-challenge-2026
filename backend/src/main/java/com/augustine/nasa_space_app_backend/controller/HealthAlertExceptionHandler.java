package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.ApiError;
import com.augustine.nasa_space_app_backend.service.*;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(-1)
@RestControllerAdvice(assignableTypes=HealthAlertController.class)
public class HealthAlertExceptionHandler {
 @ExceptionHandler(HealthAlertException.class)
 ResponseEntity<ApiError> alert(HealthAlertException error) { return ResponseEntity.status(error.status()).body(new ApiError(error.getMessage())); }
 @ExceptionHandler(AstronautNotFoundException.class)
 ResponseEntity<ApiError> missing() { return ResponseEntity.status(404).body(new ApiError("Astronaut profile not found.")); }
 @ExceptionHandler({MethodArgumentTypeMismatchException.class,BindException.class,org.springframework.http.converter.HttpMessageNotReadableException.class})
 ResponseEntity<ApiError> invalid() { return ResponseEntity.badRequest().body(new ApiError("Invalid alert identifier or query parameters.")); }
 @ExceptionHandler(DataIntegrityViolationException.class)
 ResponseEntity<ApiError> conflict() { return ResponseEntity.status(409).body(new ApiError("Alert transition conflicts with retained history.")); }
}
