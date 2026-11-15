package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.CaptureRegistrationRequest;
import com.augustine.nasa_space_app_backend.dto.SimulationCaptureResponse;
import com.augustine.nasa_space_app_backend.service.SimulationCaptureService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/simulation/captures")
public class SimulationCaptureController {
    private final SimulationCaptureService captures;
    public SimulationCaptureController(SimulationCaptureService captures) { this.captures = captures; }

    @PostMapping
    public ResponseEntity<SimulationCaptureResponse> register(@Valid @RequestBody CaptureRegistrationRequest request) {
        var result = captures.register(request);
        return result.created()
                ? ResponseEntity.created(URI.create("/api/simulation/captures/" + result.capture().captureId())).body(result.capture())
                : ResponseEntity.ok(result.capture());
    }

    @GetMapping("/{id}")
    public SimulationCaptureResponse get(@PathVariable UUID id) { return captures.get(id); }

    @PostMapping("/{id}/close")
    public SimulationCaptureResponse close(@PathVariable UUID id, @Valid @RequestBody CaptureIdentity identity) {
        return captures.close(id, identity.workspaceId(), identity.runId());
    }

    public record CaptureIdentity(@NotNull UUID workspaceId, @NotNull UUID runId) { }
}
