package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.Account;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.entity.Astronaut;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.repository.AstronautRepository;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import com.augustine.nasa_space_app_backend.service.AstronautNotFoundException;
import com.augustine.nasa_space_app_backend.service.AstronautService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;

/** Direct service calls deliberately bypass the servlet security filter. */
@Transactional
class AstronautServiceTests extends PostgreSqlIntegrationTest {
    private static final String INERT_TEST_HASH = "$2a$12$" + "a".repeat(53);
    @Autowired private AstronautService service;
    @Autowired private AstronautRepository astronauts;
    @Autowired private AccountRepository accounts;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;

    @AfterEach
    void clearIdentity() { SecurityContextHolder.clearContext(); }

    @Test
    void astronautReadsOwnProfileAndOnlySafeActiveRoster() {
        Astronaut own = profile();
        Astronaut other = profile();
        Astronaut archived = profile();
        archived.setArchivedAt(Instant.now());
        astronauts.flush();
        signIn(account(own));
        assertThat(service.getMyProfile().astronautId()).isEqualTo(own.getId());
        assertThat(service.getAstronautById(own.getId()).crewCode()).isEqualTo(own.getCrewCode());
        assertThat(service.getAstronautByCrewCode(own.getCrewCode()).astronautId()).isEqualTo(own.getId());
        var roster = service.getAllActiveAstronauts();
        assertThat(roster.stream().map(value -> value.astronautId()).toList())
                .contains(own.getId(), other.getId()).doesNotContain(archived.getId());
        assertThat(roster.stream().map(value -> value.crewCode()).toList()).isSorted();
    }

    @Test
    void astronautCannotReadOthersOrPerformOfficerWritesEvenWithForgedAuthorities() {
        Astronaut own = profile();
        Astronaut other = profile();
        Account caller = account(own);
        // A cached/forged role authority must never override the current persisted account role.
        signIn(caller, "NASA_OFFICER");
        assertThatThrownBy(() -> service.getAstronautById(other.getId())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.getAstronautByCrewCode(other.getCrewCode())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.getAstronautById(UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.archiveAstronaut(own.getId())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.reactivateAstronaut(other.getId())).isInstanceOf(AccessDeniedException.class);
        assertThat(astronauts.findById(own.getId()).orElseThrow().getArchivedAt()).isNull();
    }

    @Test
    void officerReadsArchivedProfilesAndReceivesClearMissingRecordErrors() {
        Astronaut archived = profile();
        archived.setArchivedAt(Instant.now());
        astronauts.flush();
        signIn(officer());
        assertThat(service.getAstronautById(archived.getId()).archivedAt()).isNotNull();
        assertThat(service.getAstronautByCrewCode(archived.getCrewCode()).astronautId()).isEqualTo(archived.getId());
        assertThatThrownBy(service::getMyProfile).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.getAstronautById(UUID.randomUUID())).isInstanceOf(AstronautNotFoundException.class);
        assertThatThrownBy(() -> service.getAstronautByCrewCode("missing-" + UUID.randomUUID())).isInstanceOf(AstronautNotFoundException.class);
        assertThatThrownBy(() -> service.archiveAstronaut(UUID.randomUUID())).isInstanceOf(AstronautNotFoundException.class);
        assertThatThrownBy(() -> service.reactivateAstronaut(UUID.randomUUID())).isInstanceOf(AstronautNotFoundException.class);
    }

