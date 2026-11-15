package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.SimulationIngestionResponse;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static com.augustine.nasa_space_app_backend.service.SimulationEnvelopeValidator.*;
import static com.augustine.nasa_space_app_backend.service.SimulationPayload.invalid;

@Service
public class SimulationIngestionService {
    private final SimulationCaptureService access;
    private final SimulationProfileMappingRepository mappings;
    private final SimulationIngestionReceiptRepository receipts;
    private final AstronautRepository astronauts;
    private final SimulationEnvelopeValidator validator;
    private final SimulationScopeResolver scopes;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ObservationEvaluationOutbox monitoring;

    public SimulationIngestionService(SimulationCaptureService access, SimulationProfileMappingRepository mappings,
            SimulationIngestionReceiptRepository receipts, AstronautRepository astronauts, SimulationEnvelopeValidator validator,
            SimulationScopeResolver scopes, JdbcTemplate jdbc, ObjectMapper json, ObservationEvaluationOutbox monitoring) {
        this.access = access; this.mappings = mappings; this.receipts = receipts; this.astronauts = astronauts;
        this.validator = validator; this.scopes = scopes; this.jdbc = jdbc; this.json = json;
        this.monitoring = monitoring;
    }

    @Transactional(timeout = 30)
    public SimulationIngestionResponse ingest(UUID captureId, byte[] body) {
        // Same lock order as close/registration: account, capture, destinations, radiation scope.
        SimulationCapture capture = access.lockForIngestion(captureId);
        JsonNode page = SimulationPayload.parse(body);
        validatePage(page);
        equal(uuid(page, "workspace_id"), capture.getWorkspaceId());
        Map<UUID, SimulationProfileMapping> approved = new HashMap<>();
        mappings.findAllByCaptureId(captureId).forEach(m -> approved.put(m.getSimulationAstronautId(), m));
        List<Input> inputs = new ArrayList<>();
        Set<String> ids = new HashSet<>(); Set<Long> sequences = new HashSet<>();
        long previous = 0;
        for (JsonNode raw : page.get("items")) {
            fields(raw, "sequence", "envelope"); long sequence = integer(raw.get("sequence"));
            if (sequence <= previous || !sequences.add(sequence)) throw invalid();
            previous = sequence;
            Validated item = validator.validate(raw.get("envelope"));
            if (!ids.add(item.recordId())) throw invalid();
            equal(item.runId(), capture.getEngineRunId());
            SimulationProfileMapping mapping = approved.get(item.sourceId());
            if (mapping == null || !mapping.getSimulationCrewCode().equals(item.crewCode())
                    || !Set.of("crew-01", "crew-02", "crew-03", "crew-04").contains(mapping.getTargetCrewCode())) {
                throw new SimulationIngestionException(403, "unapproved_profile");
            }
            validateManifestIdentity(capture, item);
            if (SimulationPayload.canonical(item.envelope()).getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 65536) {
                throw new SimulationIngestionException(413, "observation_too_large");
            }
            inputs.add(new Input(sequence, item, mapping));
        }
        var destinations = inputs.stream().map(Input::mapping).map(SimulationProfileMapping::getAstronautId).distinct()
                .sorted(Comparator.comparing(UUID::toString)).toList();
        for (UUID id : destinations) {
            Astronaut astronaut = astronauts.findLockedById(id).orElseThrow(() -> new SimulationIngestionException(404, "astronaut_not_found"));
            if (astronaut.getArchivedAt() != null) throw new SimulationIngestionException(409, "astronaut_archived");
            if (inputs.stream().filter(i -> i.mapping().getAstronautId().equals(id))
                    .anyMatch(i -> !i.mapping().getTargetCrewCode().equals(astronaut.getCrewCode()))) {
                throw new SimulationIngestionException(403, "unapproved_profile");
            }
        }
        List<SimulationIngestionResponse.Result> results = new ArrayList<>(); int created = 0;
        for (var input : inputs) {
            var item = input.item(); var mapping = input.mapping();
            String hash = SimulationPayload.hash(item.envelope(), captureId.toString(), capture.getWorkspaceId().toString(),
                    mapping.getId().toString(), input.sequence());
            var retry = receipts.findByCaptureIdAndSourceRecordId(captureId, item.recordId());
            if (retry.isPresent()) {
                var receipt = retry.get();
                if (!receipt.getPayloadSha256().equals(hash) || !receipt.getCanonicalizationVersion().equals(SimulationPayload.VERSION)
                        || receipt.getExportSequence() != input.sequence() || !receipt.getProfileMappingId().equals(mapping.getId())) throw conflict();
                results.add(new SimulationIngestionResponse.Result(input.sequence(), item.recordId(), receipt.getObservationId(), true));
                continue;
            }
            if (capture.getStatus() != SimulationCaptureStatus.ACTIVE) throw new SimulationIngestionException(409, "capture_not_active");
            Integer sequenceUsed = jdbc.queryForObject("SELECT COUNT(*) FROM simulation_ingestion_receipts WHERE capture_id = ? AND export_sequence = ?",
                    Integer.class, captureId, input.sequence());
            if (sequenceUsed == null || sequenceUsed != 0) throw conflict();
            validateCatalog(item);
            UUID scopeId = scopes.resolve(item, capture, mapping);
            if (item.code().equals(RADIATION)) validateRadiation(item, scopeId);
            UUID observationId = insertHeader(item, capture, mapping, scopeId);
            insertValues(item, observationId);
            receipts.saveAndFlush(new SimulationIngestionReceipt(captureId, mapping.getId(), mapping.getAstronautId(),
                    item.recordId(), input.sequence(), hash, SimulationPayload.VERSION, observationId));
            monitoring.enqueueNewObservation(observationId);
            results.add(new SimulationIngestionResponse.Result(input.sequence(), item.recordId(), observationId, false));
            created++;
        }
        // Fail inside the service boundary, including deferred subtype/sleep/mood integrity checks.
        jdbc.execute("SET CONSTRAINTS health_observations_complete IMMEDIATE");
        jdbc.execute("SET CONSTRAINTS health_observations_complete DEFERRED");
        return new SimulationIngestionResponse(captureId, created, inputs.size() - created, results);
    }

