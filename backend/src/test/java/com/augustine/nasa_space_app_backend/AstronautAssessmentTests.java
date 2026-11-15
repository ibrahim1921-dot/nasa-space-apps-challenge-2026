package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.*;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK,properties={
    "spring.flyway.schemas=assessment_tests","spring.flyway.default-schema=assessment_tests",
    "spring.datasource.hikari.connection-init-sql=SET search_path TO assessment_tests",
    "spring.jpa.properties.hibernate.default_schema=assessment_tests"})
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class AstronautAssessmentTests extends PostgreSqlIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired AstronautRepository astronauts;
    @Autowired AccountRepository accounts;
    @Autowired PasswordEncoder passwords;
    @Autowired AstronautAssessmentService service;
    @Autowired AuthService auth;
    Astronaut own,other;
    Account user;
    MockHttpSession session;
    static final String PASSWORD="Fictional assessment test password!";

    @BeforeEach void setup() throws Exception {
        own=astronauts.saveAndFlush(new Astronaut("assessment-"+UUID.randomUUID(),"Fictional Astronaut"));
        other=astronauts.saveAndFlush(new Astronaut("assessment-"+UUID.randomUUID(),"Other Fictional Astronaut"));
        user=account(AccountRole.ASTRONAUT,own);
        session=login(user);
    }
    @Test void checkinStoresContextAndCompatibleObservationsAtomicallyWithoutInventingSleepSession() throws Exception {
        String path=path("checkins");
        JsonNode saved=submit(path,AssessmentFixtures.CHECKIN,UUID.randomUUID(),201);
        assertThat(saved.get("sourceKind").asText()).isEqualTo("SELF_REPORT");
        assertThat(saved.get("observationIds").size()).isEqualTo(5);
        assertThat(saved.get("data")).isEqualTo(json.readTree(AssessmentFixtures.CHECKIN));
        mvc.perform(get(path+"/"+saved.get("id").asText()).session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.context.lastFamilyCall").value("today"));
        mvc.perform(get(path).session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
        UUID id=UUID.fromString(saved.get("id").asText());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM health_observations o JOIN astronaut_assessment_observations a "
                +"ON o.id=a.observation_id WHERE a.submission_id=? AND source_kind='SELF_REPORT' AND activity_context='UNKNOWN' AND simulation_metadata IS NULL",Integer.class,id)).isEqualTo(5);
        BigDecimal glucose=jdbc.queryForObject("SELECT m.value FROM health_measurements m JOIN astronaut_assessment_observations a "
                +"ON m.observation_id=a.observation_id WHERE a.submission_id=? AND indicator_code='blood_sugar' AND unit='mmol/L'",BigDecimal.class,id);
        assertThat(glucose).isEqualByComparingTo("4.994950");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sleep_sessions s JOIN health_observations o ON s.observation_id=o.id "
                +"WHERE o.astronaut_id=?",Integer.class,own.getId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM astronaut_checkins WHERE astronaut_id=? AND NOT is_simulated",Integer.class,own.getId())).isEqualTo(1);
    }
    @Test void sleepAndStandLogsRoundTripIncludingStoppedTestAndSameTimePagination() throws Exception {
        for(String resource:List.of("sleep-logs","stand-tests")) {
            String body=resource.equals("sleep-logs")?AssessmentFixtures.SLEEP:AssessmentFixtures.STAND;
            for(int i=0;i<3;i++) submit(path(resource),body,UUID.randomUUID(),201);
            var first=mvc.perform(get(path(resource)).param("limit","2").session(session)).andExpect(status().isOk()).andReturn();
            JsonNode page=json.readTree(first.getResponse().getContentAsString());
            assertThat(page.get("items").size()).isEqualTo(2);
            var last=mvc.perform(get(path(resource)).param("limit","2").param("before",page.get("nextCursor").asText()).session(session))
                    .andExpect(status().isOk()).andReturn();
            JsonNode tail=json.readTree(last.getResponse().getContentAsString());
            assertThat(tail.get("items").size()).isEqualTo(1);
            assertThat(tail.get("nextCursor").isNull()).isTrue();
            assertThat(tail.get("items").get(0).get("id")).isNotEqualTo(page.get("items").get(0).get("id"));
        }
        String stopped=AssessmentFixtures.STAND.replace("{\"heart_rate\":60,\"systolic\":115,\"diastolic\":75}","null")
                .replace("{\"heart_rate\":70,\"systolic\":110,\"diastolic\":70}","null")
                .replace("\"partial\":false","\"partial\":true");
        JsonNode partial=submit(path("stand-tests"),stopped,UUID.randomUUID(),201);
        assertThat(partial.get("data").get("test").get("partial").asBoolean()).isTrue();
    }
    @Test void retriesReturnOriginalAndConflictingPayloadDoesNotInsert() throws Exception {
        UUID key=UUID.randomUUID();
        JsonNode first=submit(path("checkins"),AssessmentFixtures.CHECKIN,key,201);
        assertThat(submit(path("checkins"),AssessmentFixtures.CHECKIN,key,200)).isEqualTo(first);
        submit(path("checkins"),AssessmentFixtures.CHECKIN.replace("\"mood\":4","\"mood\":3"),key,409);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM astronaut_assessment_submissions WHERE astronaut_id=?",Integer.class,own.getId())).isEqualTo(1);
    }
    @Test void concurrentRetriesCommitOneSubmissionAndOneObservationSet() throws Exception {
        UUID key=UUID.randomUUID();
        AccountIdentityHolder identity=new AccountIdentityHolder(auth.currentIdentity(user.getId()));
        ExecutorService pool=Executors.newFixedThreadPool(2);
        CountDownLatch start=new CountDownLatch(1);
        Callable<AstronautAssessmentService.Saved> task=()->{
            SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(identity.value()));
            try { start.await(); return service.submit(own.getId(),"CHECKIN",key,json.readTree(AssessmentFixtures.CHECKIN)); }
            finally { SecurityContextHolder.clearContext(); }
        };
        try {
            var a=pool.submit(task); var b=pool.submit(task); start.countDown();
            var one=a.get(30,TimeUnit.SECONDS); var two=b.get(30,TimeUnit.SECONDS);
            assertThat(one.submission().id()).isEqualTo(two.submission().id());
            assertThat(one.created()).isNotEqualTo(two.created());
        } finally { pool.shutdownNow(); }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM astronaut_assessment_observations WHERE astronaut_id=?",Integer.class,own.getId())).isEqualTo(5);
    }
    @Test void allResourcesEnforceOwnershipCsrfAndOfficerReadOnlyAccess() throws Exception {
        MockHttpSession officer=login(account(AccountRole.NASA_OFFICER,null));
        for(String resource:List.of("checkins","sleep-logs","stand-tests")) {
            String body=resource.equals("checkins")?AssessmentFixtures.CHECKIN:resource.equals("sleep-logs")?AssessmentFixtures.SLEEP:AssessmentFixtures.STAND;
            JsonNode saved=submit(path(resource),body,UUID.randomUUID(),201);
            String otherPath="/api/crew/"+other.getId()+"/"+resource;
            mvc.perform(get(otherPath).session(session)).andExpect(status().isForbidden());
            mvc.perform(get(otherPath+"/"+saved.get("id").asText()).session(session)).andExpect(status().isForbidden());
            mvc.perform(post(otherPath).session(session).with(csrf()).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content(body)).andExpect(status().isForbidden());
            mvc.perform(post(path(resource)).session(session).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content(body)).andExpect(status().isForbidden());
            mvc.perform(get(path(resource)).session(officer)).andExpect(status().isOk());
            mvc.perform(get(path(resource)+"/"+saved.get("id").asText()).session(officer)).andExpect(status().isOk());
            mvc.perform(post(path(resource)).session(officer).with(csrf()).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content(body)).andExpect(status().isForbidden());
            mvc.perform(get(path(resource))).andExpect(status().isUnauthorized());
            mvc.perform(post(path(resource)).with(csrf()).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
        }
    }
    @Test void invalidFieldsHeadersAndCursorsReturn400WithoutRows() throws Exception {
        submit(path("checkins"),AssessmentFixtures.CHECKIN.replace("\"mood\":4","\"mood\":6"),UUID.randomUUID(),400);
        submit(path("sleep-logs"),AssessmentFixtures.SLEEP.replace("\"sleep_hr_p5\":50","\"sleep_hr_p5\":201"),UUID.randomUUID(),400);
        submit(path("stand-tests"),AssessmentFixtures.STAND.replace("\"dizzy\"","\"invalid\""),UUID.randomUUID(),400);
        mvc.perform(post(path("checkins")).session(session).with(csrf()).contentType("application/json").content(AssessmentFixtures.CHECKIN)).andExpect(status().isBadRequest());
        mvc.perform(get(path("checkins")).session(session).param("limit","101")).andExpect(status().isBadRequest());
        mvc.perform(get(path("checkins")).session(session).param("before",UUID.randomUUID().toString())).andExpect(status().isBadRequest());
        mvc.perform(get(path("checkins")+"/"+UUID.randomUUID()).session(session)).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM astronaut_assessment_submissions WHERE astronaut_id=?",Integer.class,own.getId())).isZero();
    }
    @Test void disabledAndArchivedAstronautSessionsAreRevoked() throws Exception {
        user.setEnabled(false); user=accounts.saveAndFlush(user);
        mvc.perform(get(path("checkins")).session(session)).andExpect(status().isUnauthorized());
        user.setEnabled(true); user=accounts.saveAndFlush(user); session=login(user);
        own.setArchivedAt(Instant.now()); astronauts.saveAndFlush(own);
        mvc.perform(post(path("sleep-logs")).session(session).with(csrf()).header("Idempotency-Key",UUID.randomUUID())
                .contentType("application/json").content(AssessmentFixtures.SLEEP)).andExpect(status().isUnauthorized());
    }
    @Test void databaseHistoryIsImmutableAndCrossProfileLinksCannotBeInserted() throws Exception {
        JsonNode saved=submit(path("checkins"),AssessmentFixtures.CHECKIN,UUID.randomUUID(),201);
        UUID id=UUID.fromString(saved.get("id").asText());
        assertThatThrownBy(()->jdbc.update("DELETE FROM astronaut_assessment_submissions WHERE id=?",id)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("INSERT INTO astronaut_assessment_observations VALUES (?,?,?)",id,other.getId(),UUID.fromString(saved.get("observationIds").get(0).asText())))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    private String path(String resource) { return "/api/crew/"+own.getId()+"/"+resource; }
    private JsonNode submit(String path,String body,UUID key,int status) throws Exception {
        var result=mvc.perform(post(path).session(session).with(csrf()).header("Idempotency-Key",key).contentType("application/json").content(body))
                .andExpect(status().is(status)).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }
    private Account account(AccountRole role,Astronaut profile) {
        return accounts.saveAndFlush(new Account("assess."+UUID.randomUUID(),passwords.encode(PASSWORD),role,profile==null?null:profile.getId()));
    }
    private MockHttpSession login(Account account) throws Exception {
        return (MockHttpSession)mvc.perform(post("/api/auth/login").with(csrf()).with(r->{r.setRemoteAddr("192.0.2."+(Math.abs(account.getId().hashCode()%200)+1));return r;})
                .contentType("application/json").content(json.writeValueAsString(Map.of("loginName",account.getLoginName(),"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    private record AccountIdentityHolder(com.augustine.nasa_space_app_backend.dto.AccountIdentity value) { }
}
