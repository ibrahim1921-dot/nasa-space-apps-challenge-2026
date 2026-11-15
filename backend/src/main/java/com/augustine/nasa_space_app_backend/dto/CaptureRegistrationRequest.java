package com.augustine.nasa_space_app_backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Server destinations are crew codes, never caller-selected database UUIDs or roles. */
public record CaptureRegistrationRequest(
        @NotNull UUID registrationKey,
        @NotNull UUID workspaceId,
        @NotNull UUID runId,
        @NotNull @Valid RunManifest manifest,
        @NotEmpty @Size(max = 4) List<@NotNull @Valid ProfileMapping> mappings) {

    public record RunManifest(
            @JsonProperty("schema_version") @NotBlank String schemaVersion,
            @JsonProperty("engine_version") @NotBlank @Size(max = 64) String engineVersion,
            @NotNull Boolean synthetic,
            @JsonProperty("run_id") @NotNull UUID runId,
            @NotEmpty Map<String, Object> configuration,
            @Size(max = 1024) String warning) { }

    public record ProfileMapping(
            @NotNull UUID simulationAstronautId,
            @NotBlank @Size(max = 64) String simulationCrewCode,
            @NotBlank @Size(max = 64) String targetCrewCode) { }
}
