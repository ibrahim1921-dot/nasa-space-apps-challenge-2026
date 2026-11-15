package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = "astrohealth.environment=development")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Transactional
class SimulationCaptureDisabledTests extends PostgreSqlIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AccountRepository accounts;
    @Autowired SimulationCaptureRepository captures;
    @Autowired AuthService auth;
    @Autowired ObjectMapper json;

    @Test
    void featureGateRejectsReadAndRegistrationWithoutWritingCaptures() throws Exception {
        var officer = accounts.saveAndFlush(new Account("capture." + UUID.randomUUID(), "$2a$12$" + "a".repeat(53), AccountRole.NASA_OFFICER, null));
        long before = captures.count();
        mvc.perform(get("/api/simulation/captures/" + UUID.randomUUID())
                        .with(authentication(AuthService.authenticationFor(auth.currentIdentity(officer.getId())))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("Simulation capture registration is disabled."));
        mvc.perform(post("/api/simulation/captures")
                        .with(authentication(AuthService.authenticationFor(auth.currentIdentity(officer.getId())))).with(csrf())
                        .contentType("application/json").content(json.writeValueAsString(SimulationCaptureRegistrationTests.request())))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("Simulation capture registration is disabled."));
        mvc.perform(post("/api/simulation/captures/" + UUID.randomUUID() + "/observations")
                        .with(authentication(AuthService.authenticationFor(auth.currentIdentity(officer.getId())))).with(csrf())
                        .contentType("application/json").content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("Simulation capture registration is disabled."));
        assertThat(captures.count()).isEqualTo(before);
    }
}
