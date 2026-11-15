package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.HealthAlertResponses.*;
import com.augustine.nasa_space_app_backend.service.HealthAlertService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/alerts")
public class HealthAlertController {
 private final HealthAlertService service;
 public HealthAlertController(HealthAlertService service) { this.service=service; }
 @GetMapping("/me") public Page mine(@ModelAttribute Filter filter) { return service.mine(filter); }
 @GetMapping public Page officerAlerts(@ModelAttribute Filter filter) { return service.officerAlerts(filter); }
 @GetMapping("/{id}") public Detail detail(@PathVariable UUID id) { return service.detail(id); }
 @PostMapping("/{id}/acknowledge") public Detail acknowledge(@PathVariable UUID id) { return service.acknowledge(id); }
 public record Resolution(@NotBlank @Size(max=2000) String note) { }
 @PostMapping("/{id}/resolve") public Detail resolve(@PathVariable UUID id,@Valid @RequestBody Resolution resolution) { return service.resolve(id,resolution.note()); }
}
