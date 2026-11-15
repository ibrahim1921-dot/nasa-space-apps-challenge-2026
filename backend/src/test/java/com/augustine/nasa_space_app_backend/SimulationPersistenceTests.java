package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import jakarta.persistence.EntityManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;

/** All fixtures live in the disposable PostgreSQL 17 container, never the development database. */
class SimulationPersistenceTests extends PostgreSqlIntegrationTest {
    private static final String HASH = "a".repeat(64);
    private static final String INERT_PASSWORD_HASH = "$2a$12$" + "a".repeat(53);
    @Autowired DataSource dataSource;
    @Autowired Environment environment;
    @Autowired SimulationCaptureRepository captures;
    @Autowired SimulationProfileMappingRepository mappings;
    @Autowired SimulationIngestionReceiptRepository receipts;
    @Autowired AstronautRepository astronauts;
    @Autowired AccountRepository accounts;
    @Autowired EntityManager entityManager;

    @Test
    @Transactional
    void jpaMappingsDefaultsQueriesAndLifecycleRoundTrip() {
        Astronaut destination = astronauts.saveAndFlush(new Astronaut("crew-01", "Fictional fixture"));
        Account officer = accounts.saveAndFlush(new Account("capture.jpa", INERT_PASSWORD_HASH, AccountRole.NASA_OFFICER, null));
        UUID workspace = UUID.randomUUID(), run = UUID.randomUUID(), fictional = UUID.randomUUID();
        SimulationCapture capture = captures.saveAndFlush(new SimulationCapture(workspace, run, officer.getId(),
                Map.of("schema_version", "astrohealth.simulation.run.v1", "synthetic", true)));
        SimulationProfileMapping mapping = mappings.saveAndFlush(new SimulationProfileMapping(capture.getId(),
                fictional, "sim-crew-01", destination.getId(), "crew-01"));
        assertThat(mapping.getId()).isNotNull();
        assertThat(mapping.getCreatedAt()).isNotNull();
        capture.activate(Instant.now().truncatedTo(ChronoUnit.MICROS));
        captures.flush();
        UUID observation = entityManager.unwrap(org.hibernate.Session.class).doReturningWork(c ->
                observation(c, capture.getId(), destination.getId(), "jpa-record", true));
        SimulationIngestionReceipt receipt = receipts.saveAndFlush(new SimulationIngestionReceipt(capture.getId(),
                mapping.getId(), destination.getId(), "jpa-record", 1L, HASH, "test-canonical-v1", observation));
        entityManager.clear();
        SimulationCapture loaded = captures.findLockedById(capture.getId()).orElseThrow();
        assertThat(loaded.getStatus()).isEqualTo(SimulationCaptureStatus.ACTIVE);
        assertThat(loaded.getWorkspaceId()).isEqualTo(workspace);
        assertThat(loaded.getEngineRunId()).isEqualTo(run);
        assertThat(loaded.getCreatedByAccountId()).isEqualTo(officer.getId());
        assertThat(loaded.getManifest()).containsEntry("synthetic", true);
        assertThat(loaded.getCreatedAt()).isNotNull();
        assertThat(loaded.getVersion()).isEqualTo(1L);
        assertThat(captures.findAllByWorkspaceIdAndEngineRunId(workspace, run)).hasSize(1);
        assertThat(mappings.findAllByCaptureId(capture.getId())).hasSize(1);
        assertThat(mappings.findByCaptureIdAndSimulationAstronautId(capture.getId(), fictional))
                .get().extracting(SimulationProfileMapping::getAstronautId).isEqualTo(destination.getId());
        SimulationIngestionReceipt saved = receipts.findByCaptureIdAndSourceRecordId(capture.getId(), "jpa-record").orElseThrow();
        assertThat(saved.getId()).isEqualTo(receipt.getId());
        assertThat(saved.getObservationId()).isEqualTo(observation);
        assertThat(saved.getPayloadSha256()).isEqualTo(HASH);
        assertThat(saved.getCanonicalizationVersion()).isEqualTo("test-canonical-v1");
        assertThat(saved.getExportSequence()).isEqualTo(1L);
        assertThat(saved.getCreatedAt()).isNotNull();
        loaded.close(Instant.now().truncatedTo(ChronoUnit.MICROS));
        captures.flush();
        entityManager.clear();
        assertThat(captures.findById(capture.getId()).orElseThrow().getStatus()).isEqualTo(SimulationCaptureStatus.CLOSED);
        entityManager.unwrap(org.hibernate.Session.class).doWork(c -> execute(c, "SET CONSTRAINTS ALL IMMEDIATE"));
    }

