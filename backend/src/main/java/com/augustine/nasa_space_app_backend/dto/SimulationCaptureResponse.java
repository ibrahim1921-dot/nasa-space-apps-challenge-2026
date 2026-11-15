package com.augustine.nasa_space_app_backend.dto;

import com.augustine.nasa_space_app_backend.entity.SimulationCaptureStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SimulationCaptureResponse(UUID captureId, UUID workspaceId, UUID runId,
        UUID createdByAccountId, SimulationCaptureStatus status, Instant createdAt,
        Instant activatedAt, Instant closedAt, List<Mapping> mappings) {
    public record Mapping(UUID mappingId, UUID simulationAstronautId, String simulationCrewCode,
                          UUID astronautId, String targetCrewCode, Instant createdAt) { }
}
