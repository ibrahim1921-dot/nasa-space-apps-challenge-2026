package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.ApiError;
import com.augustine.nasa_space_app_backend.service.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(-2)
@RestControllerAdvice(assignableTypes=AstronautAssessmentController.class)
public class AstronautAssessmentExceptionHandler {
    @ExceptionHandler(AssessmentProblem.class)
    ResponseEntity<ApiError> problem(AssessmentProblem e) { return ResponseEntity.status(e.status()).body(new ApiError(e.getMessage())); }
    @ExceptionHandler({MethodArgumentTypeMismatchException.class,MissingRequestHeaderException.class})
    ResponseEntity<ApiError> invalid() { return ResponseEntity.badRequest().body(new ApiError("Invalid assessment identifier, pagination or idempotency key.")); }
    @ExceptionHandler(AstronautNotFoundException.class)
    ResponseEntity<ApiError> missing() { return ResponseEntity.status(404).body(new ApiError("Astronaut profile not found.")); }
}
