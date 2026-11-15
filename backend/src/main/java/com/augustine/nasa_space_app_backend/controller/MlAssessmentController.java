package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.MlAssessmentDtos.*;
import com.augustine.nasa_space_app_backend.service.MlAssessmentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
public class MlAssessmentController {
 private final MlAssessmentService service;
 public MlAssessmentController(MlAssessmentService service){this.service=service;}
 @PostMapping("/api/crew/{astronautId}/ml-assessments")
 public Detail request(@PathVariable UUID astronautId,@Valid @RequestBody Request request){return service.request(astronautId,request);}
 @GetMapping("/api/crew/{astronautId}/ml-assessments")
 public List<Summary> history(@PathVariable UUID astronautId,@RequestParam(defaultValue="20") int limit){return service.history(astronautId,limit);}
 @GetMapping("/api/ml-assessments/{id}")
 public Detail detail(@PathVariable UUID id){return service.detail(id);}
}
