package com.augustine.nasa_space_app_backend.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataAccessException;
import java.util.Map;

@RestControllerAdvice(assignableTypes=KnowledgeController.class)
public class KnowledgeExceptionHandler {
 @ExceptionHandler(ResponseStatusException.class)
 ResponseEntity<Map<String,String>> invalid(ResponseStatusException e) {
  return ResponseEntity.status(e.getStatusCode()).body(Map.of("error",e.getStatusCode().value()==404?"Published educational content not found.":"Invalid knowledge catalog code."));
 }
 @ExceptionHandler(DataAccessException.class)
 ResponseEntity<Map<String,String>> unavailable() {
  return ResponseEntity.status(503).body(Map.of("error","Educational content is temporarily unavailable."));
 }
}
