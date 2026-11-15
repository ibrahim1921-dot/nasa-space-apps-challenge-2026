package com.augustine.nasa_space_app_backend.dto;

import java.time.Instant;
import java.util.UUID;

public record AstronautProfileResponse(UUID astronautId, String crewCode, String displayName,
                                       Instant createdAt, Instant archivedAt) { }
