package com.augustine.nasa_space_app_backend.dto;

import java.util.List;
import java.util.UUID;

public record SimulationIngestionResponse(UUID captureId, int created, int duplicates, List<Result> results) {
    public record Result(long sequence, String sourceRecordId, UUID observationId, boolean duplicate) { }
}
