package com.augustine.nasa_space_app_backend.service;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.Duration;
import java.util.*;
import static com.augustine.nasa_space_app_backend.service.SimulationPayload.invalid;

/** Explicit engine/export v1 vocabulary. No request value is used as a SQL identifier. */
@Component
public class SimulationEnvelopeValidator {
    public static final String RADIATION = "cumulative_absorbed_radiation_dose";
    private static final Set<String> CONTEXTS = Set.of("RESTING", "SLEEPING", "EXERCISING", "OTHER", "UNKNOWN");
    private static final Map<String, Spec> SPECS = Map.of(
            "heart_rate", new Spec("SCALAR", "health_measurements", Map.of("value", "beats/min")),
            "blood_sugar", new Spec("SCALAR", "health_measurements", Map.of("value", "mmol/L")),
            "body_temperature", new Spec("SCALAR", "health_measurements", Map.of("value", "Cel")),
            RADIATION, new Spec("SCALAR", "health_measurements", Map.of("value", "mGy")),
            "blood_pressure", new Spec("BLOOD_PRESSURE", "blood_pressure_observations", Map.of("systolic", "mmHg", "diastolic", "mmHg")),
            "sleep_hours", new Spec("SLEEP", "sleep_sessions", Map.of("duration", "h")),
            "mood", new Spec("MOOD", "mood_assessments", Map.of("score", "score")),
            "muscle", new Spec("MUSCLE", "muscle_assessments", Map.of("grip_strength", "kgf", "muscle_mass", "kg")),
            "bone_mineral_density", new Spec("BONE", "bone_density_examinations", Map.of("areal_density", "g/cm2")));

