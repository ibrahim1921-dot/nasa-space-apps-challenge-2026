package com.augustine.nasa_space_app_backend.provisioning;

import com.augustine.nasa_space_app_backend.service.SimulationPayload;
import com.augustine.nasa_space_app_backend.service.SimulationScopeDefinitions;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationState;
import org.flywaydb.core.api.MigrationVersion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import javax.sql.DataSource;
import java.nio.CharBuffer;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** Explicit command helper only: no Spring component, runner, HTTP handler or payload-driven scope creation. */
public final class DemoSimulationScopeProvisioner {
    private static final Set<String> DESTINATIONS = Set.of("crew-01", "crew-02", "crew-03", "crew-04");
    private final DataSource dataSource;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final TransactionTemplate transaction;
    private final String dummyHash;
    private final boolean enabled;
    private final boolean demoEnabled;
    private final String environment;

    public DemoSimulationScopeProvisioner(DataSource dataSource, PasswordEncoder passwords,
            boolean enabled, boolean demoEnabled, String environment) {
        this.dataSource = dataSource; this.jdbc = new JdbcTemplate(dataSource); this.passwords = passwords;
        this.enabled = enabled; this.demoEnabled = demoEnabled; this.environment = environment;
        this.transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        this.transaction.setTimeout(60);
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    public Result provision(UUID captureId, String loginName, char[] password) {
        try {
            if (!enabled || !demoEnabled || !"development".equals(environment)) {
                throw failure("Explicit development/demo scope provisioning opt-in is required.");
            }
            if (captureId == null || captureId.equals(new UUID(0, 0))) throw failure("A registered capture UUID is required.");
            verifyMigrations();
            return transaction.execute(status -> {
                UUID officer = authenticate(loginName, password);
                var captures = jdbc.queryForList("SELECT id, workspace_id, engine_run_id, created_by_account_id, status, manifest::text AS manifest_json "
                        + "FROM simulation_captures WHERE id = ? FOR UPDATE", captureId);
                if (captures.size() != 1 || !officer.equals(captures.get(0).get("created_by_account_id"))
                        || !"ACTIVE".equals(captures.get(0).get("status"))) {
                    throw failure("An active capture owned by this officer is required.");
                }
                var capture = captures.get(0);
                JsonNode manifest = parseManifest(capture);
                Instant origin = origin(manifest);
                // Registration locks destinations by crew code; coordinate before taking UUID-ordered
                // destination locks so simultaneous registration cannot invert that lock order.
                jdbc.execute("SELECT pg_advisory_xact_lock(7262110031)");
                var mappings = jdbc.queryForList("SELECT id, astronaut_id, target_crew_code, simulation_astronaut_id, simulation_crew_code "
                        + "FROM simulation_profile_mappings WHERE capture_id = ? ORDER BY astronaut_id FOR UPDATE", captureId);
                if (mappings.isEmpty() || mappings.size() > 4 || manifest.get("mappings").size() != mappings.size()) {
                    throw failure("Approved active demo profile mappings are required.");
                }
                List<Approval> approvals = new ArrayList<>();
                SimulationScopeDefinitions.staticDefinitions().forEach(d -> approvals.add(new Approval(d, null)));
                for (var mapping : mappings) {
                    validateMapping(manifest, mapping);
                    var profiles = jdbc.queryForList("SELECT crew_code, archived_at FROM astronauts WHERE id = ? FOR UPDATE", mapping.get("astronaut_id"));
                    if (profiles.size() != 1 || !mapping.get("target_crew_code").equals(profiles.get(0).get("crew_code"))
                            || profiles.get(0).get("archived_at") != null) {
                        throw failure("Each selected demo astronaut must already exist and be active.");
                    }
                    approvals.add(new Approval(SimulationScopeDefinitions.radiation(captureId, (UUID) mapping.get("astronaut_id"), origin),
                            (UUID) mapping.get("id")));
                }
                // Serialize first insertion of the shared static scopes, without changing immutable rows.
                jdbc.execute("SELECT pg_advisory_xact_lock(7262110032)");
                UUID invocation = UUID.randomUUID();
                List<ScopeResult> results = new ArrayList<>();
                for (var approval : approvals) results.add(provisionScope(invocation, captureId, officer, approval));
                return new Result(invocation, List.copyOf(results));
            });
        } finally {
            if (password != null) Arrays.fill(password, '\0');
        }
    }

    private UUID authenticate(String login, char[] password) {
        String normalized = login == null ? "" : login.toLowerCase(Locale.ROOT);
        if (!normalized.matches("^[a-z0-9][a-z0-9._-]{2,63}$") || password == null || password.length == 0 || password.length > 128) {
            throw failure("Invalid officer credentials or capture authorization.");
        }
        var rows = jdbc.queryForList("SELECT id, password_hash, role, enabled FROM accounts WHERE login_name = ? FOR UPDATE", normalized);
        String hash = rows.size() == 1 ? rows.get(0).get("password_hash").toString() : dummyHash;
        boolean matches = passwords.matches(CharBuffer.wrap(password), hash);
        if (!matches || rows.size() != 1 || !Boolean.TRUE.equals(rows.get(0).get("enabled")) || !"NASA_OFFICER".equals(rows.get(0).get("role"))) {
            throw failure("Invalid officer credentials or capture authorization.");
        }
        return (UUID) rows.get(0).get("id");
    }

    private JsonNode parseManifest(Map<String, Object> capture) {
        try {
            JsonNode manifest = SimulationPayload.parse(capture.get("manifest_json").toString().getBytes(StandardCharsets.UTF_8));
            JsonNode run = manifest.get("run_manifest");
            if (run == null || !run.isObject() || !"astrohealth.simulation.run.v1".equals(text(run, "schema_version"))
                    || run.get("synthetic") == null || !run.get("synthetic").isBoolean() || !run.get("synthetic").booleanValue()
                    || !capture.get("engine_run_id").toString().equals(text(run, "run_id"))
                    || !capture.get("engine_run_id").toString().equals(text(manifest, "run_id"))
                    || !capture.get("workspace_id").toString().equals(text(manifest, "workspace_id"))
                    || text(run, "engine_version").length() > 64
                    || run.get("configuration") == null || !run.get("configuration").isObject()
                    || manifest.get("mappings") == null || !manifest.get("mappings").isArray()) throw new IllegalArgumentException();
            var seed = run.get("configuration").get("seed");
            if (seed == null || !seed.isNumber()) throw new IllegalArgumentException();
            seed.decimalValue().longValueExact();
            return manifest;
        } catch (RuntimeException exception) { throw failure("A verified synthetic registration manifest is required."); }
    }

    private Instant origin(JsonNode manifest) {
        try {
            Instant at = Instant.parse(text(manifest.get("run_manifest").get("configuration"), "start_at"));
            if (at.getNano() % 1000 != 0 || at.isBefore(Instant.parse("0001-01-01T00:00:00Z"))
                    || !at.isBefore(Instant.parse("9999-12-31T23:59:59.999999Z"))) throw new IllegalArgumentException();
            return at;
        } catch (RuntimeException exception) { throw failure("A finite registered microsecond-precision accumulation origin is required."); }
    }

    private void validateMapping(JsonNode manifest, Map<String, Object> mapping) {
        if (!DESTINATIONS.contains(mapping.get("target_crew_code"))) throw failure("Only approved fictional demo destinations are permitted.");
        try {
            boolean approved = false, configured = false;
            for (var entry : manifest.get("mappings")) {
                if (mapping.get("simulation_astronaut_id").toString().equals(text(entry, "simulation_astronaut_id"))
                        && mapping.get("simulation_crew_code").equals(text(entry, "simulation_crew_code"))
                        && mapping.get("target_crew_code").equals(text(entry, "target_crew_code"))) approved = true;
            }
            var profiles = manifest.get("run_manifest").get("configuration").get("profiles");
            if (profiles == null || !profiles.isArray()) throw new IllegalArgumentException();
            for (var profile : profiles) {
                if (mapping.get("simulation_astronaut_id").toString().equals(text(profile, "astronaut_id"))
                        && mapping.get("simulation_crew_code").equals(text(profile, "crew_code"))) configured = true;
            }
            if (!approved || !configured) throw new IllegalArgumentException();
        } catch (RuntimeException exception) { throw failure("Profile mappings must match the immutable approved synthetic manifest."); }
    }

    private ScopeResult provisionScope(UUID invocation, UUID capture, UUID officer, Approval approval) {
        var definition = approval.definition(); var scope = definition.scope();
        Integer supported = jdbc.queryForObject("SELECT COUNT(*) FROM health_indicators i JOIN indicator_metrics m ON m.indicator_code=i.code "
                + "WHERE i.code=? AND i.storage_kind=? AND m.metric_code=? AND m.unit=?", Integer.class,
                scope.get("indicator_code"), scope.get("storage_kind"), definition.metricCode(), definition.unit());
        if (supported == null || supported != 1) throw failure("The required measurement catalog must already exist and match canonical units.");
        var existing = jdbc.queryForList("SELECT * FROM measurement_comparison_scopes WHERE indicator_code=? AND scope_code=?",
                scope.get("indicator_code"), scope.get("scope_code"));
        boolean created = false;
        if (existing.isEmpty()) {
            created = jdbc.update("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,protocol_code,protocol_version,"
                    + "scale_name,scale_version,scale_min,scale_max,radiation_astronaut_id,accumulation_started_at,dosimetry_method) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) "
                    + "ON CONFLICT (indicator_code,scope_code) DO NOTHING", scope.get("scope_code"), scope.get("indicator_code"), scope.get("storage_kind"),
                    scope.get("body_site"), scope.get("protocol_code"), scope.get("protocol_version"), scope.get("scale_name"), scope.get("scale_version"),
                    scope.get("scale_min"), scope.get("scale_max"), scope.containsKey("radiation_astronaut_id") ? UUID.fromString(scope.get("radiation_astronaut_id").toString()) : null,
                    scope.containsKey("accumulation_started_at") ? Timestamp.from(Instant.parse(scope.get("accumulation_started_at").toString())) : null, scope.get("dosimetry_method")) == 1;
            existing = jdbc.queryForList("SELECT * FROM measurement_comparison_scopes WHERE indicator_code=? AND scope_code=?", scope.get("indicator_code"), scope.get("scope_code"));
        }
        if (existing.size() != 1 || !SimulationScopeDefinitions.matches(existing.get(0), scope)) {
            throw failure("An existing comparison scope conflicts with the approved demo definition; nothing was overwritten.");
        }
        UUID scopeId = (UUID) existing.get(0).get("id"); String action = created ? "CREATED" : "VERIFIED";
        UUID auditId = jdbc.queryForObject("INSERT INTO simulation_scope_provisioning_audit(invocation_id,capture_id,actor_account_id,profile_mapping_id,scope_id,"
                + "indicator_code,metric_code,unit,action,definition_version,definition) SELECT ?,?,?,?,?,?,?,?, ?,?,to_jsonb(s) "
                + "FROM measurement_comparison_scopes s WHERE s.id=? RETURNING id", UUID.class, invocation, capture, officer, approval.mappingId(), scopeId,
                scope.get("indicator_code"), definition.metricCode(), definition.unit(), action, SimulationScopeDefinitions.VERSION, scopeId);
        return new ScopeResult(scopeId, scope.get("scope_code").toString(), action, auditId);
    }

    private void verifyMigrations() {
        try {
            var config = Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                    .cleanDisabled(true).ignoreMigrationPatterns(new String[0]);
            var current = config.load().info().current();
            var required = MigrationVersion.fromVersion("32");
            if (current == null || current.getVersion() == null || current.getVersion().compareTo(required) < 0) throw new IllegalStateException();
            var flyway = config.target(current.getVersion()).load(); flyway.validate();
            boolean hasV32 = false;
            for (var migration : flyway.info().all()) {
                if (migration.getVersion() != null && migration.getVersion().compareTo(current.getVersion()) <= 0) {
                    if (migration.getState() != MigrationState.SUCCESS) throw new IllegalStateException();
                    if (migration.getVersion().equals(required)) hasV32 = true;
                }
            }
            if (!hasV32) throw new IllegalStateException();
        } catch (RuntimeException exception) { throw failure("Apply and verify migrations through V32 separately before scope provisioning."); }
    }

    private static String text(JsonNode node, String key) {
        var value = node == null ? null : node.get(key);
        if (value == null || !value.isTextual() || value.asText().isBlank()) throw new IllegalArgumentException();
        return value.asText();
    }
    private static ProvisioningException failure(String message) { return new ProvisioningException(message); }
    private record Approval(SimulationScopeDefinitions.Definition definition, UUID mappingId) { }
    public record ScopeResult(UUID scopeId, String scopeCode, String action, UUID auditId) { }
    public record Result(UUID invocationId, List<ScopeResult> scopes) {
        public long created() { return scopes.stream().filter(s -> s.action().equals("CREATED")).count(); }
        public long verified() { return scopes.size() - created(); }
    }
    public static final class ProvisioningException extends RuntimeException {
        public ProvisioningException(String message) { super(message); }
    }
}
