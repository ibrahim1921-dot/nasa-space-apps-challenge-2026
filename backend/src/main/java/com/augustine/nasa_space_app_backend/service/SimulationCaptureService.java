package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.CaptureRegistrationRequest;
import com.augustine.nasa_space_app_backend.dto.SimulationCaptureResponse;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import jakarta.validation.Validator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional
public class SimulationCaptureService {
    private static final Set<String> DESTINATIONS = Set.of("crew-01", "crew-02", "crew-03", "crew-04");
    private final SimulationCaptureRepository captures;
    private final SimulationProfileMappingRepository mappings;
    private final AstronautRepository astronauts;
    private final AccountRepository accounts;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Validator validator;
    private final Clock clock;
    private final boolean enabled;
    private final String environment;

    public SimulationCaptureService(SimulationCaptureRepository captures, SimulationProfileMappingRepository mappings,
            AstronautRepository astronauts, AccountRepository accounts, JdbcTemplate jdbc, ObjectMapper json,
            Validator validator, Clock clock,
            @Value("${astrohealth.simulation.capture-registration-enabled:false}") boolean enabled,
            @Value("${astrohealth.environment:disabled}") String environment) {
        this.captures = captures;
        this.mappings = mappings;
        this.astronauts = astronauts;
        this.accounts = accounts;
        this.jdbc = jdbc;
        this.json = json;
        this.validator = validator;
        this.clock = clock;
        this.enabled = enabled;
        this.environment = environment;
    }

    public Registration register(CaptureRegistrationRequest request) {
        UUID creator = requireOfficer();
        requireFeature();
        validate(request);
        // V31 intentionally allows independent captures. Serialize service registrations (including
        // first insert, where no row exists to lock) without altering applied migration history.
        jdbc.execute("SELECT pg_advisory_xact_lock(7262110031)");
        Map<String, Object> approval = approval(request);
        var retry = captures.findRegistration(creator, request.registrationKey().toString());
        if (retry.isPresent()) {
            if (!sameApproval(retry.get(), approval, true)) throw conflict();
            return new Registration(response(retry.get()), false);
        }
        for (var existing : captures.findAllByWorkspaceIdAndEngineRunId(request.workspaceId(), request.runId())) {
            // Do not permit a second officer to take over this workspace/run or substitute its manifest.
            if (!existing.getCreatedByAccountId().equals(creator) || !sameApproval(existing, approval, false)) {
                throw conflict();
            }
        }
        List<SimulationProfileMapping> approved = new ArrayList<>();
        // Stable lock order serializes against archive/reactivation and other registrations.
        var ordered = request.mappings().stream()
                .sorted(Comparator.comparing(CaptureRegistrationRequest.ProfileMapping::targetCrewCode)).toList();
        Map<String, Astronaut> destinations = new HashMap<>();
        for (var mapping : ordered) {
            var profile = astronauts.findLockedByCrewCode(mapping.targetCrewCode())
                    .orElseThrow(() -> new CaptureRegistrationException(404, "Destination astronaut not found."));
            if (profile.getArchivedAt() != null) {
                throw new CaptureRegistrationException(409, "Destination astronaut is archived.");
            }
            destinations.put(mapping.targetCrewCode(), profile);
        }
        var capture = captures.saveAndFlush(new SimulationCapture(request.workspaceId(), request.runId(), creator, approval));
        for (var mapping : ordered) {
            approved.add(new SimulationProfileMapping(capture.getId(), mapping.simulationAstronautId(),
                    mapping.simulationCrewCode(), destinations.get(mapping.targetCrewCode()).getId(), mapping.targetCrewCode()));
        }
        mappings.saveAllAndFlush(approved);
        capture.activate(nowAtLeast(capture.getCreatedAt()));
        captures.flush();
        return new Registration(response(capture), true);
    }

    public SimulationCaptureResponse get(UUID id) {
        UUID creator = requireOfficer();
        requireFeature();
        return response(owned(id, creator));
    }

    /** Joins the ingestion transaction; holds account and capture locks until that batch completes. */
    public SimulationCapture lockForIngestion(UUID id) {
        UUID creator = requireOfficer();
        requireFeature();
        return owned(id, creator);
    }

    public SimulationCaptureResponse close(UUID id, UUID workspaceId, UUID runId) {
        UUID creator = requireOfficer();
        requireFeature();
        var capture = owned(id, creator);
        if (!capture.getWorkspaceId().equals(workspaceId) || !capture.getEngineRunId().equals(runId)) throw conflict();
        if (capture.getStatus() == SimulationCaptureStatus.ACTIVE) {
            capture.close(nowAtLeast(capture.getActivatedAt()));
            captures.flush();
        } else if (capture.getStatus() != SimulationCaptureStatus.CLOSED) {
            throw conflict();
        }
        return response(capture);
    }

