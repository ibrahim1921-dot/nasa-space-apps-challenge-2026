package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.CaptureRegistrationRequest;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.provisioning.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.node.ObjectNode;
import javax.sql.DataSource;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Every command-helper invocation targets a per-test schema in disposable PostgreSQL 17. */
class SimulationScopeProvisioningTests extends SimulationIngestionTestSupport {
    private static final String PASSWORD = "Scope operator disposable test passphrase";
    @Autowired Environment environment;
    @Autowired PlatformTransactionManager transactions;
    @Autowired PasswordEncoder passwords;
    @Autowired ApplicationContext context;
    private String schema;
    private DataSource target;
    private JdbcTemplate fixtureJdbc;
    private DemoSimulationScopeProvisioner tool;
    private Fixture f;
    private String login;

    @BeforeEach void setup() { setupSchema(null); }

    private Flyway setupSchema(String version) {
        String url = environment.getRequiredProperty("spring.datasource.url");
        String user = environment.getRequiredProperty("spring.datasource.username");
        String password = environment.getRequiredProperty("spring.datasource.password");
        schema = "scope_provisioning_" + UUID.randomUUID().toString().replace("-", "");
        var config = Flyway.configure().dataSource(url, user, password).defaultSchema(schema).schemas(schema)
                .locations("classpath:db/migration").cleanDisabled(true);
        if (version != null) config.target(version);
        Flyway flyway = config.load(); flyway.migrate();
        target = new DriverManagerDataSource(url + (url.contains("?") ? "&" : "?") + "currentSchema=" + schema, user, password);
        fixtureJdbc = new JdbcTemplate(target);
        f = inSchema(this::fixture);
        login = inSchema(() -> {
            var account = accounts.findById(f.officer()).orElseThrow(); account.setPasswordHash(passwords.encode(PASSWORD));
            accounts.saveAndFlush(account); return account.getLoginName();
        });
        tool = new DemoSimulationScopeProvisioner(target, passwords, true, true, "development");
        return flyway;
    }
    private DemoSimulationScopeProvisioner.Result provision() { return tool.provision(f.capture(), login, PASSWORD.toCharArray()); }

