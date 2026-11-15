package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@Transactional
class PersonalBaselineControllerTests extends PostgreSqlIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AstronautRepository astronauts;
    @Autowired AccountRepository accounts;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @Test void anonymousRequestsRequireAuthentication() throws Exception {
        mvc.perform(get("/api/crew/"+UUID.randomUUID()+"/baselines")).andExpect(status().isUnauthorized());
    }

    @Test void astronautOwnershipAndOfficerWriteRulesAreEnforcedAtHttpBoundary() throws Exception {
        UUID own=profile(),other=profile();
        var astronaut=identity(AccountRole.ASTRONAUT,own);
        mvc.perform(get(path(own)).with(authentication(AuthService.authenticationFor(astronaut))))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(get(path(other)).with(authentication(AuthService.authenticationFor(astronaut))))
                .andExpect(status().isForbidden());
        mvc.perform(post(path(own)).with(authentication(AuthService.authenticationFor(astronaut))).with(csrf())
                .contentType("application/json").content("{}")) .andExpect(status().isForbidden());
    }

    @Test void realProposalApprovalAndSelectionUseAuthenticatedCsrfProtectedEndpoints() throws Exception {
        UUID subject=profile();
        var author=identity(AccountRole.NASA_OFFICER,null);
        var approver=identity(AccountRole.NASA_OFFICER,null);
        UUID scope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='heart_rate' AND scope_code='default'",UUID.class);
        Instant input=Instant.parse("2026-01-01T00:00:00Z"),start=Instant.parse("2090-01-01T00:00:00Z");
        UUID evidence=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,"
                + "activity_context,measured_at,source_kind,source_name) VALUES (?,'heart_rate','SCALAR',?,'SLEEPING',?,'DEVICE','Fixture') RETURNING id",
                UUID.class,subject,scope,Timestamp.from(input));
        jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',10,'beats/min')",evidence);
        var request=new BaselineRequest("heart_rate","value","beats/min","SLEEPING",scope,"ORIGINAL",java.math.BigDecimal.TEN,
                start,null,input,input,"Fixture review","Fixture",List.of(evidence),null,null);
        String body=json.writeValueAsString(request);
        mvc.perform(post(path(subject)).with(authentication(AuthService.authenticationFor(author)))
                .contentType("application/json").content(body)).andExpect(status().isForbidden());
        var result=mvc.perform(post(path(subject)).with(authentication(AuthService.authenticationFor(author))).with(csrf())
                .contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn();
        String proposal=json.readTree(result.getResponse().getContentAsString()).get("proposalId").asText();
        mvc.perform(post(path(subject)+"/"+proposal+"/approve").with(authentication(AuthService.authenticationFor(author))).with(csrf())
                .contentType("application/json").content("{\"note\":\"Fixture approval\"}")).andExpect(status().isForbidden());
        mvc.perform(post(path(subject)+"/"+proposal+"/approve").with(authentication(AuthService.authenticationFor(approver))).with(csrf())
                .contentType("application/json").content("{\"note\":\"Fixture approval\"}")).andExpect(status().isOk());
        mvc.perform(get(path(subject)+"/selection").with(authentication(AuthService.authenticationFor(author)))
                .param("indicator","heart_rate").param("metric","value").param("unit","beats/min")
                .param("context","SLEEPING").param("scope",scope.toString()).param("at",start.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SELECTED"))
                .andExpect(jsonPath("$.referenceValue").value(10))
                .andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store")));
    }

    private String path(UUID id) { return "/api/crew/"+id+"/baselines"; }
    private UUID profile() { return astronauts.saveAndFlush(new Astronaut("http-baseline-"+UUID.randomUUID(),"HTTP fixture")).getId(); }
    private AccountIdentity identity(AccountRole role,UUID subject) {
        Account a=accounts.saveAndFlush(new Account("baseline-http."+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),role,subject));
        return new AccountIdentity(a.getId(),a.getLoginName(),role,null);
    }
}
