package com.augustine.nasa_space_app_backend.service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

/** Fixed, versioned technical demo definitions shared by read-only resolution and explicit provisioning. */
public final class SimulationScopeDefinitions {
    public static final String VERSION = "astrohealth.simulation.scopes.v1";
    private static final List<Definition> STATIC = List.of(
            new Definition(Map.of("indicator_code", "mood", "storage_kind", "MOOD", "scope_code", "simulation-mood-v1",
                    "scale_name", "SYNTHETIC_DEMO_MOOD", "scale_version", "1", "scale_min", 1, "scale_max", 5), "score", "score"),
            new Definition(Map.of("indicator_code", "muscle", "storage_kind", "MUSCLE", "scope_code", "simulation-grip_strength-v1",
                    "body_site", "DOMINANT_HAND", "protocol_code", "SYNTHETIC_DEMO_GRIP", "protocol_version", "1"), "grip_strength", "kgf"),
            new Definition(Map.of("indicator_code", "muscle", "storage_kind", "MUSCLE", "scope_code", "simulation-muscle_mass-v1",
                    "body_site", "WHOLE_BODY", "protocol_code", "SYNTHETIC_DEMO_MUSCLE_MASS", "protocol_version", "1"), "muscle_mass", "kg"),
            new Definition(Map.of("indicator_code", "bone_mineral_density", "storage_kind", "BONE", "scope_code", "simulation-bone-v1",
                    "body_site", "LUMBAR_SPINE", "protocol_code", "SYNTHETIC_DEMO_AREAL_DENSITY", "protocol_version", "1"), "areal_density", "g/cm2"));

    private SimulationScopeDefinitions() { }
    public static List<Definition> staticDefinitions() { return STATIC; }
    public static Optional<Definition> forMetric(String indicator, String metric) {
        return STATIC.stream().filter(d -> d.scope().get("indicator_code").equals(indicator) && d.metricCode().equals(metric)).findFirst();
    }

    public static Definition radiation(UUID captureId, UUID astronautId, Instant origin) {
        return new Definition(Map.of("indicator_code", SimulationEnvelopeValidator.RADIATION, "storage_kind", "SCALAR",
                "scope_code", "simulation-capture-" + captureId + "-" + astronautId, "body_site", "WHOLE_BODY",
                "radiation_astronaut_id", astronautId.toString(), "accumulation_started_at", origin.toString(),
                "dosimetry_method", "SYNTHETIC_DEMO_ABSORBED_DOSE"), "value", "mGy");
    }

    public static boolean matches(Map<String, Object> row, Map<String, Object> definition) {
        for (String key : List.of("indicator_code", "scope_code", "storage_kind", "body_site", "protocol_code", "protocol_version",
                "scale_name", "scale_version", "scale_min", "scale_max", "radiation_astronaut_id", "accumulation_started_at", "dosimetry_method")) {
            Object actual = row.get(key), required = definition.get(key);
            boolean matches;
            if (actual instanceof BigDecimal n && required instanceof Number value) matches = n.compareTo(new BigDecimal(value.toString())) == 0;
            else if (actual instanceof Timestamp at && required instanceof String text) matches = at.toInstant().equals(Instant.parse(text));
            else if (actual instanceof OffsetDateTime at && required instanceof String text) matches = at.toInstant().equals(Instant.parse(text));
            else if (actual instanceof UUID id) matches = id.toString().equals(required);
            else matches = Objects.equals(actual, required);
            if (!matches) return false;
        }
        return true;
    }

    public record Definition(Map<String, Object> scope, String metricCode, String unit) {
        public Definition { scope = Map.copyOf(scope); }
    }
}
