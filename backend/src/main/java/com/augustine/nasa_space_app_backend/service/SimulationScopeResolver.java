package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.entity.SimulationCapture;
import com.augustine.nasa_space_app_backend.entity.SimulationProfileMapping;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import static com.augustine.nasa_space_app_backend.service.SimulationEnvelopeValidator.RADIATION;
import static com.augustine.nasa_space_app_backend.service.SimulationPayload.invalid;

/** Resolves previously approved immutable definitions. Deliberately contains no scope INSERT. */
@Component
public class SimulationScopeResolver {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public SimulationScopeResolver(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

    public UUID resolve(SimulationEnvelopeValidator.Validated item, SimulationCapture capture, SimulationProfileMapping mapping) {
        Map<String, Object> expected = new LinkedHashMap<>();
        expected.put("indicator_code", item.code()); expected.put("storage_kind", item.kind()); expected.put("scope_code", "default");
        var fixed = SimulationScopeDefinitions.forMetric(item.code(), item.metrics().get(0).code()).orElse(null);
        if (fixed != null) expected.putAll(fixed.scope());
        switch (item.code()) {
            case RADIATION -> {
                var manifest = (Map<?, ?>) capture.getManifest().get("run_manifest");
                var config = (Map<?, ?>) manifest.get("configuration");
                expected.putAll(Map.of("scope_code", "simulation-dose-" + capture.getEngineRunId() + "-" + item.sourceId(),
                        "body_site", "WHOLE_BODY", "radiation_astronaut_id", item.sourceId().toString(),
                        "accumulation_started_at", config.get("start_at"), "dosimetry_method", "SYNTHETIC_DEMO_ABSORBED_DOSE"));
            }
            default -> { }
        }
        if (!SimulationPayload.canonical(item.scope()).equals(SimulationPayload.canonical(json.valueToTree(expected)))) throw invalid();
        if (item.code().equals(RADIATION)) {
            // A workspace restart/independent capture must never reuse another accumulation origin.
            expected = new LinkedHashMap<>(SimulationScopeDefinitions.radiation(capture.getId(), mapping.getAstronautId(),
                    Instant.parse(expected.get("accumulation_started_at").toString())).scope());
        }
        var rows = jdbc.queryForList("SELECT * FROM measurement_comparison_scopes WHERE indicator_code = ? AND scope_code = ?"
                + (item.code().equals(RADIATION) ? " FOR UPDATE" : ""), item.code(), expected.get("scope_code"));
        if (rows.isEmpty()) throw new SimulationIngestionException(422, "missing_scope", expected);
        var row = rows.get(0);
        if (!SimulationScopeDefinitions.matches(row, expected)) throw new SimulationIngestionException(409, "scope_definition_conflict");
        return (UUID) row.get("id");
    }
}
