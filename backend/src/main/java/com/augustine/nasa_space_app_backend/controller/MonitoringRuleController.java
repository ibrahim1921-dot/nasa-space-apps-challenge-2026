package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.MonitoringRuleRequest;
import com.augustine.nasa_space_app_backend.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController
public class MonitoringRuleController {
 private final MonitoringRuleService service;
 public MonitoringRuleController(MonitoringRuleService service) { this.service=service; }
 @PostMapping("/api/monitoring-rules") @ResponseStatus(HttpStatus.CREATED)
 public Map<String,UUID> create(@Valid @RequestBody MonitoringRuleRequest request) { return Map.of("ruleId",service.create(request)); }
 public record Activation(@NotNull Boolean active,@NotNull Instant effectiveAt,@NotBlank @Size(max=2000) String note) { }
 @PostMapping("/api/monitoring-rules/{id}/activation") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void activation(@PathVariable UUID id,@Valid @RequestBody Activation request) { service.activation(id,request.active(),request.effectiveAt(),request.note()); }
 @GetMapping("/api/monitoring-rules")
 public List<Map<String,Object>> history() { return service.history(); }
 @GetMapping("/api/crew/{astronautId}/monitoring-rules/selection")
 public MonitoringRuleResolver.Resolution resolve(@PathVariable UUID astronautId,@RequestParam String indicator,
  @RequestParam String metric,@RequestParam String unit,@RequestParam String context,@RequestParam UUID scope,@RequestParam Instant at) {
  return service.resolve(astronautId,indicator,metric,unit,context,scope,at);
 }
}