    private UUID requireOfficer() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AccountPrincipal principal)) {
            throw new AuthenticationCredentialsNotFoundException("Authentication is required.");
        }
        var account = accounts.findLockedById(principal.accountId()).filter(Account::isEnabled)
                .orElseThrow(() -> new BadCredentialsException("Invalid account."));
        if (account.getRole() != AccountRole.NASA_OFFICER) throw new AccessDeniedException("NASA officer access is required.");
        return account.getId();
    }

    private void requireFeature() {
        if (!enabled || !("development".equals(environment) || "demo".equals(environment))) {
            throw new CaptureRegistrationException(403, "Simulation capture registration is disabled.");
        }
    }

    private SimulationCapture owned(UUID id, UUID creator) {
        return captures.findLockedById(id).filter(c -> c.getCreatedByAccountId().equals(creator))
                .orElseThrow(() -> new CaptureRegistrationException(404, "Simulation capture not found."));
    }

    private void validate(CaptureRegistrationRequest request) {
        if (request == null || !validator.validate(request).isEmpty()) throw invalid();
        var manifest = request.manifest();
        if (!"astrohealth.simulation.run.v1".equals(manifest.schemaVersion())
                || !Boolean.TRUE.equals(manifest.synthetic()) || !request.runId().equals(manifest.runId())
                || request.workspaceId().equals(new UUID(0, 0)) || request.runId().equals(new UUID(0, 0))
                || request.registrationKey().equals(new UUID(0, 0))) throw invalid();
        if (json.writeValueAsString(approval(request)).getBytes(StandardCharsets.UTF_8).length > 262144) throw invalid();
        var config = manifest.configuration();
        if (!(config.get("seed") instanceof Number seed) || seed.doubleValue() != seed.longValue()
                || !(config.get("start_at") instanceof String start)) throw invalid();
        try { Instant.parse(start); } catch (RuntimeException exception) { throw invalid(); }
        if (!(config.get("profiles") instanceof List<?> profiles) || profiles.isEmpty() || profiles.size() > 64) throw invalid();
        Map<UUID, String> sources = new HashMap<>();
        Set<String> codes = new HashSet<>();
        for (Object raw : profiles) {
            if (!(raw instanceof Map<?, ?> profile) || !(profile.get("astronaut_id") instanceof String id)
                    || !(profile.get("crew_code") instanceof String code) || code.isBlank() || code.length() > 64) throw invalid();
            UUID source;
            try { source = UUID.fromString(id); } catch (RuntimeException exception) { throw invalid(); }
            if (source.equals(new UUID(0, 0)) || sources.put(source, code) != null || !codes.add(code)) throw invalid();
        }
        Set<UUID> ids = new HashSet<>();
        Set<String> sourceCodes = new HashSet<>();
        Set<String> targets = new HashSet<>();
        for (var mapping : request.mappings()) {
            if (!DESTINATIONS.contains(mapping.targetCrewCode())
                    || !mapping.simulationCrewCode().equals(sources.get(mapping.simulationAstronautId()))
                    || !ids.add(mapping.simulationAstronautId()) || !sourceCodes.add(mapping.simulationCrewCode())
                    || !targets.add(mapping.targetCrewCode())) throw invalid();
        }
    }

    private Map<String, Object> approval(CaptureRegistrationRequest request) {
        var m = request.manifest();
        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("schema_version", m.schemaVersion());
        manifest.put("engine_version", m.engineVersion());
        manifest.put("synthetic", m.synthetic());
        manifest.put("run_id", m.runId().toString());
        manifest.put("configuration", m.configuration());
        if (m.warning() != null) manifest.put("warning", m.warning());
        return Map.of("registration_key", request.registrationKey().toString(),
                "workspace_id", request.workspaceId().toString(), "run_id", request.runId().toString(),
                "run_manifest", manifest, "mappings", request.mappings().stream()
                        .sorted(Comparator.comparing(p -> p.simulationAstronautId().toString()))
                        .map(p -> Map.of("simulation_astronaut_id", p.simulationAstronautId().toString(),
                                "simulation_crew_code", p.simulationCrewCode(), "target_crew_code", p.targetCrewCode())).toList());
    }

    private boolean sameApproval(SimulationCapture capture, Map<String, Object> approval, boolean includeKey) {
        // PostgreSQL JSONB equality normalizes object key order and numeric representations;
        // mappings are sorted before storage. Other array order remains significant.
        String expression = includeKey ? "manifest = CAST(? AS jsonb)"
                : "(manifest - 'registration_key') = (CAST(? AS jsonb) - 'registration_key')";
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT " + expression + " FROM simulation_captures WHERE id = ?",
                Boolean.class, json.writeValueAsString(approval), capture.getId()));
    }

    private SimulationCaptureResponse response(SimulationCapture capture) {
        return new SimulationCaptureResponse(capture.getId(), capture.getWorkspaceId(), capture.getEngineRunId(),
                capture.getCreatedByAccountId(), capture.getStatus(), capture.getCreatedAt(), capture.getActivatedAt(),
                capture.getClosedAt(), mappings.findAllByCaptureId(capture.getId()).stream()
                        .sorted(Comparator.comparing(SimulationProfileMapping::getSimulationCrewCode))
                        .map(m -> new SimulationCaptureResponse.Mapping(m.getId(), m.getSimulationAstronautId(),
                                m.getSimulationCrewCode(), m.getAstronautId(), m.getTargetCrewCode(), m.getCreatedAt())).toList());
    }

    private Instant nowAtLeast(Instant minimum) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        return now.isBefore(minimum) ? minimum : now;
    }
    private static CaptureRegistrationException invalid() {
        return new CaptureRegistrationException(400, "Invalid simulation capture manifest or mappings.");
    }
    private static CaptureRegistrationException conflict() {
        return new CaptureRegistrationException(409, "Simulation capture registration conflicts with an existing capture.");
    }
    public record Registration(SimulationCaptureResponse capture, boolean created) { }
}