    @Test
    void unauthenticatedServiceCallsAreDeniedForEveryOperation() {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(service::getAllActiveAstronauts).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(service::getMyProfile).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> service.getAstronautById(UUID.randomUUID())).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> service.getAstronautByCrewCode("crew-01")).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> service.archiveAstronaut(UUID.randomUUID())).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> service.reactivateAstronaut(UUID.randomUUID())).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
    }

    @Test
    void directServiceCallsRecheckArchiveAndDisabledStatus() {
        Astronaut own = profile();
        Account caller = account(own);
        signIn(caller);
        own.setArchivedAt(Instant.now());
        astronauts.flush();
        assertThatThrownBy(service::getMyProfile).isInstanceOf(BadCredentialsException.class);
        assertThatThrownBy(service::getAllActiveAstronauts).isInstanceOf(BadCredentialsException.class);
        Account officer = officer();
        signIn(officer);
        officer.setEnabled(false);
        accounts.flush();
        assertThatThrownBy(() -> service.archiveAstronaut(own.getId())).isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void archiveAndReactivateAreIdempotentAndPreserveIdentityMissionAndMedicalHistory() {
        Astronaut subject = profile();
        signIn(officer());
        String suffix = UUID.randomUUID().toString();
        UUID mission = jdbc.queryForObject("INSERT INTO missions (mission_code, name) VALUES (?, ?) RETURNING id",
                UUID.class, "history-" + suffix, "Fictional test mission");
        UUID membership = jdbc.queryForObject("INSERT INTO astronaut_missions (astronaut_id, mission_id, joined_at) "
                + "VALUES (?, ?, CURRENT_TIMESTAMP) RETURNING id", UUID.class, subject.getId(), mission);
        UUID checkin = jdbc.queryForObject("INSERT INTO astronaut_checkins "
                + "(astronaut_id, astronaut_mission_id, reported_at, source_name, is_simulated, simulation_metadata) "
                + "VALUES (?, ?, CURRENT_TIMESTAMP, 'phase3 fictional fixture', TRUE, '{\"fixture\":true}') RETURNING id",
                UUID.class, subject.getId(), membership);
        UUID observation = jdbc.queryForObject("INSERT INTO health_observations "
                + "(astronaut_id, astronaut_mission_id, checkin_id, indicator_code, storage_kind, comparison_scope_id, "
                + "measured_at, source_kind, source_name, simulation_metadata) "
                + "VALUES (?, ?, ?, 'heart_rate', 'SCALAR', "
                + "(SELECT id FROM measurement_comparison_scopes WHERE scope_code = 'default' AND indicator_code = 'heart_rate'), "
                + "CURRENT_TIMESTAMP, 'SIMULATION', 'phase3 fictional fixture', '{\"fixture\":true}') RETURNING id",
                UUID.class, subject.getId(), membership, checkin);
        jdbc.update("INSERT INTO health_measurements (observation_id, indicator_code, value, unit) "
                + "VALUES (?, 'heart_rate', 70, 'beats/min')", observation);
        jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE"); // Verify the retained fixture satisfies V25 completeness.
        List<String> before = history(membership, checkin, observation);
        var original = service.getAstronautById(subject.getId());
        var first = service.archiveAstronaut(subject.getId());
        entityManager.flush();
        entityManager.clear();
        var second = service.archiveAstronaut(subject.getId());
        assertThat(second.archivedAt()).isEqualTo(first.archivedAt());
        assertThat(history(membership, checkin, observation)).isEqualTo(before);
        assertThat(service.getAllActiveAstronauts().stream().map(value -> value.astronautId()).toList()).doesNotContain(subject.getId());
        service.reactivateAstronaut(subject.getId());
        entityManager.flush();
        entityManager.clear();
        var restored = service.reactivateAstronaut(subject.getId());
        assertThat(restored).isEqualTo(original);
        assertThat(history(membership, checkin, observation)).isEqualTo(before);
        assertThat(astronauts.existsById(subject.getId())).isTrue();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void simultaneousArchiveRequestsKeepOneStableArchiveTimestamp() throws Exception {
        Astronaut subject = profile();
        Account officer = officer();
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Instant> archive = () -> {
                signIn(officer);
                ready.countDown();
                try {
                    if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("Concurrent start timed out");
                    return service.archiveAstronaut(subject.getId()).archivedAt();
                } finally {
                    SecurityContextHolder.clearContext();
                }
            };
            var first = executor.submit(archive);
            var second = executor.submit(archive);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(first.get(15, TimeUnit.SECONDS)).isEqualTo(second.get(15, TimeUnit.SECONDS));
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    private List<String> history(UUID membership, UUID checkin, UUID observation) {
        return List.of(
                jdbc.queryForObject("SELECT to_jsonb(t)::text FROM astronaut_missions t WHERE id = ?", String.class, membership),
                jdbc.queryForObject("SELECT to_jsonb(t)::text FROM astronaut_checkins t WHERE id = ?", String.class, checkin),
                jdbc.queryForObject("SELECT to_jsonb(t)::text FROM health_observations t WHERE id = ?", String.class, observation),
                jdbc.queryForObject("SELECT to_jsonb(t)::text FROM health_measurements t WHERE observation_id = ?", String.class, observation));
    }

    private Astronaut profile() { return astronauts.saveAndFlush(new Astronaut("service-" + UUID.randomUUID(), "Service Test")); }
    private Account account(Astronaut profile) {
        return accounts.saveAndFlush(new Account("service." + UUID.randomUUID(), INERT_TEST_HASH, AccountRole.ASTRONAUT, profile.getId()));
    }
    private Account officer() {
        return accounts.saveAndFlush(new Account("officer." + UUID.randomUUID(), INERT_TEST_HASH, AccountRole.NASA_OFFICER, null));
    }
    private void signIn(Account account) { signIn(account, account.getRole().name()); }
    private void signIn(Account account, String authorityRole) {
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new AccountPrincipal(account.getId()), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + authorityRole))));
        SecurityContextHolder.setContext(context);
    }
}
