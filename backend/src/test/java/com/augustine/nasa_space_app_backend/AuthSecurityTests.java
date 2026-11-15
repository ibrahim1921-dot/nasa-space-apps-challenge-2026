package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import com.augustine.nasa_space_app_backend.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc(print = org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
@Import(AuthSecurityTests.RoleProbe.class)
class AuthSecurityTests extends PostgreSqlIntegrationTest {
    private static final String PASSWORD = "Long security test passphrase!";
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private AccountRepository accounts;
    @Autowired private AstronautRepository astronauts;
    @Autowired private PasswordEncoder passwords;
    @Autowired private AuthService auth;
    @Autowired private RoleProbe probe;

    @Test
    void loginPersistsSafeIdentityAndRotatesSessionId() throws Exception {
        Account account = account(AccountRole.ASTRONAUT);
        MockHttpSession session = csrfSession();
        String previous = session.getId();
        mvc.perform(login(account.getLoginName().toUpperCase(java.util.Locale.ROOT), PASSWORD).session(session)
                .with(request -> {
                    request.setRequestedSessionId(session.getId());
                    request.setRequestedSessionIdValid(true);
                    return request;
                })).andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(account.getId().toString()))
                .andExpect(jsonPath("$.role").value("ASTRONAUT"))
                .andExpect(jsonPath("$.profile.astronautId").value(account.getAstronautId().toString()))
                .andExpect(jsonPath("$.profile.crewCode").isString())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
        assertThat(session.getId()).isNotEqualTo(previous);
        var context = (org.springframework.security.core.context.SecurityContext) session.getAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertThat(context.getAuthentication().getPrincipal()).isInstanceOf(AccountPrincipal.class);
        assertThat(context.getAuthentication().getCredentials()).isNull();
        mvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.loginName").value(account.getLoginName()));
    }

    @Test
    void meUsesOnlySessionIdentityRegardlessOfClientSuppliedId() throws Exception {
        Account first = account(AccountRole.ASTRONAUT);
        Account other = account(AccountRole.ASTRONAUT);
        MockHttpSession session = loggedIn(first);
        mvc.perform(get("/api/auth/me").param("astronautId", other.getAstronautId().toString()).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.astronautId").value(first.getAstronautId().toString()));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/accounts/" + other.getId()).session(session)).andExpect(status().isForbidden());
    }

    @Test
    void incorrectUnknownAndDisabledAccountsHaveSameGenericFailure() throws Exception {
        Account account = account(AccountRole.NASA_OFFICER);
        mvc.perform(login(account.getLoginName(), "Wrong security test password!"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("Invalid login credentials."));
        mvc.perform(login("unknown." + UUID.randomUUID(), PASSWORD))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("Invalid login credentials."));
        account.setEnabled(false);
        accounts.saveAndFlush(account);
        mvc.perform(login(account.getLoginName(), PASSWORD))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("Invalid login credentials."));
    }

    @Test
    void archivedAstronautCannotLoginAndExistingSessionIsInvalidated() throws Exception {
        Account account = account(AccountRole.ASTRONAUT);
        MockHttpSession session = loggedIn(account);
        Astronaut astronaut = astronauts.findById(account.getAstronautId()).orElseThrow();
        astronaut.setArchivedAt(Instant.now());
        astronauts.saveAndFlush(astronaut);
        mvc.perform(get("/api/auth/me").session(session).header("Origin", "http://localhost:3000"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
        assertThat(session.isInvalid()).isTrue();
        mvc.perform(login(account.getLoginName(), PASSWORD)).andExpect(status().isUnauthorized());
        astronaut.setArchivedAt(null);
        astronauts.saveAndFlush(astronaut);
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void disablingAccountInvalidatesExistingOfficerSession() throws Exception {
        Account account = account(AccountRole.NASA_OFFICER);
        MockHttpSession session = loggedIn(account);
        account.setEnabled(false);
        accounts.saveAndFlush(account);
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void logoutRequiresCsrfAndInvalidatesSession() throws Exception {
        MockHttpSession session = loggedIn(account(AccountRole.NASA_OFFICER));
        mvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isForbidden());
        assertThat(session.isInvalid()).isFalse();
        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent())
                .andExpect(cookie().maxAge("JSESSIONID", 0));
        assertThat(session.isInvalid()).isTrue();
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void csrfRequiredForLoginAndFreshTokenWorks() throws Exception {
        Account account = account(AccountRole.NASA_OFFICER);
        mvc.perform(post("/api/auth/login").contentType("application/json")
                .content(json.writeValueAsString(Map.of("loginName", account.getLoginName(), "password", PASSWORD))))
                .andExpect(status().isForbidden());
        MvcResult result = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String token = json.readTree(result.getResponse().getContentAsString()).get("token").asText();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        mvc.perform(post("/api/auth/login").session(session).header("X-CSRF-TOKEN", token)
                .contentType("application/json").content(json.writeValueAsString(
                        Map.of("loginName", account.getLoginName(), "password", PASSWORD))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").session(session).header("X-CSRF-TOKEN", token))
                .andExpect(status().isForbidden()); // Login clears the old CSRF token.
    }

    @Test
    void corsAllowsConfiguredFrontendAndRejectsUntrustedOrigin() throws Exception {
        mvc.perform(options("/api/auth/login").header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type,x-csrf-token"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options("/api/auth/login").header("Origin", "https://untrusted.example")
                .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void validationRejectsRoleAssignmentAndOversizePasswords() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("loginName", "valid.login",
                        "password", PASSWORD, "role", "NASA_OFFICER"))))
                .andExpect(status().isBadRequest());
        mvc.perform(login("valid.login", "é".repeat(37))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register-officer").with(csrf()).contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void perLoginAttemptLimitReturns429() throws Exception {
        String login = "limited." + UUID.randomUUID();
        for (int attempt = 0; attempt < 5; attempt++) {
            mvc.perform(login(login, PASSWORD)).andExpect(status().isUnauthorized());
        }
        mvc.perform(login(login, PASSWORD)).andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "900"));
    }

    @Test
    void loginIpLimitCountsMalformedRequestsAndIgnoresSpoofedForwardedHeaders() throws Exception {
        for (int attempt = 0; attempt < 31; attempt++) {
            mvc.perform(post("/api/auth/login").with(csrf()).with(request -> {
                        request.setRemoteAddr("198.51.100.14");
                        return request;
                    }).header("X-Forwarded-For", "203.0.113." + attempt)
                    .contentType("application/json").content("{}"))
                    .andExpect(status().is(attempt < 30 ? 400 : 429));
        }
    }

    @Test
    void registrationAndActivationAreDeniedEvenWhenAuthenticatedWithValidCsrf() throws Exception {
        long before = accounts.count();
        MockHttpSession astronaut = loggedIn(account(AccountRole.ASTRONAUT));
        MockHttpSession officer = loggedIn(account(AccountRole.NASA_OFFICER));
        for (String path : new String[]{"/api/auth/activate", "/api/auth/register", "/api/auth/register-officer"}) {
            mvc.perform(post(path).with(csrf()).contentType("application/json").content("{}"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(post(path).session(astronaut).with(csrf()).contentType("application/json").content("{}"))
                    .andExpect(status().isForbidden());
            mvc.perform(post(path).session(officer).with(csrf()).contentType("application/json").content("{}"))
                    .andExpect(status().isForbidden());
        }
        assertThat(accounts.count()).isEqualTo(before + 2);
    }

    @Test
    void roleAuthorizationDeniesAstronautOfficerOperationAndViceVersa() {
        Account astronaut = account(AccountRole.ASTRONAUT);
        Account officer = account(AccountRole.NASA_OFFICER);
        try {
            SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(auth.currentIdentity(astronaut.getId())));
            assertThat(probe.astronaut()).isEqualTo("astronaut");
            assertThatThrownBy(probe::officer).isInstanceOf(AccessDeniedException.class);
            SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(auth.currentIdentity(officer.getId())));
            assertThat(probe.officer()).isEqualTo("officer");
            assertThatThrownBy(probe::astronaut).isInstanceOf(AccessDeniedException.class);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private Account account(AccountRole role) {
        String suffix = UUID.randomUUID().toString();
        UUID profile = role == AccountRole.ASTRONAUT ? astronauts.saveAndFlush(
                new Astronaut("security-" + suffix, "Security Test")).getId() : null;
        return accounts.saveAndFlush(new Account("security." + suffix, passwords.encode(PASSWORD), role, profile));
    }

    private MockHttpServletRequestBuilder login(String name, String password) throws Exception {
        return post("/api/auth/login").with(csrf()).with(request -> {
            request.setRemoteAddr("10.0." + Math.abs(name.hashCode() % 200) + ".1");
            return request;
        }).contentType("application/json").content(json.writeValueAsString(Map.of("loginName", name, "password", password)));
    }

    private MockHttpSession loggedIn(Account account) throws Exception {
        return (MockHttpSession) mvc.perform(login(account.getLoginName(), PASSWORD))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }

    private MockHttpSession csrfSession() throws Exception {
        return (MockHttpSession) mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
    }

    // Test-only methods prove the actual method-security interceptor distinguishes roles.
    // No artificial officer routes are exposed by production code.
    public static class RoleProbe {
        @PreAuthorize("hasRole('NASA_OFFICER')")
        public String officer() { return "officer"; }
        @PreAuthorize("hasRole('ASTRONAUT')")
        public String astronaut() { return "astronaut"; }
    }
}