    private void validatePage(JsonNode page) {
        Set<String> allowed = Set.of("schema_version", "synthetic", "workspace_id", "items", "durable", "after", "through",
                "last_sequence", "retained_observations", "record_limit", "next_url", "checkpoint_url");
        if (!allowed.containsAll(page.propertyNames())) throw invalid();
        equal(text(page, "schema_version"), "astrohealth.simulation.export.v1"); truth(page.get("synthetic"));
        var items = page.get("items");
        if (items == null || !items.isArray() || items.isEmpty() || items.size() > 100) throw invalid();
        if (page.has("durable") && (!page.get("durable").isBoolean() || page.get("durable").booleanValue())) throw invalid();
        for (String name : List.of("after", "through", "last_sequence", "retained_observations", "record_limit")) {
            if (page.has(name) && integer(page.get(name)) < 0) throw invalid();
        }
        for (String name : List.of("next_url", "checkpoint_url")) {
            if (page.has(name) && !page.get(name).isNull()) text(page, name);
        }
    }

    private void validateManifestIdentity(SimulationCapture capture, Validated item) {
        JsonNode manifest = json.valueToTree(capture.getManifest().get("run_manifest"));
        if (manifest == null || !manifest.isObject() || manifest.get("configuration") == null
                || !manifest.get("configuration").isObject()) {
            throw new SimulationIngestionException(409, "invalid_capture_manifest");
        }
        JsonNode config = manifest.get("configuration"), meta = item.observation().get("simulation_metadata");
        equal(text(manifest, "engine_version"), text(item.observation().get("provenance"), "engine_version"));
        same(number(config.get("seed")), number(meta.get("seed")));
        if (item.measuredAt().isBefore(instant(config, "start_at"))) throw invalid();
    }