    public Validated validate(JsonNode e) {
        fields(e, "schema_version", "source", "is_simulated", "crew_code", "observation", "comparison_scope",
                "value_table", "values", "metrics", "baseline_parameters", "baseline_deviations");
        equal(text(e, "schema_version"), "astrohealth.simulation.observation.v1");
        equal(text(e, "source"), "synthetic"); truth(e.get("is_simulated"));
        String crew = text(e, "crew_code");
        JsonNode o = e.get("observation"), v = e.get("values"), scope = e.get("comparison_scope");
        fields(o, "astronaut_id", "astronaut_mission_id", "checkin_id", "indicator_code", "storage_kind",
                "comparison_scope_id", "activity_context", "measured_at", "source_kind", "source_name",
                "source_record_id", "provenance", "simulation_metadata");
        for (String name : List.of("astronaut_mission_id", "checkin_id", "comparison_scope_id")) nil(o.get(name));
        UUID source = uuid(o, "astronaut_id");
        String code = text(o, "indicator_code"); Spec spec = SPECS.get(code);
        if (spec == null) throw invalid();
        equal(text(o, "storage_kind"), spec.kind()); equal(text(e, "value_table"), spec.table());
        equal(text(o, "source_kind"), "SIMULATION");
        text(o, "source_name");
        String record = text(o, "source_record_id");
        if (record.length() > 256) throw invalid();
        String context = text(o, "activity_context");
        if (!CONTEXTS.contains(context)) throw invalid();
        Instant at = instant(o, "measured_at");
        JsonNode provenance = o.get("provenance");
        fields(provenance, "engine_version", "synthetic"); truth(provenance.get("synthetic")); text(provenance, "engine_version");
        JsonNode meta = o.get("simulation_metadata");
        fields(meta, "run_id", "seed", "scenario", "phase", "tick", "time_scale", "stress", "activity",
                "sleep_hours", "radiation_mgy_per_day", "radiation_multiplier");
        UUID run = uuid(meta, "run_id"); integer(meta.get("seed"));
        if (integer(meta.get("tick")) < 0 || number(meta.get("time_scale")).signum() <= 0) throw invalid();
        if (!Set.of("normal", "exercise", "recovery", "stress_sleep_deprivation", "elevated_radiation").contains(text(meta, "scenario"))) throw invalid();
        if (!Set.of("REST", "SLEEP_WINDOW", "EXERCISE", "RECOVERY", "STRESS_SLEEP_DEPRIVATION").contains(text(meta, "phase"))) throw invalid();
        for (String key : List.of("stress", "activity")) range(number(meta.get(key)), BigDecimal.ZERO, BigDecimal.ONE);
        range(number(meta.get("sleep_hours")), BigDecimal.ZERO, BigDecimal.valueOf(24));
        for (String key : List.of("radiation_mgy_per_day", "radiation_multiplier")) {
            if (number(meta.get(key)).signum() < 0) throw invalid();
        }
        List<Metric> metrics = metrics(e.get("metrics"), spec);
        if (spec.kind().equals("MUSCLE")) {
            if (metrics.size() != 1) throw invalid();
        } else if (metrics.size() != spec.units().size()) throw invalid();
        Map<String, BigDecimal> quantities = new HashMap<>();
        metrics.forEach(m -> quantities.put(m.code(), m.value()));
        switch (spec.kind()) {
            case "SCALAR" -> {
                fields(v, "metric_code", "value", "unit"); equal(text(v, "metric_code"), "value");
                equal(text(v, "unit"), spec.units().get("value")); same(number(v.get("value")), quantities.get("value"));
                BigDecimal value = quantity(v.get("value"), 18, 6);
                if (code.equals(RADIATION) && (value.signum() < 0 || number(v.get("value")).signum() < 0)) throw invalid();
                if (code.equals(RADIATION)) same(number(v.get("value")), value);
            }
            case "BLOOD_PRESSURE" -> {
                fields(v, "systolic", "diastolic", "unit", "method"); equal(text(v, "unit"), "mmHg");
                equal(text(v, "method"), "SYNTHETIC_DEMO");
                for (String key : List.of("systolic", "diastolic")) {
                    same(number(v.get(key)), quantities.get(key)); positive(quantity(v.get(key), 8, 3));
                }
            }
            case "SLEEP" -> {
                fields(v, "started_at", "ended_at", "asleep_seconds");
                Instant start = instant(v, "started_at"), end = instant(v, "ended_at");
                long seconds = integer(v.get("asleep_seconds"));
                Duration window = Duration.between(start, end);
                BigDecimal windowSeconds = BigDecimal.valueOf(window.getSeconds()).add(BigDecimal.valueOf(window.getNano(), 9));
                if (!end.isAfter(start) || !end.equals(at) || seconds < 0 || seconds > Integer.MAX_VALUE
                        || BigDecimal.valueOf(seconds).compareTo(windowSeconds) > 0) throw invalid();
                same(BigDecimal.valueOf(seconds).divide(BigDecimal.valueOf(3600), 6, RoundingMode.HALF_UP), quantities.get("duration"));
                equal(context, "SLEEPING");
            }
            case "MOOD" -> {
                fields(v, "score", "unit", "notes"); equal(text(v, "unit"), "score");
                equal(text(v, "notes"), "Synthetic demonstration only");
                same(number(v.get("score")), quantities.get("score"));
                range(number(v.get("score")), BigDecimal.ONE, BigDecimal.valueOf(5));
                range(quantity(v.get("score"), 12, 4), BigDecimal.ONE, BigDecimal.valueOf(5));
            }
            case "MUSCLE" -> {
                String metric = metrics.get(0).code(); String key = metric.equals("grip_strength") ? "grip_strength_kgf" : "muscle_mass_kg";
                fields(v, key); same(number(v.get(key)), quantities.get(metric));
                BigDecimal value = quantity(v.get(key), 12, 4);
                if (metric.equals("grip_strength") ? value.signum() < 0 : value.signum() <= 0) throw invalid();
                if (number(v.get(key)).signum() < 0) throw invalid();
            }
            case "BONE" -> {
                fields(v, "areal_density", "unit"); equal(text(v, "unit"), "g/cm2");
                same(number(v.get("areal_density")), quantities.get("areal_density")); positive(quantity(v.get("areal_density"), 12, 6));
            }
            default -> throw invalid();
        }
        text(scope, "scope_code");
        // Full descriptor is checked against the server's expected scope after capture resolution.
        equal(text(scope, "indicator_code"), code); equal(text(scope, "storage_kind"), spec.kind());
        baselineSnapshots(e, metrics, context, text(scope, "scope_code"), code.equals("sleep_hours"));
        return new Validated(e, o, v, scope, code, spec.kind(), source, crew, record, context, at, run, metrics);
    }

    private List<Metric> metrics(JsonNode array, Spec spec) {
        if (array == null || !array.isArray() || array.isEmpty() || array.size() > 2) throw invalid();
        Set<String> seen = new HashSet<>(); List<Metric> result = new ArrayList<>();
        for (var m : array) {
            fields(m, "metric_code", "value", "unit"); String code = text(m, "metric_code"), unit = text(m, "unit");
            if (!seen.add(code) || !unit.equals(spec.units().get(code))) throw invalid();
            result.add(new Metric(code, unit, number(m.get("value"))));
        }
        return result;
    }