    @Test
    void mappingRequiresExistingActiveAllowlistedDestinationAndOfficer() throws Exception {
        inRollback(c -> {
            Fixture f = fixture(c);
            UUID ordinary = astronaut(c, "not-a-demo");
            UUID nonOfficer = id(c, "INSERT INTO accounts(login_name,password_hash,role,astronaut_id) VALUES (?,?, 'ASTRONAUT', ?) RETURNING id",
                    "capture.astronaut", INERT_PASSWORD_HASH, ordinary);
            expect(c, "23514", () -> capture(c, nonOfficer));
            execute(c, "UPDATE accounts SET enabled = FALSE WHERE id = ?", f.officer());
            expect(c, "23514", () -> capture(c, f.officer()));
            expect(c, "23514", () -> mapping(c, f.capture(), ordinary, "crew-01"));
            expect(c, "23514", () -> mapping(c, f.capture(), UUID.randomUUID(), "crew-02"));
            expect(c, "23514", () -> mapping(c, f.capture(), f.astronaut(), "not-a-demo"));
            execute(c, "UPDATE astronauts SET archived_at = CURRENT_TIMESTAMP WHERE id = ?", f.astronaut());
            expect(c, "23514", () -> mapping(c, f.capture(), f.astronaut(), "crew-01"));
        });
    }

    @Test
    void mappingsAreOneToOneImmutableAndSealedBeforeUse() throws Exception {
        inRollback(c -> {
            Fixture f = fixture(c);
            expect(c, "23514", () -> activate(c, f.capture())); // no approved mapping
            UUID mapping = mapping(c, f.capture(), f.astronaut(), "crew-01");
            expect(c, "23505", () -> mapping(c, f.capture(), f.astronaut(), "crew-01"));
            expect(c, "23514", () -> execute(c, "UPDATE simulation_profile_mappings SET simulation_crew_code='changed' WHERE id=?", mapping));
            expect(c, "23514", () -> execute(c, "DELETE FROM simulation_profile_mappings WHERE id=?", mapping));
            activate(c, f.capture());
            expect(c, "23514", () -> mapping(c, f.capture(), f.astronaut(), "crew-01"));
            expect(c, "23514", () -> execute(c, "UPDATE simulation_captures SET workspace_id=? WHERE id=?", UUID.randomUUID(), f.capture()));
            expect(c, "23514", () -> execute(c, "UPDATE simulation_captures SET status='DRAFT',activated_at=NULL WHERE id=?", f.capture()));
        });
    }

    @Test
    void receiptsDistinguishRetriesAndConflictsWithoutBlockingIndependentCaptures() throws Exception {
        inRollback(c -> {
            Fixture f = fixture(c);
            UUID mapping = mapping(c, f.capture(), f.astronaut(), "crew-01");
            activate(c, f.capture());
            UUID observation = observation(c, f.capture(), f.astronaut(), "same-source", true);
            receipt(c, f.capture(), mapping, f.astronaut(), observation, "same-source", HASH, 1);
            UUID attemptedDuplicate = observation(c, f.capture(), f.astronaut(), "same-source", true);
            // Both identical and conflicting retries hit the same unique key: service reads/comparisons decide outcome.
            // Distinct observation/sequence ensures the source-key constraint itself is exercised.
            expect(c, "23505", () -> receipt(c, f.capture(), mapping, f.astronaut(), attemptedDuplicate, "same-source", HASH, 2));
            expect(c, "23505", () -> receipt(c, f.capture(), mapping, f.astronaut(), attemptedDuplicate, "same-source", "b".repeat(64), 2));
            UUID independent = id(c, "INSERT INTO simulation_captures(workspace_id,engine_run_id,created_by_account_id,manifest) "
                    + "SELECT workspace_id,engine_run_id,created_by_account_id,manifest FROM simulation_captures WHERE id=? RETURNING id", f.capture());
            UUID secondMapping = mapping(c, independent, f.astronaut(), "crew-01");
            activate(c, independent);
            UUID secondObservation = observation(c, independent, f.astronaut(), "same-source", true);
            receipt(c, independent, secondMapping, f.astronaut(), secondObservation, "same-source", HASH, 1);
            expect(c, "23514", () -> execute(c, "UPDATE simulation_ingestion_receipts SET payload_sha256=? WHERE capture_id=?", "b".repeat(64), f.capture()));
            expect(c, "23514", () -> execute(c, "DELETE FROM simulation_ingestion_receipts WHERE capture_id=?", f.capture()));
            execute(c, "SET CONSTRAINTS ALL IMMEDIATE");
        });
    }