    private void validateCatalog(Validated item) {
        Integer supported = jdbc.queryForObject("SELECT COUNT(*) FROM health_indicators i JOIN indicator_contexts c ON c.indicator_code = i.code "
                + "WHERE i.code = ? AND i.storage_kind = ? AND c.activity_context = ?", Integer.class, item.code(), item.kind(), item.context());
        if (supported == null || supported != 1) throw invalid();
        for (var metric : item.metrics()) {
            Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM indicator_metrics WHERE indicator_code = ? AND metric_code = ? AND unit = ?",
                    Integer.class, item.code(), metric.code(), metric.unit());
            if (exists == null || exists != 1) throw invalid();
        }
    }

    private void validateRadiation(Validated item, UUID scope) {
        var previous = jdbc.queryForList("SELECT o.measured_at, m.value FROM health_observations o JOIN health_measurements m ON m.observation_id = o.id "
                + "WHERE o.comparison_scope_id = ? ORDER BY o.measured_at DESC LIMIT 1", scope);
        if (!previous.isEmpty()) {
            Instant latest = ((Timestamp) previous.get(0).get("measured_at")).toInstant();
            BigDecimal value = (BigDecimal) previous.get(0).get("value");
            if (!item.measuredAt().isAfter(latest) || quantity(item.values().get("value"), 18, 6).compareTo(value) < 0) {
                throw new SimulationIngestionException(409, "radiation_order_conflict");
            }
        }
    }

    private UUID insertHeader(Validated item, SimulationCapture capture, SimulationProfileMapping mapping, UUID scope) {
        ObjectNode provenance = (ObjectNode) item.observation().get("provenance").deepCopy();
        provenance.put("demonstration_only", true);
        provenance.set("original_simulation_envelope", item.envelope());
        ObjectNode metadata = (ObjectNode) item.observation().get("simulation_metadata").deepCopy();
        metadata.put("workspace_id", capture.getWorkspaceId().toString()); metadata.put("capture_id", capture.getId().toString());
        metadata.put("simulation_astronaut_id", item.sourceId().toString()); metadata.put("simulation_crew_code", item.crewCode());
        if (item.kind().equals("MOOD")) metadata.put("assessment_origin", "SYNTHETIC_DEMONSTRATION_NOT_ASTRONAUT_SUBMISSION");
        return jdbc.queryForObject("INSERT INTO health_observations(astronaut_id, indicator_code, storage_kind, comparison_scope_id, "
                + "activity_context, measured_at, source_kind, source_name, source_record_id, provenance, simulation_metadata) "
                + "VALUES (?,?,?,?,?,?,'SIMULATION',?,?,CAST(? AS jsonb),CAST(? AS jsonb)) RETURNING id", UUID.class,
                mapping.getAstronautId(), item.code(), item.kind(), scope, item.context(), Timestamp.from(item.measuredAt()),
                text(item.observation(), "source_name"), item.recordId(), SimulationPayload.canonical(provenance), SimulationPayload.canonical(metadata));
    }

    private void insertValues(Validated item, UUID id) {
        JsonNode v = item.values();
        switch (item.kind()) {
            case "SCALAR" -> jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,?,?,?)",
                    id, item.code(), quantity(v.get("value"), 18, 6), text(v, "unit"));
            case "BLOOD_PRESSURE" -> jdbc.update("INSERT INTO blood_pressure_observations(observation_id,systolic,diastolic,unit,method) VALUES (?,?,?,?,?)",
                    id, quantity(v.get("systolic"), 8, 3), quantity(v.get("diastolic"), 8, 3), "mmHg", text(v, "method"));
            case "SLEEP" -> jdbc.update("INSERT INTO sleep_sessions(observation_id,started_at,ended_at,asleep_seconds) VALUES (?,?,?,?)",
                    id, Timestamp.from(instant(v, "started_at")), Timestamp.from(instant(v, "ended_at")), integer(v.get("asleep_seconds")));
            case "MOOD" -> jdbc.update("INSERT INTO mood_assessments(observation_id,score,unit,notes) VALUES (?,?,?,?)",
                    id, quantity(v.get("score"), 12, 4), "score", "Synthetic demonstration only");
            case "MUSCLE" -> {
                if (v.has("grip_strength_kgf")) jdbc.update("INSERT INTO muscle_assessments(observation_id,grip_strength_kgf) VALUES (?,?)", id, quantity(v.get("grip_strength_kgf"), 12, 4));
                else jdbc.update("INSERT INTO muscle_assessments(observation_id,muscle_mass_kg) VALUES (?,?)", id, quantity(v.get("muscle_mass_kg"), 12, 4));
            }
            case "BONE" -> jdbc.update("INSERT INTO bone_density_examinations(observation_id,areal_density,unit) VALUES (?,?,?)",
                    id, quantity(v.get("areal_density"), 12, 6), "g/cm2");
            default -> throw invalid();
        }
    }

    private static SimulationIngestionException conflict() { return new SimulationIngestionException(409, "receipt_conflict"); }
    private record Input(long sequence, Validated item, SimulationProfileMapping mapping) { }
}
