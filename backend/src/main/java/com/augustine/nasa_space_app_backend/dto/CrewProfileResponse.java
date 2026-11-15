package com.augustine.nasa_space_app_backend.dto;

import java.util.UUID;

/** Public-within-the-crew identity only; no account, archive, mission, or medical data. */
public record CrewProfileResponse(UUID astronautId, String crewCode, String displayName) { }
