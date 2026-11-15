package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.CaptureRegistrationRequest;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.core.env.Environment;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {
        "astrohealth.environment=development", "astrohealth.simulation.capture-registration-enabled=true"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Transactional
class SimulationCaptureRegistrationTests extends PostgreSqlIntegrationTest {
    private static final String PATH = "/api/simulation/captures";
    private static final String HASH = "$2a$12$" + "a".repeat(53);
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AccountRepository accounts;
    @Autowired AstronautRepository astronauts;
    @Autowired SimulationCaptureRepository captures;
    @Autowired SimulationProfileMappingRepository mappings;
    @Autowired SimulationCaptureService service;
    @Autowired AuthService auth;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired Environment environment;

    @Test
    void officerResolvesRealUuidsAndActivatesOnlyAfterAllMappingsWithoutCreatingIdentities() throws Exception {
        Astronaut one = profile("crew-01");
        Astronaut two = profile("crew-02");
        Account officer = officer();
        var request = request();
        var sources = new ArrayList<>(request.mappings());
        UUID second = UUID.randomUUID();
        sources.add(new CaptureRegistrationRequest.ProfileMapping(second, "sim-crew-02", "crew-02"));
        var config = new HashMap<>(request.manifest().configuration());
        config.put("profiles", List.of(source(request.mappings().get(0).simulationAstronautId(), "sim-crew-01"), source(second, "sim-crew-02")));
        request = withManifest(request, manifest(request.runId(), config), sources);
        long profileCount = astronauts.count(), accountCount = accounts.count();
        var result = mvc.perform(register(officer, request)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.createdByAccountId").value(officer.getId().toString()))
                .andExpect(jsonPath("$.createdAt").isString()).andExpect(jsonPath("$.activatedAt").isString())
                .andExpect(jsonPath("$.mappings[0].astronautId").value(one.getId().toString()))
                .andExpect(jsonPath("$.mappings[1].astronautId").value(two.getId().toString())).andReturn();
        UUID id = UUID.fromString(json.readTree(result.getResponse().getContentAsString()).get("captureId").asText());
        assertThat(result.getResponse().getHeader("Location")).isEqualTo(PATH + "/" + id);
        assertThat(captures.findById(id).orElseThrow().getManifest()).containsKeys("registration_key", "run_manifest", "mappings");
        assertThat(mappings.findAllByCaptureId(id)).hasSize(2);
        assertThat(astronauts.count()).isEqualTo(profileCount);
        assertThat(accounts.count()).isEqualTo(accountCount);
    }

    @Test
    void anonymousAstronautMissingCsrfAndDisabledOfficerAreDenied() throws Exception {
        var request = request();
        long before = captures.count();
        mvc.perform(post(PATH).with(csrf()).contentType("application/json").content(json.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
        Astronaut profile = profile("unapproved-" + UUID.randomUUID());
        Account astronaut = accounts.saveAndFlush(new Account("capture." + UUID.randomUUID(), HASH, AccountRole.ASTRONAUT, profile.getId()));
        mvc.perform(register(astronaut, request)).andExpect(status().isForbidden());
        Account officer = officer();
        var identity = identityFor(officer);
        mvc.perform(post(PATH).with(authentication(identity)).contentType("application/json").content(json.writeValueAsString(request)))
                .andExpect(status().isForbidden());
        officer.setEnabled(false);
        accounts.saveAndFlush(officer);
        mvc.perform(post(PATH).with(authentication(identity)).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(request))).andExpect(status().isUnauthorized());
        assertThat(captures.count()).isEqualTo(before);
    }

    @Test
    void directServiceCallsReloadEnabledStatusAndRoleRatherThanTrustingAuthorities() {
        Account officer = officer();
        var identity = identityFor(officer);
        SecurityContextHolder.getContext().setAuthentication(identity);
        try {
            officer.setEnabled(false);
            accounts.saveAndFlush(officer);
            assertThatThrownBy(() -> service.register(request())).isInstanceOf(org.springframework.security.core.AuthenticationException.class);
        } finally { SecurityContextHolder.clearContext(); }
        assertThatThrownBy(() -> service.register(request())).isInstanceOf(org.springframework.security.core.AuthenticationException.class);
    }

    @Test
    void directServiceRejectsForgedOfficerAuthorityForAstronautAccount() {
        var profile = profile("unapproved-" + UUID.randomUUID());
        var astronaut = accounts.saveAndFlush(new Account("capture." + UUID.randomUUID(), HASH, AccountRole.ASTRONAUT, profile.getId()));
        var forged = org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(
                new com.augustine.nasa_space_app_backend.security.AccountPrincipal(astronaut.getId()), null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_NASA_OFFICER")));
        SecurityContextHolder.getContext().setAuthentication(forged);
        try {
            assertThatThrownBy(() -> service.register(request())).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        } finally { SecurityContextHolder.clearContext(); }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void concurrentRegistrationRetriesCommitOneCaptureAndOneMapping() throws Exception {
        // Committed concurrency fixtures belong to a separate schema in the disposable container.
        String url = environment.getRequiredProperty("spring.datasource.url");
        String user = environment.getRequiredProperty("spring.datasource.username");
        String password = environment.getRequiredProperty("spring.datasource.password");
        String schema = "capture_race_" + UUID.randomUUID().toString().replace("-", "");
        Flyway.configure().dataSource(url, user, password).defaultSchema(schema).schemas(schema)
                .locations("classpath:db/migration").cleanDisabled(true).load().migrate();
        JdbcTemplate fixture = new JdbcTemplate(new DriverManagerDataSource(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + schema, user, password));
        UUID officer = fixture.queryForObject("INSERT INTO accounts(login_name,password_hash,role) VALUES ('race.officer',?,'NASA_OFFICER') RETURNING id",
                UUID.class, HASH);
        fixture.update("INSERT INTO astronauts(crew_code,display_name) VALUES ('crew-01','Disposable race profile')");
        var authentication = org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(
                new com.augustine.nasa_space_app_backend.security.AccountPrincipal(officer), null, List.of());
        var r = request();
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<SimulationCaptureService.Registration> call = () -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Registration race did not start");
                SecurityContextHolder.getContext().setAuthentication(authentication);
                try {
                    return new TransactionTemplate(transactions).execute(status -> {
                        // Schema is generated locally from a UUID, not request input. SET LOCAL resets on commit.
                        jdbc.execute("SET LOCAL search_path TO " + schema);
                        return service.register(r);
                    });
                } finally { SecurityContextHolder.clearContext(); }
            };
            var first = pool.submit(call);
            var second = pool.submit(call);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var a = first.get(30, TimeUnit.SECONDS);
            var b = second.get(30, TimeUnit.SECONDS);
            assertThat(a.capture().captureId()).isEqualTo(b.capture().captureId());
            assertThat(List.of(a.created(), b.created())).containsExactlyInAnyOrder(true, false);
            assertThat(fixture.queryForObject("SELECT COUNT(*) FROM simulation_captures", Integer.class)).isEqualTo(1);
            assertThat(fixture.queryForObject("SELECT COUNT(*) FROM simulation_profile_mappings", Integer.class)).isEqualTo(1);
        } finally {
            start.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void missingAstronautIs404AndDoesNotCreateDestinationOrCapture() throws Exception {
        long before = captures.count(), profileCount = astronauts.count();
        mvc.perform(register(officer(), request())).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Destination astronaut not found."));
        assertThat(captures.count()).isEqualTo(before);
        assertThat(astronauts.count()).isEqualTo(profileCount);
    }

    @Test
    void archivedDestinationIs409AndLeavesNoDraftOrMappings() throws Exception {
        var profile = profile("crew-01");
        profile.setArchivedAt(Instant.now());
        astronauts.saveAndFlush(profile);
        long before = captures.count(), beforeMappings = mappings.count();
        mvc.perform(register(officer(), request())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Destination astronaut is archived."));
        assertThat(captures.count()).isEqualTo(before);
        assertThat(mappings.count()).isEqualTo(beforeMappings);
    }

    @Test
    void unapprovedDestinationsAndSubstitutedSourceUuidOrCodeAreRejected() throws Exception {
        Account officer = officer();
        var r = request();
        var original = r.mappings().get(0);
        for (var mapping : List.of(
                new CaptureRegistrationRequest.ProfileMapping(original.simulationAstronautId(), original.simulationCrewCode(), "crew-05"),
                new CaptureRegistrationRequest.ProfileMapping(UUID.randomUUID(), original.simulationCrewCode(), "crew-01"),
                new CaptureRegistrationRequest.ProfileMapping(original.simulationAstronautId(), "another-profile", "crew-01"))) {
            mvc.perform(register(officer, withManifest(r, r.manifest(), List.of(mapping)))).andExpect(status().isBadRequest());
        }
    }

    @Test
    void duplicateSourceAndDuplicateDestinationMappingsAreRejected() throws Exception {
        Account officer = officer();
        var r = request();
        var first = r.mappings().get(0);
        mvc.perform(register(officer, withManifest(r, r.manifest(), List.of(first, first)))).andExpect(status().isBadRequest());
        UUID second = UUID.randomUUID();
        var config = new HashMap<>(r.manifest().configuration());
        config.put("profiles", List.of(source(first.simulationAstronautId(), first.simulationCrewCode()), source(second, "sim-crew-02")));
        mvc.perform(register(officer, withManifest(r, manifest(r.runId(), config), List.of(first,
                new CaptureRegistrationRequest.ProfileMapping(second, "sim-crew-02", "crew-01")))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void mismatchedRunNonSyntheticUnknownFieldsAndIncompleteManifestAre400() throws Exception {
        Account officer = officer();
        var r = request();
        mvc.perform(register(officer, withManifest(r, manifest(UUID.randomUUID(), r.manifest().configuration()), r.mappings())))
                .andExpect(status().isBadRequest());
        String body = json.writeValueAsString(r);
        for (String invalid : List.of(body.replace("\"synthetic\":true", "\"synthetic\":false"),
                body.replace("astrohealth.simulation.run.v1", "unknown"),
                body.substring(0, body.length() - 1) + ",\"role\":\"NASA_OFFICER\"}",
                "{}", body.replace("\"seed\":42", "\"seed\":true"))) {
            mvc.perform(post(PATH).with(authentication(identityFor(officer))).with(csrf()).contentType("application/json")
                    .content(invalid)).andExpect(status().isBadRequest());
        }
    }

    @Test
    void exactRetryReturnsOriginalAndNewKeyAllowsIdenticalIndependentCapture() throws Exception {
        profile("crew-01");
        var officer = officer();
        var r = request();
        UUID first = create(officer, r);
        mvc.perform(register(officer, r)).andExpect(status().isOk()).andExpect(jsonPath("$.captureId").value(first.toString()));
        var independent = new CaptureRegistrationRequest(UUID.randomUUID(), r.workspaceId(), r.runId(), r.manifest(), r.mappings());
        assertThat(create(officer, independent)).isNotEqualTo(first);
        assertThat(captures.findAllByWorkspaceIdAndEngineRunId(r.workspaceId(), r.runId())).hasSize(2);
    }

    @Test
    void sameKeyChangedIdentityAndChangedManifestWithFreshKeyAreConflicts() throws Exception {
        profile("crew-01");
        var officer = officer();
        var r = request();
        create(officer, r);
        mvc.perform(register(officer, new CaptureRegistrationRequest(r.registrationKey(), UUID.randomUUID(), r.runId(), r.manifest(), r.mappings())))
                .andExpect(status().isConflict());
        var config = new HashMap<>(r.manifest().configuration());
        config.put("seed", 43);
        for (UUID key : List.of(r.registrationKey(), UUID.randomUUID())) {
            mvc.perform(register(officer, new CaptureRegistrationRequest(key, r.workspaceId(), r.runId(), manifest(r.runId(), config), r.mappings())))
                    .andExpect(status().isConflict());
        }
        assertThat(captures.findAllByWorkspaceIdAndEngineRunId(r.workspaceId(), r.runId())).hasSize(1);
    }

    @Test
    void swappedDestinationsCannotReplaceExistingApprovalWithAnyKey() throws Exception {
        profile("crew-01");
        profile("crew-02");
        var officer = officer();
        var r = request();
        create(officer, r);
        var source = r.mappings().get(0);
        for (UUID key : List.of(r.registrationKey(), UUID.randomUUID())) {
            mvc.perform(register(officer, new CaptureRegistrationRequest(key, r.workspaceId(), r.runId(), r.manifest(),
                    List.of(new CaptureRegistrationRequest.ProfileMapping(source.simulationAstronautId(), source.simulationCrewCode(), "crew-02")))))
                    .andExpect(status().isConflict());
        }
    }

    @Test
    void lifecycleCloseIsTerminalIdempotentAndBoundToCreatorWorkspaceAndRun() throws Exception {
        profile("crew-01");
        var officer = officer();
        var other = officer();
        var r = request();
        UUID id = create(officer, r);
        String path = PATH + "/" + id;
        String body = json.writeValueAsString(Map.of("workspaceId", r.workspaceId(), "runId", r.runId()));
        mvc.perform(get(path).with(authentication(identityFor(officer)))).andExpect(status().isOk());
        mvc.perform(get(path).with(authentication(identityFor(other)))).andExpect(status().isNotFound());
        mvc.perform(post(path + "/close").with(authentication(identityFor(other))).with(csrf())
                .contentType("application/json").content(body)).andExpect(status().isNotFound());
        mvc.perform(register(other, r)).andExpect(status().isConflict());
        mvc.perform(post(path + "/close").with(authentication(identityFor(officer)))
                .contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(post(path + "/close").with(authentication(identityFor(officer))).with(csrf())
                .contentType("application/json").content(body.replace(r.runId().toString(), UUID.randomUUID().toString())))
                .andExpect(status().isConflict());
        String closed = mvc.perform(post(path + "/close").with(authentication(identityFor(officer))).with(csrf())
                .contentType("application/json").content(body)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED")).andReturn().getResponse().getContentAsString();
        mvc.perform(post(path + "/close").with(authentication(identityFor(officer))).with(csrf())
                .contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(content().json(closed));
        mvc.perform(register(officer, r)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"));
        for (String endpoint : List.of(path, path + "/mappings", path + "/activate")) {
            mvc.perform(patch(endpoint).with(authentication(identityFor(officer))).with(csrf())
                    .contentType("application/json").content("{}")).andExpect(status().isForbidden());
        }
        assertThat(mappings.findAllByCaptureId(id)).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_ingestion_receipts WHERE capture_id = ?", Integer.class, id)).isZero();
    }

    private UUID create(Account officer, CaptureRegistrationRequest request) throws Exception {
        String body = mvc.perform(register(officer, request)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(body).get("captureId").asText());
    }
    private MockHttpServletRequestBuilder register(Account officer, CaptureRegistrationRequest request) {
        return post(PATH).with(authentication(identityFor(officer))).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(request));
    }
    private Authentication identityFor(Account account) { return AuthService.authenticationFor(auth.currentIdentity(account.getId())); }
    private Account officer() { return accounts.saveAndFlush(new Account("capture." + UUID.randomUUID(), HASH, AccountRole.NASA_OFFICER, null)); }
    private Astronaut profile(String code) { return astronauts.saveAndFlush(new Astronaut(code, "Disposable capture test profile")); }
    static CaptureRegistrationRequest request() {
        UUID run = UUID.randomUUID(), source = UUID.randomUUID();
        return new CaptureRegistrationRequest(UUID.randomUUID(), UUID.randomUUID(), run,
                manifest(run, Map.of("seed", 42, "start_at", "2026-01-01T08:00:00Z", "profiles", List.of(source(source, "sim-crew-01")))),
                List.of(new CaptureRegistrationRequest.ProfileMapping(source, "sim-crew-01", "crew-01")));
    }
    private static Map<String, Object> source(UUID id, String code) { return Map.of("astronaut_id", id.toString(), "crew_code", code); }
    private static CaptureRegistrationRequest.RunManifest manifest(UUID run, Map<String, Object> config) {
        return new CaptureRegistrationRequest.RunManifest("astrohealth.simulation.run.v1", "0.1.0", true, run, config, null);
    }
    private CaptureRegistrationRequest withManifest(CaptureRegistrationRequest r, CaptureRegistrationRequest.RunManifest manifest,
                                                   List<CaptureRegistrationRequest.ProfileMapping> mappings) {
        return new CaptureRegistrationRequest(r.registrationKey(), r.workspaceId(), r.runId(), manifest, mappings);
    }
}