    @Test
    void provisionsAllFiveFamiliesAndResolverIngestionRecognizeThemWithoutCreatingOtherData() {
        var seeded = fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes ORDER BY id");
        assertThat(seeded).hasSize(5);
        long accountCount = accountsInSchema(), astronautCount = astronautsInSchema();
        char[] buffer = PASSWORD.toCharArray();
        var result = tool.provision(f.capture(), login, buffer);
        assertThat(result.created()).isEqualTo(5); assertThat(result.verified()).isZero();
        assertThat(java.nio.CharBuffer.wrap(buffer).chars().allMatch(c -> c == 0)).isTrue();
        assertThat(fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes WHERE scope_code='default' ORDER BY id")).isEqualTo(seeded);
        assertThat(accountsInSchema()).isEqualTo(accountCount); assertThat(astronautsInSchema()).isEqualTo(astronautCount);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM personal_baselines", Integer.class)).isZero();
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM monitoring_rules", Integer.class)).isZero();
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM health_observations", Integer.class)).isZero();
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM simulation_scope_provisioning_audit WHERE actor_account_id=? "
                + "AND invocation_id=? AND action='CREATED' AND database_actor=session_user", Integer.class, f.officer(), result.invocationId())).isEqualTo(5);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM simulation_scope_provisioning_audit a JOIN measurement_comparison_scopes s ON s.id=a.scope_id "
                + "WHERE a.definition=to_jsonb(s)", Integer.class)).isEqualTo(5);
        inSchema(() -> {
            var capture = captures.findById(f.capture()).orElseThrow(); var mapping = mappings.findAllByCaptureId(f.capture()).get(0);
            for (var item : f.original().get("items")) assertThat(scopes.resolve(validator.validate(item.get("envelope")), capture, mapping)).isNotNull();
            var page = page(f); page.set("items", f.original().get("items"));
            assertThat(as(f.officer(), () -> ingestion.ingest(f.capture(), bytes(page))).created()).isEqualTo(13);
            return null;
        });
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(DISTINCT indicator_code) FROM health_observations", Integer.class)).isEqualTo(9);
        assertThat(context.getBeansOfType(DemoSimulationScopeProvisioner.class)).isEmpty();
        assertThat(context.getBeansOfType(DemoSimulationScopeProvisioningCommand.class)).isEmpty();
    }

    @Test
    void repeatedProvisioningReusesExactUuidsAndAddsVerifiedAuditEvents() {
        var first = provision(); var definitions = fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes ORDER BY id");
        var second = provision();
        assertThat(second.created()).isZero(); assertThat(second.verified()).isEqualTo(5);
        assertThat(second.scopes()).extracting(DemoSimulationScopeProvisioner.ScopeResult::scopeId)
                .containsExactlyElementsOf(first.scopes().stream().map(DemoSimulationScopeProvisioner.ScopeResult::scopeId).toList());
        assertThat(second.invocationId()).isNotEqualTo(first.invocationId());
        assertThat(fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes ORDER BY id")).isEqualTo(definitions);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM simulation_scope_provisioning_audit", Integer.class)).isEqualTo(10);
    }

    @Test
    void allFourDestinationsReceiveSeparateCaptureOwnedRadiationOrigins() {
        UUID otherCapture = inSchema(() -> {
            ObjectNode manifest = (ObjectNode) f.original().get("manifest").deepCopy();
            UUID run = UUID.randomUUID(); manifest.put("run_id", run.toString());
            var profiles = ((ObjectNode) manifest.get("configuration")).putArray("profiles");
            List<CaptureRegistrationRequest.ProfileMapping> approved = new ArrayList<>();
            for (int index = 1; index <= 4; index++) {
                String crew = "crew-0" + index, sourceCrew = "sim-crew-0" + index;
                if (index > 1) astronauts.saveAndFlush(new Astronaut(crew, "Disposable additional demo profile"));
                ObjectNode source = (ObjectNode) f.original().get("manifest").get("configuration").get("profiles").get(0).deepCopy();
                UUID id = UUID.randomUUID(); source.put("astronaut_id", id.toString()); source.put("crew_code", sourceCrew); profiles.add(source);
                approved.add(new CaptureRegistrationRequest.ProfileMapping(id, sourceCrew, crew));
            }
            var request = new CaptureRegistrationRequest(UUID.randomUUID(), UUID.randomUUID(), run,
                    json.treeToValue(manifest, CaptureRegistrationRequest.RunManifest.class), approved);
            return as(f.officer(), () -> registration.register(request).capture().captureId());
        });
        var result = tool.provision(otherCapture, login, PASSWORD.toCharArray());
        assertThat(result.created()).isEqualTo(8);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(DISTINCT radiation_astronaut_id) FROM measurement_comparison_scopes "
                + "WHERE scope_code LIKE ?", Integer.class, "simulation-capture-" + otherCapture + "-%")).isEqualTo(4);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM simulation_scope_provisioning_audit WHERE capture_id=? AND profile_mapping_id IS NOT NULL",
                Integer.class, otherCapture)).isEqualTo(4);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM measurement_comparison_scopes WHERE scope_code LIKE ?", Integer.class,
                "simulation-capture-" + f.capture() + "-%")).isZero();
        var independent = provision();
        assertThat(independent.created()).isEqualTo(1); assertThat(independent.verified()).isEqualTo(4);
    }

    @ParameterizedTest
    @ValueSource(strings={"draft", "origin", "synthetic", "mapping_snapshot"})
    void incompleteOrInvalidCapturePrerequisitesCannotCreateScopes(String problem) {
        ObjectNode manifest = (ObjectNode) json.readTree(fixtureJdbc.queryForObject("SELECT manifest::text FROM simulation_captures WHERE id=?", String.class, f.capture()));
        if (problem.equals("origin")) ((ObjectNode) manifest.get("run_manifest").get("configuration")).put("start_at", "invalid-time");
        if (problem.equals("synthetic")) ((ObjectNode) manifest.get("run_manifest")).put("synthetic", false);
        if (problem.equals("mapping_snapshot")) manifest.putArray("mappings");
        UUID capture = fixtureJdbc.queryForObject("INSERT INTO simulation_captures(workspace_id,engine_run_id,created_by_account_id,manifest) "
                + "SELECT workspace_id,engine_run_id,created_by_account_id,CAST(? AS jsonb) FROM simulation_captures WHERE id=? RETURNING id", UUID.class,
                json.writeValueAsString(manifest), f.capture());
        if (!problem.equals("draft")) {
            fixtureJdbc.update("INSERT INTO simulation_profile_mappings(capture_id,simulation_astronaut_id,simulation_crew_code,astronaut_id,target_crew_code) "
                    + "SELECT ?,simulation_astronaut_id,simulation_crew_code,astronaut_id,target_crew_code FROM simulation_profile_mappings WHERE capture_id=?", capture, f.capture());
            fixtureJdbc.update("UPDATE simulation_captures SET status='ACTIVE',activated_at=GREATEST(CURRENT_TIMESTAMP,created_at),version=version+1 WHERE id=?", capture);
        }
        assertThatThrownBy(() -> tool.provision(capture, login, PASSWORD.toCharArray())).isInstanceOf(DemoSimulationScopeProvisioner.ProvisioningException.class);
        assertThat(scopeCount()).isEqualTo(5); assertThat(audits()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings={"mood", "muscle:grip_strength", "muscle:muscle_mass", "bone_mineral_density"})
    void staticConflictsAreRejectedAndEarlierScopeAndAuditInsertsRollBack(String family) {
        String[] names = family.split(":");
        String metric = names.length > 1 ? names[1] : names[0].equals("mood") ? "score" : "areal_density";
        var definition = SimulationScopeDefinitions.forMetric(names[0], metric).orElseThrow();
        var wrong = new HashMap<>(definition.scope()); wrong.put(names[0].equals("mood") ? "scale_version" : "protocol_version", "wrong");
        inSchema(() -> { insertScope(wrong); return null; });
        var before = fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes ORDER BY id");
        assertThatThrownBy(this::provision).isInstanceOf(DemoSimulationScopeProvisioner.ProvisioningException.class).hasMessageContaining("conflicts");
        assertThat(fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes ORDER BY id")).isEqualTo(before);
        assertThat(audits()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings={"owner", "origin", "method"})
    void captureSpecificRadiationConflictsAndCrossAstronautOwnershipAreRejected(String conflict) {
        Instant origin = Instant.parse(f.original().get("manifest").get("configuration").get("start_at").asText());
        var wrong = new HashMap<>(SimulationScopeDefinitions.radiation(f.capture(), f.astronaut(), origin).scope());
        if (conflict.equals("owner")) {
            UUID other = fixtureJdbc.queryForObject("INSERT INTO astronauts(crew_code,display_name) VALUES ('crew-02','Disposable other profile') RETURNING id", UUID.class);
            wrong.put("radiation_astronaut_id", other.toString());
        } else if (conflict.equals("origin")) wrong.put("accumulation_started_at", origin.plusSeconds(3600).toString());
        else wrong.put("dosimetry_method", "UNAPPROVED_METHOD");
        inSchema(() -> { insertScope(wrong); return null; });
        assertThatThrownBy(this::provision).isInstanceOf(DemoSimulationScopeProvisioner.ProvisioningException.class);
        assertThat(scopeCount()).isEqualTo(6); assertThat(audits()).isZero();
        assertThatThrownBy(() -> inSchema(() -> scopes.resolve(validator.validate(item(f, SimulationEnvelopeValidator.RADIATION).get("envelope")),
                captures.findById(f.capture()).orElseThrow(), mappings.findAllByCaptureId(f.capture()).get(0))))
                .isInstanceOf(SimulationIngestionException.class).hasMessage("scope_definition_conflict");
        if (conflict.equals("owner")) {
            assertThatThrownBy(() -> fixtureJdbc.update("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,measured_at,source_kind,source_name,simulation_metadata) "
                    + "SELECT ?,indicator_code,storage_kind,id,CURRENT_TIMESTAMP,'SIMULATION','Disposable ownership rejection','{}'::jsonb "
                    + "FROM measurement_comparison_scopes WHERE scope_code=?", f.astronaut(), wrong.get("scope_code")))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    @ParameterizedTest
    @ValueSource(strings={"bad_password", "disabled", "astronaut", "other_officer", "missing_capture", "archived", "closed", "missing_officer"})
    void prerequisitesAreRequiredAndNothingIsAutomaticallyCreated(String missing) {
        UUID capture = f.capture(); String actor = login; char[] password = PASSWORD.toCharArray();
        switch (missing) {
            case "bad_password" -> password = "Incorrect disposable passphrase".toCharArray();
            case "disabled" -> fixtureJdbc.update("UPDATE accounts SET enabled=FALSE WHERE id=?", f.officer());
            case "astronaut", "other_officer" -> {
                actor = "scope." + UUID.randomUUID();
                fixtureJdbc.update("INSERT INTO accounts(login_name,password_hash,role,astronaut_id) VALUES (?,?,?,?)", actor,
                        passwords.encode(PASSWORD), missing.equals("astronaut") ? "ASTRONAUT" : "NASA_OFFICER", missing.equals("astronaut") ? f.astronaut() : null);
            }
            case "missing_capture" -> capture = UUID.randomUUID();
            case "archived" -> fixtureJdbc.update("UPDATE astronauts SET archived_at=CURRENT_TIMESTAMP WHERE id=?", f.astronaut());
            case "closed" -> inSchema(() -> as(f.officer(), () -> registration.close(f.capture(), f.workspace(), captures.findById(f.capture()).orElseThrow().getEngineRunId())));
            case "missing_officer" -> actor = "missing.officer";
        }
        long profiles = astronautsInSchema(), accounts = accountsInSchema();
        UUID selected = capture; String selectedActor = actor; char[] buffer = password;
        assertThatThrownBy(() -> tool.provision(selected, selectedActor, buffer)).isInstanceOf(DemoSimulationScopeProvisioner.ProvisioningException.class);
        assertThat(java.nio.CharBuffer.wrap(buffer).chars().allMatch(c -> c == 0)).isTrue();
        assertThat(scopeCount()).isEqualTo(5); assertThat(audits()).isZero();
        assertThat(astronautsInSchema()).isEqualTo(profiles); assertThat(accountsInSchema()).isEqualTo(accounts);
    }

    @Test
    void directHelperRequiresBothOptInsAndDevelopmentMode() {
        for (var values : List.of(List.of(false, true, "development"), List.of(true, false, "development"),
                List.of(true, true, "production"), List.of(true, true, "demo"))) {
            var guarded = new DemoSimulationScopeProvisioner(target, passwords, (Boolean)values.get(0), (Boolean)values.get(1), values.get(2).toString());
            char[] buffer = PASSWORD.toCharArray();
            assertThatThrownBy(() -> guarded.provision(f.capture(), login, buffer)).isInstanceOf(DemoSimulationScopeProvisioner.ProvisioningException.class);
            assertThat(java.nio.CharBuffer.wrap(buffer).chars().allMatch(c -> c == 0)).isTrue();
        }
        assertThat(scopeCount()).isEqualTo(5); assertThat(audits()).isZero();
    }

    @Test
    void auditsAreAppendOnlyAndRejectForgedApproversAndSnapshots() {
        provision();
        for (String sql : List.of("UPDATE simulation_scope_provisioning_audit SET action='VERIFIED'", "DELETE FROM simulation_scope_provisioning_audit",
                "TRUNCATE simulation_scope_provisioning_audit")) {
            assertThatThrownBy(() -> fixtureJdbc.execute(sql)).isInstanceOf(DataIntegrityViolationException.class);
        }
        UUID other = fixtureJdbc.queryForObject("INSERT INTO accounts(login_name,password_hash,role) VALUES ('other.officer',?,'NASA_OFFICER') RETURNING id", UUID.class, HASH);
        for (String corruption : List.of("actor_account_id", "definition")) {
            String actor = corruption.equals("actor_account_id") ? "CAST(? AS uuid)" : "actor_account_id";
            String snapshot = corruption.equals("definition") ? "'{}'::jsonb" : "definition";
            String sql = "INSERT INTO simulation_scope_provisioning_audit(invocation_id,capture_id,actor_account_id,profile_mapping_id,scope_id,indicator_code,metric_code,unit,action,definition_version,definition) "
                    + "SELECT gen_random_uuid(),capture_id," + actor + ",profile_mapping_id,scope_id,indicator_code,metric_code,unit,action,definition_version," + snapshot + " FROM simulation_scope_provisioning_audit LIMIT 1";
            assertThatThrownBy(() -> { if (corruption.equals("actor_account_id")) fixtureJdbc.update(sql, other); else fixtureJdbc.execute(sql); })
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThat(audits()).isEqualTo(5);
    }

    @Test
    void concurrentRetriesCreateScopesOnceAndAuditBothSuccessfulInvocations() throws Exception {
        var pool = Executors.newFixedThreadPool(2); var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        try {
            Callable<DemoSimulationScopeProvisioner.Result> call = () -> {
                ready.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Race did not start");
                return provision();
            };
            var a = pool.submit(call); var b = pool.submit(call);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); start.countDown();
            var first = a.get(30, TimeUnit.SECONDS); var second = b.get(30, TimeUnit.SECONDS);
            assertThat(first.created() + second.created()).isEqualTo(5); assertThat(first.verified() + second.verified()).isEqualTo(5);
            assertThat(scopeCount()).isEqualTo(10); assertThat(audits()).isEqualTo(10);
        } finally { start.countDown(); pool.shutdownNow(); }
    }

    @Test
    void v31UpgradeAddsAuditInfrastructureWithoutSeedingScopesAndOldStateCannotProvision() {
        var v31 = setupSchema("31");
        var before = fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes ORDER BY id");
        assertThatThrownBy(this::provision).isInstanceOf(DemoSimulationScopeProvisioner.ProvisioningException.class).hasMessageContaining("V32");
        var upgraded = Flyway.configure().configuration(v31.getConfiguration()).target("latest").load();
        upgraded.migrate(); upgraded.validate();
        assertThat(fixtureJdbc.queryForList("SELECT * FROM measurement_comparison_scopes ORDER BY id")).isEqualTo(before);
        assertThat(audits()).isZero(); assertThat(astronautsInSchema()).isEqualTo(1); assertThat(accountsInSchema()).isEqualTo(1);
        assertThat(provision().created()).isEqualTo(5);
    }

    @ParameterizedTest
    @ValueSource(strings={"UPDATE flyway_schema_history SET success=FALSE WHERE version='32'",
            "UPDATE flyway_schema_history SET checksum=checksum+1 WHERE version='32'",
            "DELETE FROM flyway_schema_history WHERE version='31'",
            "UPDATE flyway_schema_history SET version='999' WHERE version='32'"})
    void invalidMigrationStatesFailClosedWithoutAnyScopeOrAuditWrites(String corruption) {
        fixtureJdbc.execute(corruption);
        assertThatThrownBy(this::provision).isInstanceOf(DemoSimulationScopeProvisioner.ProvisioningException.class).hasMessageContaining("V32");
        assertThat(scopeCount()).isEqualTo(5); assertThat(audits()).isZero();
    }

    private int scopeCount() { return fixtureJdbc.queryForObject("SELECT COUNT(*) FROM measurement_comparison_scopes", Integer.class); }
    private int audits() { return fixtureJdbc.queryForObject("SELECT COUNT(*) FROM simulation_scope_provisioning_audit", Integer.class); }
    private long accountsInSchema() { return fixtureJdbc.queryForObject("SELECT COUNT(*) FROM accounts", Long.class); }
    private long astronautsInSchema() { return fixtureJdbc.queryForObject("SELECT COUNT(*) FROM astronauts", Long.class); }
    private <T> T inSchema(Callable<T> action) {
        return new TransactionTemplate(transactions).execute(status -> {
            jdbc.execute("SET LOCAL search_path TO " + schema); // Locally generated UUID-based schema, reset at transaction end.
            try { return action.call(); } catch (RuntimeException exception) { throw exception; } catch (Exception exception) { throw new IllegalStateException(exception); }
        });
    }
}
