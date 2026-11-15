package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.BaselineRequest;
import com.augustine.nasa_space_app_backend.service.PersonalBaselineService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/crew/{astronautId}/baselines")
public class PersonalBaselineController {
    private final PersonalBaselineService service;
    public PersonalBaselineController(PersonalBaselineService service) { this.service = service; }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String,UUID> propose(@PathVariable UUID astronautId, @Valid @RequestBody BaselineRequest request) {
        return Map.of("proposalId",service.propose(astronautId,request));
    }
    public record Approval(@NotBlank @Size(max=2000) String note) { }
    @PostMapping("/{proposalId}/approve")
    public Map<String,UUID> approve(@PathVariable UUID astronautId, @PathVariable UUID proposalId,
                                    @Valid @RequestBody Approval approval) {
        return Map.of("baselineId",service.approve(astronautId,proposalId,approval.note()));
    }
    @GetMapping
    public List<Map<String,Object>> history(@PathVariable UUID astronautId) { return service.history(astronautId); }
    @GetMapping("/versions")
    public List<Map<String,Object>> versions(@PathVariable UUID astronautId) { return service.versions(astronautId); }
    @GetMapping("/selection")
    public PersonalBaselineService.Selection selection(@PathVariable UUID astronautId,
            @RequestParam String indicator, @RequestParam String metric, @RequestParam String unit,
            @RequestParam String context, @RequestParam UUID scope, @RequestParam Instant at) {
        return service.select(astronautId,indicator,metric,unit,context,scope,at);
    }
}