    private void baselineSnapshots(JsonNode e, List<Metric> metrics, String context, String scope, boolean sleep) {
        JsonNode baselines = e.get("baseline_parameters"); fields(baselines, "original", "activity");
        for (String type : List.of("original", "activity")) {
            JsonNode array = baselines.get(type);
            if (!array.isArray() || array.size() != metrics.size()) throw invalid();
            Set<String> seen = new HashSet<>();
            for (var b : array) {
                fields(b, "baseline_kind", "version", "metric_code", "unit", "activity_context", "scope_code",
                        "reference_value", "simulation_noise_sd", "lower_bound", "upper_bound", "source_name");
                equal(text(b, "baseline_kind"), "ORIGINAL"); if (integer(b.get("version")) != 1) throw invalid();
                matchingMetric(b, metrics, seen); equal(text(b, "scope_code"), scope);
                equal(text(b, "activity_context"), type.equals("activity") ? context : sleep ? "SLEEPING" : "RESTING");
                number(b.get("reference_value")); if (number(b.get("simulation_noise_sd")).signum() < 0) throw invalid();
                nil(b.get("lower_bound")); nil(b.get("upper_bound")); text(b, "source_name");
            }
        }
        JsonNode deviations = e.get("baseline_deviations");
        if (!deviations.isArray() || deviations.size() != metrics.size()) throw invalid();
        Set<String> seen = new HashSet<>();
        for (var d : deviations) {
            fields(d, "metric_code", "unit", "from_original", "from_activity"); matchingMetric(d, metrics, seen);
            number(d.get("from_original")); number(d.get("from_activity"));
        }
    }

    private void matchingMetric(JsonNode node, List<Metric> metrics, Set<String> seen) {
        String code = text(node, "metric_code"), unit = text(node, "unit");
        if (!seen.add(code) || metrics.stream().noneMatch(m -> m.code().equals(code) && m.unit().equals(unit))) throw invalid();
    }

    static void fields(JsonNode object, String... fields) {
        if (object == null || !object.isObject() || !new HashSet<>(object.propertyNames()).equals(Set.of(fields))) throw invalid();
    }
    static String text(JsonNode object, String key) {
        JsonNode n = object == null ? null : object.get(key);
        if (n == null || !n.isTextual() || n.asText().isBlank() || n.asText().length() > 4096 || n.asText().indexOf('\0') >= 0) throw invalid();
        return n.asText();
    }
    static UUID uuid(JsonNode object, String key) {
        try {
            String raw = text(object, key); UUID id = UUID.fromString(raw);
            if (id.equals(new UUID(0, 0)) || !id.toString().equalsIgnoreCase(raw)) throw invalid();
            return id;
        } catch (IllegalArgumentException exception) { throw invalid(); }
    }
    static Instant instant(JsonNode object, String key) {
        try {
            Instant at = Instant.parse(text(object, key));
            if (at.getNano() % 1000 != 0 || at.isBefore(Instant.parse("0001-01-01T00:00:00Z"))
                    || !at.isBefore(Instant.parse("9999-12-31T23:59:59.999999Z"))) throw invalid();
            return at;
        } catch (java.time.DateTimeException exception) { throw invalid(); }
    }
    static BigDecimal number(JsonNode n) {
        if (n == null || !n.isNumber()) throw invalid();
        try {
            BigDecimal value = n.decimalValue();
            if (value.precision() > 128 || Math.abs((long) value.scale()) > 128) throw invalid();
            return value;
        } catch (ArithmeticException exception) { throw invalid(); }
    }
    static long integer(JsonNode n) {
        try { return number(n).longValueExact(); } catch (ArithmeticException exception) { throw invalid(); }
    }
    static BigDecimal quantity(JsonNode n, int precision, int scale) {
        BigDecimal value = number(n).setScale(scale, RoundingMode.HALF_UP);
        if (value.precision() > precision) throw invalid();
        return value;
    }
    static void truth(JsonNode n) { if (n == null || !n.isBoolean() || !n.booleanValue()) throw invalid(); }
    static void nil(JsonNode n) { if (n == null || !n.isNull()) throw invalid(); }
    static void equal(Object a, Object b) { if (!Objects.equals(a, b)) throw invalid(); }
    static void same(BigDecimal a, BigDecimal b) { if (a == null || b == null || a.compareTo(b) != 0) throw invalid(); }
    private static void positive(BigDecimal n) { if (n.signum() <= 0) throw invalid(); }
    private static void range(BigDecimal n, BigDecimal min, BigDecimal max) { if (n.compareTo(min) < 0 || n.compareTo(max) > 0) throw invalid(); }
    private record Spec(String kind, String table, Map<String, String> units) { }
    public record Metric(String code, String unit, BigDecimal value) { }
    public record Validated(JsonNode envelope, JsonNode observation, JsonNode values, JsonNode scope,
            String code, String kind, UUID sourceId, String crewCode, String recordId, String context,
            Instant measuredAt, UUID runId, List<Metric> metrics) { }
}
