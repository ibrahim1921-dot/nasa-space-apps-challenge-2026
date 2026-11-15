package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.SimulationIngestionResponse;
import com.augustine.nasa_space_app_backend.service.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/api/simulation/captures/{captureId}/observations")
public class SimulationIngestionController {
    private final SimulationIngestionService ingestion;
    public SimulationIngestionController(SimulationIngestionService ingestion) { this.ingestion = ingestion; }

    @PostMapping(consumes = "application/json")
    public SimulationIngestionResponse ingest(@PathVariable UUID captureId, HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > SimulationPayload.MAX_BYTES) throw new SimulationIngestionException(413, "payload_too_large");
        byte[] body = request.getInputStream().readNBytes(SimulationPayload.MAX_BYTES + 1);
        if (body.length > SimulationPayload.MAX_BYTES) throw new SimulationIngestionException(413, "payload_too_large");
        return ingestion.ingest(captureId, body);
    }
}
