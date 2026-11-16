package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.service.MlProblem;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import java.util.Map;

@RestControllerAdvice(assignableTypes=MlAssessmentController.class)
public class MlAssessmentExceptionHandler {
 @ExceptionHandler(MlProblem.class) ResponseEntity<Map<String,String>> problem(MlProblem error){return ResponseEntity.status(error.status()).body(Map.of("error",error.getMessage()));}
 @ExceptionHandler({MethodArgumentTypeMismatchException.class,MethodArgumentNotValidException.class})
 ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("error","INVALID_ASSESSMENT_REQUEST"));}
}