    @Test
    void receiptRejectsWrongOwnerRunWorkspaceSourceHashSequenceAndTerminalCapture() throws Exception {
        inRollback(c -> {
            Fixture f = fixture(c);
            UUID mapping = mapping(c, f.capture(), f.astronaut(), "crew-01");
            UUID observation = observation(c, f.capture(), f.astronaut(), "record", true);
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), observation, "record", HASH, 1));
            activate(c, f.capture());
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), observation, "wrong-record", HASH, 1));
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, UUID.randomUUID(), observation, "record", HASH, 1));
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), observation, "record", "not-a-hash", 1));
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), observation, "record", HASH, 0));
            UUID wrongCapture = capture(c, f.officer());
            UUID wrongObservation = observation(c, wrongCapture, f.astronaut(), "record", true);
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), wrongObservation, "record", HASH, 1));
            UUID realObservation = observation(c, f.capture(), f.astronaut(), "real", false);
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), realObservation, "real", HASH, 1));
            UUID second = astronaut(c, "crew-02");
            UUID secondCapture = capture(c, f.officer());
            UUID otherMapping = mapping(c, secondCapture, second, "crew-02");
            expect(c, "23503", () -> receipt(c, f.capture(), otherMapping, f.astronaut(), observation, "record", HASH, 1));
            execute(c, "UPDATE simulation_captures SET status='CLOSED',closed_at=CURRENT_TIMESTAMP WHERE id=?", f.capture());
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), observation, "record", HASH, 1));
            expect(c, "23514", () -> execute(c, "DELETE FROM simulation_captures WHERE id=?", f.capture()));
        });
    }

    @Test
    void failedReceiptRollsBackObservation() throws Exception {
        inRollback(c -> {
            Fixture f = fixture(c);
            UUID mapping = mapping(c, f.capture(), f.astronaut(), "crew-01");
            activate(c, f.capture());
            Savepoint before = c.setSavepoint();
            UUID observation = observation(c, f.capture(), f.astronaut(), "rollback", true);
            expect(c, "23514", () -> receipt(c, f.capture(), mapping, f.astronaut(), observation, "rollback", "invalid", 1));
            c.rollback(before); // Future service must roll back the complete header/subtype/receipt transaction.
            try (PreparedStatement s = prepare(c, "SELECT count(*) FROM health_observations WHERE id=?", observation);
                 ResultSet rs = s.executeQuery()) {
                rs.next();
                assertThat(rs.getInt(1)).isZero();
            }
        });
    }

    @Test
    void allFourIntendedDemoCrewCodesCanBeMappedWithoutCreatingAccounts() throws Exception {
        inRollback(c -> {
            UUID capture = capture(c, officer(c));
            for (String code : java.util.List.of("crew-01", "crew-02", "crew-03", "crew-04")) {
                UUID destination = astronaut(c, code);
                assertThat(mapping(c, capture, destination, code)).isNotNull();
            }
            activate(c, capture);
        });
    }

    @Test
    void receiptCannotCommitAnIncompleteObservation() throws Exception {
        inRollback(c -> {
            Fixture f = fixture(c);
            UUID mapping = mapping(c, f.capture(), f.astronaut(), "crew-01");
            activate(c, f.capture());
            UUID header = id(c, "INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,measured_at,source_kind,source_name,source_record_id,simulation_metadata) "
                    + "SELECT ?, 'heart_rate','SCALAR',s.id,CURRENT_TIMESTAMP,'SIMULATION','Incomplete fixture','incomplete', "
                    + "jsonb_build_object('run_id',cap.engine_run_id::text,'workspace_id',cap.workspace_id::text) "
                    + "FROM simulation_captures cap CROSS JOIN measurement_comparison_scopes s "
                    + "WHERE cap.id=? AND s.indicator_code='heart_rate' AND s.scope_code='default' RETURNING health_observations.id",
                    f.astronaut(), f.capture());
            receipt(c, f.capture(), mapping, f.astronaut(), header, "incomplete", HASH, 1);
            expect(c, "23514", () -> execute(c, "SET CONSTRAINTS ALL IMMEDIATE"));
        });
    }

    @Test
    void v30UpgradesAdditivelyAndConcurrentDuplicateReceiptsHaveOneWinner() throws Exception {
        // Dedicated schema in the Testcontainer prevents committed concurrency fixtures from affecting other tests.
        String url, user;
        try (Connection c = dataSource.getConnection()) {
            url = c.getMetaData().getURL(); user = c.getMetaData().getUserName();
        }
        Flyway old = Flyway.configure().dataSource(url, user, environment.getRequiredProperty("spring.datasource.password"))
                .schemas("simulation_upgrade").defaultSchema("simulation_upgrade")
                .target("30").cleanDisabled(true).load();
        old.migrate();
        UUID destination;
        try (Connection c = dataSource.getConnection()) {
            destination = id(c, "INSERT INTO simulation_upgrade.astronauts(crew_code,display_name) VALUES ('crew-04','Existing fictional fixture') RETURNING id");
        }
        // This test verifies the additive V31 foundation independently of later migrations.
        Flyway latest = Flyway.configure().configuration(old.getConfiguration()).target("31").load();
        assertThat(latest.migrate().migrationsExecuted).isEqualTo(1);
        latest.validate();
        UUID capture, mapping, observation, competingObservation;
        try (Connection c = connectionInUpgradeSchema()) {
            UUID officer = officer(c);
            capture = capture(c, officer);
            mapping = mapping(c, capture, destination, "crew-04");
            activate(c, capture);
            c.setAutoCommit(false);
            observation = observation(c, capture, destination, "concurrent", true);
            competingObservation = observation(c, capture, destination, "concurrent", true);
            c.commit(); // Includes V25 deferred validation; only disposable test schema is committed.
        }
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger ticket = new java.util.concurrent.atomic.AtomicInteger();
        Callable<String> attempt = () -> {
            int index = ticket.getAndIncrement();
            start.await(10, TimeUnit.SECONDS);
            try (Connection c = connectionInUpgradeSchema()) {
                c.setAutoCommit(false);
                try {
                    execute(c, "SET LOCAL lock_timeout='5s'");
                    receipt(c, capture, mapping, destination, index == 0 ? observation : competingObservation,
                            "concurrent", HASH, index + 1L);
                    c.commit(); return "inserted";
                } catch (SQLException e) {
                    c.rollback(); return e.getSQLState();
                }
            }
        };
        try {
            Future<String> first = pool.submit(attempt), second = pool.submit(attempt);
            start.countDown();
            assertThat(java.util.List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("inserted", "23505");
        } finally { pool.shutdownNow(); }
    }

    private Connection connectionInUpgradeSchema() throws SQLException {
        // Independent connections avoid leaking search_path into the application pool.
        try (Connection pooled = dataSource.getConnection()) {
            Connection c = DriverManager.getConnection(pooled.getMetaData().getURL(), pooled.getMetaData().getUserName(),
                    environment.getRequiredProperty("spring.datasource.password"));
            c.setSchema("simulation_upgrade");
            return c;
        }
    }

    private Fixture fixture(Connection c) throws SQLException {
        UUID astronaut = astronaut(c, "crew-01"), officer = officer(c);
        return new Fixture(astronaut, officer, capture(c, officer));
    }
    private UUID astronaut(Connection c, String code) throws SQLException {
        return id(c, "INSERT INTO astronauts(crew_code,display_name) VALUES (?, 'Fictional test only') RETURNING id", code);
    }
    private UUID officer(Connection c) throws SQLException {
        return id(c, "INSERT INTO accounts(login_name,password_hash,role) VALUES (?,?,'NASA_OFFICER') RETURNING id",
                "test." + UUID.randomUUID(), INERT_PASSWORD_HASH);
    }
    private UUID capture(Connection c, UUID officer) throws SQLException {
        return id(c, "INSERT INTO simulation_captures(workspace_id,engine_run_id,created_by_account_id,manifest) VALUES (?,?,?,'{}') RETURNING id",
                UUID.randomUUID(), UUID.randomUUID(), officer);
    }
    private UUID mapping(Connection c, UUID capture, UUID astronaut, String crewCode) throws SQLException {
        return id(c, "INSERT INTO simulation_profile_mappings(capture_id,simulation_astronaut_id,simulation_crew_code,astronaut_id,target_crew_code) VALUES (?,?,?,?,?) RETURNING id",
                capture, UUID.randomUUID(), "sim-" + UUID.randomUUID(), astronaut, crewCode);
    }
    private void activate(Connection c, UUID capture) throws SQLException {
        execute(c, "UPDATE simulation_captures SET status='ACTIVE',activated_at=CURRENT_TIMESTAMP WHERE id=?", capture);
    }
    private UUID observation(Connection c, UUID capture, UUID astronaut, String source, boolean synthetic) throws SQLException {
        UUID observation = id(c, "INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,measured_at,source_kind,source_name,source_record_id,simulation_metadata) "
                + "SELECT ?, 'heart_rate','SCALAR',s.id,CURRENT_TIMESTAMP,?,'Persistence fixture',?, "
                + "CASE WHEN ? THEN jsonb_build_object('run_id', cap.engine_run_id::text,'workspace_id',cap.workspace_id::text) ELSE NULL END "
                + "FROM simulation_captures cap CROSS JOIN measurement_comparison_scopes s WHERE cap.id=? AND s.indicator_code='heart_rate' AND s.scope_code='default' RETURNING health_observations.id",
                astronaut, synthetic ? "SIMULATION" : "DEVICE", source, synthetic, capture);
        execute(c, "INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',64,'beats/min')", observation);
        return observation;
    }
    private UUID receipt(Connection c, UUID capture, UUID mapping, UUID astronaut, UUID observation,
                         String source, String hash, long sequence) throws SQLException {
        return id(c, "INSERT INTO simulation_ingestion_receipts(capture_id,profile_mapping_id,astronaut_id,source_record_id,export_sequence,payload_sha256,canonicalization_version,observation_id) VALUES (?,?,?,?,?,?,'test-canonical-v1',?) RETURNING id",
                capture, mapping, astronaut, source, sequence, hash, observation);
    }
    private void inRollback(SqlWork work) throws Exception {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try { work.run(c); } finally { c.rollback(); }
        }
    }
    private void expect(Connection c, String state, SqlAction action) throws SQLException {
        Savepoint savepoint = c.setSavepoint();
        String actual = null;
        try { action.run(); } catch (SQLException e) { actual = e.getSQLState(); }
        finally { c.rollback(savepoint); c.releaseSavepoint(savepoint); }
        assertThat(actual).isEqualTo(state);
    }
    private UUID id(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement s = prepare(c, sql, args); ResultSet rs = s.executeQuery()) {
            rs.next(); return rs.getObject(1, UUID.class);
        }
    }
    private void execute(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement s = prepare(c, sql, args)) { s.execute(); }
    }
    private PreparedStatement prepare(Connection c, String sql, Object... args) throws SQLException {
        PreparedStatement s = c.prepareStatement(sql);
        for (int i = 0; i < args.length; i++) s.setObject(i + 1, args[i]);
        return s;
    }
    private record Fixture(UUID astronaut, UUID officer, UUID capture) { }
    @FunctionalInterface private interface SqlWork { void run(Connection c) throws Exception; }
    @FunctionalInterface private interface SqlAction { void run() throws SQLException; }
}
