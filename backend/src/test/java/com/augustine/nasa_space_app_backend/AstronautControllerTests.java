package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.Account;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.entity.Astronaut;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.repository.AstronautRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class AstronautControllerTests extends PostgreSqlIntegrationTest {
    private static final String PASSWORD = "Profile HTTP test passphrase!";
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private AstronautRepository astronauts;
    @Autowired private AccountRepository accounts;
    @Autowired private PasswordEncoder passwords;

    @Test
    void bothRolesReceiveSafeActiveRosterAndAstronautOwnProfileUsesSessionIdentity() throws Exception {
        Astronaut own = profile();
        Astronaut other = profile();
        Astronaut archived = profile();
        archived.setArchivedAt(Instant.now());
        astronauts.saveAndFlush(archived);
        MockHttpSession astronaut = login(account(AccountRole.ASTRONAUT, own));
        MockHttpSession officer = login(account(AccountRole.NASA_OFFICER, null));
        for (MockHttpSession session : new MockHttpSession[]{astronaut, officer}) {
            var result = mvc.perform(get("/api/crew").session(session)).andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                    .andReturn();
            var rows = json.readTree(result.getResponse().getContentAsString());
            boolean includesOwn = false;
            for (var row : rows) {
                assertThat(row.size()).isEqualTo(3);
                assertThat(row.has("astronautId") && row.has("crewCode") && row.has("displayName")).isTrue();
                assertThat(row.get("astronautId").asText()).isNotEqualTo(archived.getId().toString());
                if (own.getId().toString().equals(row.get("astronautId").asText())) includesOwn = true;
            }
            assertThat(includesOwn).isTrue();
        }
        mvc.perform(get("/api/crew/me").session(astronaut).param("astronautId", other.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.astronautId").value(own.getId().toString()))
                .andExpect(jsonPath("$.crewCode").value(own.getCrewCode()))
                .andExpect(jsonPath("$.createdAt").isString()).andExpect(jsonPath("$.archivedAt").isEmpty())
                .andExpect(jsonPath("$.passwordHash").doesNotExist()).andExpect(jsonPath("$.accountId").doesNotExist());
        mvc.perform(get("/api/crew/" + own.getId()).session(astronaut)).andExpect(status().isOk());
        mvc.perform(get("/api/crew/by-code/" + own.getCrewCode()).session(astronaut)).andExpect(status().isOk());
        mvc.perform(get("/api/crew/me").session(officer)).andExpect(status().isForbidden());
    }

    @Test
    void astronautCannotReadOtherProfilesOrArchiveOrReactivateAnyProfile() throws Exception {
        Astronaut own = profile();
        Astronaut other = profile();
        MockHttpSession session = login(account(AccountRole.ASTRONAUT, own));
        mvc.perform(get("/api/crew/" + other.getId()).session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/crew/by-code/" + other.getCrewCode()).session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/crew/" + UUID.randomUUID()).session(session)).andExpect(status().isForbidden());
        for (UUID id : new UUID[]{own.getId(), other.getId()}) {
            mvc.perform(post("/api/crew/" + id + "/archive").session(session).with(csrf())).andExpect(status().isForbidden());
            mvc.perform(post("/api/crew/" + id + "/reactivate").session(session).with(csrf())).andExpect(status().isForbidden());
        }
        assertThat(astronauts.findById(own.getId()).orElseThrow().getArchivedAt()).isNull();
        assertThat(astronauts.findById(other.getId()).orElseThrow().getArchivedAt()).isNull();
    }

    @Test
    void officerCanReadArchivedProfilesAndReceives404Or400ForMissingOrMalformedIdentifiers() throws Exception {
        Astronaut archived = profile();
        archived.setArchivedAt(Instant.now());
        astronauts.saveAndFlush(archived);
        MockHttpSession officer = login(account(AccountRole.NASA_OFFICER, null));
        mvc.perform(get("/api/crew/" + archived.getId()).session(officer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.archivedAt").isString());
        mvc.perform(get("/api/crew/by-code/" + archived.getCrewCode()).session(officer)).andExpect(status().isOk());
        mvc.perform(get("/api/crew/" + UUID.randomUUID()).session(officer)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Astronaut profile not found."));
        mvc.perform(get("/api/crew/by-code/missing-" + UUID.randomUUID()).session(officer)).andExpect(status().isNotFound());
        for (String action : new String[]{"archive", "reactivate"}) {
            mvc.perform(post("/api/crew/" + UUID.randomUUID() + "/" + action).session(officer).with(csrf()))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(get("/api/crew/" + archived.getCrewCode()).session(officer)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Invalid astronaut identifier."));
    }

    @Test
    void officerArchiveAndReactivateRequireCsrfAndReturnIdempotentProfiles() throws Exception {
        Astronaut subject = profile();
        MockHttpSession officer = login(account(AccountRole.NASA_OFFICER, null));
        mvc.perform(post("/api/crew/" + subject.getId() + "/archive").session(officer)).andExpect(status().isForbidden());
        var first = mvc.perform(post("/api/crew/" + subject.getId() + "/archive").session(officer).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.archivedAt").isString()).andReturn();
        String timestamp = json.readTree(first.getResponse().getContentAsString()).get("archivedAt").asText();
        mvc.perform(post("/api/crew/" + subject.getId() + "/archive").session(officer).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.archivedAt").value(timestamp))
                .andExpect(jsonPath("$.crewCode").value(subject.getCrewCode()));
        mvc.perform(post("/api/crew/" + subject.getId() + "/reactivate").session(officer)).andExpect(status().isForbidden());
        for (int repetition = 0; repetition < 2; repetition++) {
            mvc.perform(post("/api/crew/" + subject.getId() + "/reactivate").session(officer).with(csrf()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.archivedAt").isEmpty())
                    .andExpect(jsonPath("$.astronautId").value(subject.getId().toString()));
        }
        Astronaut restored = astronauts.findById(subject.getId()).orElseThrow();
        assertThat(restored.getCrewCode()).isEqualTo(subject.getCrewCode());
        assertThat(restored.getCreatedAt()).isEqualTo(subject.getCreatedAt());
    }

    @Test
    void anonymousRequestsCannotUseAnyCrewEndpoint() throws Exception {
        UUID id = UUID.randomUUID();
        for (String path : new String[]{"/api/crew", "/api/crew/me", "/api/crew/" + id, "/api/crew/by-code/crew-01"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/crew/" + id + "/archive").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/crew/" + id + "/reactivate").with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test
    void archivingDeniesExistingAstronautSessionAndReactivationAllowsFreshLogin() throws Exception {
        Astronaut subject = profile();
        Account user = account(AccountRole.ASTRONAUT, subject);
        MockHttpSession astronaut = login(user);
        MockHttpSession officer = login(account(AccountRole.NASA_OFFICER, null));
        mvc.perform(post("/api/crew/" + subject.getId() + "/archive").session(officer).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/crew/me").session(astronaut)).andExpect(status().isUnauthorized());
        assertThat(astronaut.isInvalid()).isTrue();
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("loginName", user.getLoginName(), "password", PASSWORD))))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/crew/" + subject.getId() + "/reactivate").session(officer).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/crew/me").session(login(user))).andExpect(status().isOk());
    }

    @Test
    void noDeleteOrStableIdentityUpdateEndpointExistsEvenForOfficer() throws Exception {
        Astronaut subject = profile();
        MockHttpSession officer = login(account(AccountRole.NASA_OFFICER, null));
        mvc.perform(delete("/api/crew/" + subject.getId()).session(officer).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(patch("/api/crew/" + subject.getId()).session(officer).with(csrf()).contentType("application/json")
                .content("{\"crewCode\":\"changed\"}")).andExpect(status().isForbidden());
        assertThat(astronauts.findById(subject.getId()).orElseThrow().getCrewCode()).isEqualTo(subject.getCrewCode());
    }

    private Astronaut profile() { return astronauts.saveAndFlush(new Astronaut("http-profile-" + UUID.randomUUID(), "Profile Test")); }
    private Account account(AccountRole role, Astronaut profile) {
        return accounts.saveAndFlush(new Account("crew.http." + UUID.randomUUID(), passwords.encode(PASSWORD), role,
                profile == null ? null : profile.getId()));
    }
    private MockHttpSession login(Account account) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).with(request -> {
                    request.setRemoteAddr("192.0.2." + (Math.abs(account.getId().hashCode() % 200) + 1));
                    return request;
                }).contentType("application/json").content(json.writeValueAsString(
                        Map.of("loginName", account.getLoginName(), "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
}
