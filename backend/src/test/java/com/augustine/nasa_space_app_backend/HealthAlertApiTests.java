package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@Transactional
class HealthAlertApiTests extends PostgreSqlIntegrationTest {
 @Autowired MockMvc mvc;
 @Autowired JdbcTemplate jdbc;
 @Autowired ObjectMapper json;
 @Autowired AstronautRepository astronauts;
 @Autowired AccountRepository accounts;
 @Autowired PersonalBaselineService baselines;
 @Autowired HealthAlertService service;
 @Autowired PasswordEncoder passwords;
 @Autowired jakarta.persistence.EntityManager entityManager;
 UUID subject,other,ownAlert,otherAlert,scope,observation;
 AccountIdentity astronaut,officer;
 Instant at=Instant.parse("2026-01-01T00:00:00Z");
 @BeforeEach void fixture() {
  subject=profile(); other=profile();
  astronaut=account(AccountRole.ASTRONAUT,subject); officer=account(AccountRole.NASA_OFFICER,null);
  scope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='heart_rate' AND scope_code='default'",UUID.class);
  observation=reading(subject,at);
  ownAlert=manual(subject,"WARNING",false,at); attach(ownAlert,observation,subject);
  otherAlert=manual(other,"CRITICAL",true,at); attach(otherAlert,reading(other,at),other);
 }
 @AfterEach void clear() { SecurityContextHolder.clearContext(); }
 @Test void anonymousRequestsRequireAuthentication() throws Exception {
  for(String path:List.of("/api/alerts","/api/alerts/me","/api/alerts/"+ownAlert)) mvc.perform(get(path)).andExpect(status().isUnauthorized());
  mvc.perform(post(path(ownAlert)+"/acknowledge").with(csrf())).andExpect(status().isUnauthorized());
 }
 @Test void astronautsSeeOnlyOwnAlertsAndCannotUseOfficerListOrResolve() throws Exception {
  mvc.perform(get("/api/alerts/me").with(authentication(AuthService.authenticationFor(astronaut))))
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].id").value(ownAlert.toString()))
   .andExpect(jsonPath("$.content[0].astronautId").value(subject.toString()));
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isForbidden());
  mvc.perform(get("/api/alerts/me").param("astronautId",other.toString()).with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isBadRequest());
  mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(astronaut))).with(csrf()).contentType("application/json").content("{\"note\":\"Not authorized\"}")).andExpect(status().isForbidden());
 }
 @Test void horizontalDetailAndAcknowledgmentAttemptsAreIndistinguishableFromMissingAlerts() throws Exception {
  for(UUID id:List.of(otherAlert,UUID.randomUUID())) {
   mvc.perform(get(path(id)).with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isNotFound()).andExpect(content().json("{\"error\":\"Health alert not found.\"}"));
   mvc.perform(post(path(id)+"/acknowledge").with(authentication(AuthService.authenticationFor(astronaut))).with(csrf())).andExpect(status().isNotFound());
  }
  assertThat(jdbc.queryForObject("SELECT status FROM health_alerts WHERE id=?",String.class,otherAlert)).isEqualTo("OPEN");
 }
 @Test void officersUseCurrentCrewPolicyIncludingArchivedProfiles() throws Exception {
  jdbc.update("UPDATE astronauts SET archived_at=CURRENT_TIMESTAMP WHERE id=?",other);
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("astronautId",other.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(otherAlert.toString()));
  mvc.perform(get(path(otherAlert)).with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isOk());
  mvc.perform(get("/api/alerts/me").with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isForbidden());
 }
 @Test void disabledAndArchivedAccountsCannotReadOrWriteAlerts() throws Exception {
  var disabled=accounts.findById(astronaut.accountId()).orElseThrow(); disabled.setEnabled(false); accounts.saveAndFlush(disabled);
  mvc.perform(get(path(ownAlert)).with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isUnauthorized());
  mvc.perform(post(path(ownAlert)+"/acknowledge").with(authentication(AuthService.authenticationFor(astronaut))).with(csrf())).andExpect(status().isUnauthorized());
  var active=account(AccountRole.ASTRONAUT,other);
  jdbc.update("UPDATE astronauts SET archived_at=CURRENT_TIMESTAMP WHERE id=?",other);
  // Clear managed profile state before verifying the account's current archive status.
  entityManager.clear();
  mvc.perform(get("/api/alerts/me").with(authentication(AuthService.authenticationFor(active)))).andExpect(status().isUnauthorized());
 }
 @Test void credentialsAuthoritiesAloneDoNotAuthorizeDirectServiceCalls() {
  SecurityContextHolder.clearContext();
  assertThatThrownBy(()->service.detail(ownAlert)).isInstanceOf(org.springframework.security.authentication.AuthenticationCredentialsNotFoundException.class);
  SecurityContextHolder.getContext().setAuthentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated("fake",null,List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_NASA_OFFICER"))));
  assertThatThrownBy(()->service.acknowledge(ownAlert)).isInstanceOf(org.springframework.security.authentication.AuthenticationCredentialsNotFoundException.class);
 }
 @Test void deterministicPaginationUsesTimestampAndUuidTieBreaker() throws Exception {
  var ids=new ArrayList<UUID>(); ids.add(ownAlert);
  ids.add(manual(subject,"INFO",false,at)); ids.add(manual(subject,"INFO",false,at));
  ids.sort(Comparator.comparing(UUID::toString).reversed());
  var first=mvc.perform(get("/api/alerts/me").with(authentication(AuthService.authenticationFor(astronaut))).param("size","2")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3)).andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.hasNext").value(true)).andReturn();
  var content=json.readTree(first.getResponse().getContentAsString()).get("content");
  assertThat(content.get(0).get("id").asText()).isEqualTo(ids.get(0).toString());
  assertThat(content.get(1).get("id").asText()).isEqualTo(ids.get(1).toString());
  mvc.perform(get("/api/alerts/me").with(authentication(AuthService.authenticationFor(astronaut))).param("page","1").param("size","2")).andExpect(status().isOk()).andExpect(jsonPath("$.hasNext").value(false)).andExpect(jsonPath("$.content[0].id").value(ids.get(2).toString()));
  mvc.perform(get("/api/alerts/me").with(authentication(AuthService.authenticationFor(astronaut))).param("page","2").param("size","2")).andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
 }
 @ParameterizedTest @CsvSource({"page,-1","page,10001","page,nope","size,0","size,101","severity,FATAL","status,CLOSED","triggerType,UNKNOWN","indicator,no_such_indicator","synthetic,yes","synthetic,TRUE","from,not-a-time","to,10000-01-01T00:00:00Z","astronautId,invalid"})
 void invalidQueryParametersAreSafeBadRequests(String key,String value) throws Exception {
  var response=mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param(key,value)).andExpect(status().isBadRequest()).andReturn();
  assertThat(response.getResponse().getContentAsString()).doesNotContain("SQLException","org.postgresql","passwordHash","stackTrace");
 }
 @Test void queryRangesAreHalfOpenAndRejectEqualOrReversedDates() throws Exception {
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("from",at.toString()).param("to",at.plusSeconds(1).toString())).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2));
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("to",at.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
  for(Instant end:List.of(at,at.minusSeconds(1))) mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("from",at.toString()).param("to",end.toString())).andExpect(status().isBadRequest());
 }
 @ParameterizedTest @CsvSource({"severity,WARNING,1","status,OPEN,2","triggerType,MANUAL,2","synthetic,true,1","synthetic,false,1","indicator,heart_rate,2","indicator,blood_sugar,0"})
 void officerFiltersAreAppliedInTheDatabase(String key,String value,int total) throws Exception {
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param(key,value)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(total));
 }
 @Test void filtersCombineAndDoNotDuplicateMultiObservationAlerts() throws Exception {
  attach(ownAlert,reading(subject,at.plusSeconds(1)),subject);
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("astronautId",subject.toString()).param("severity","WARNING").param("status","OPEN").param("triggerType","MANUAL").param("indicator","heart_rate").param("synthetic","false")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
 }
 @Test void detailIsAllowlistedAndContainsCanonicalMeasurementMetadata() throws Exception {
  var response=mvc.perform(get(path(ownAlert)).with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isOk())
   .andExpect(jsonPath("$.alert.synthetic").value(false)).andExpect(jsonPath("$.alert.nonclinical").value(false))
   .andExpect(jsonPath("$.observations[0].observationId").value(observation.toString())).andExpect(jsonPath("$.observations[0].indicator").value("heart_rate"))
   .andExpect(jsonPath("$.observations[0].activityContext").value("UNKNOWN")).andExpect(jsonPath("$.observations[0].measuredAt").value(at.toString()))
   .andExpect(jsonPath("$.observations[0].measurements[0].metric").value("value")).andExpect(jsonPath("$.observations[0].measurements[0].unit").value("beats/min"))
   .andExpect(jsonPath("$.observations[0].measurements[0].value").value(10)).andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store"))).andReturn();
  assertThat(response.getResponse().getContentAsString()).doesNotContain("DO_NOT_EXPOSE","passwordHash","provenance","details","acknowledged_by","loginName",other.toString(),otherAlert.toString());
 }
 @Test void pairedBloodPressureMetricsAreDistinctInDetailsAndIndicatorFilters() throws Exception {
  UUID s=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='blood_pressure' AND scope_code='default'",UUID.class);
  UUID obs=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name) VALUES (?,'blood_pressure','BLOOD_PRESSURE',?,'RESTING',?,'DEVICE','Fixture') RETURNING id",UUID.class,subject,s,Timestamp.from(at));
  jdbc.update("INSERT INTO blood_pressure_observations(observation_id,systolic,diastolic) VALUES (?,11,5)",obs); attach(ownAlert,obs,subject);
  mvc.perform(get(path(ownAlert)).with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isOk()).andExpect(jsonPath("$.observations[?(@.indicator == 'blood_pressure')].measurements[0].metric").value("diastolic")).andExpect(jsonPath("$.observations[?(@.indicator == 'blood_pressure')].measurements[1].metric").value("systolic"));
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("indicator","blood_pressure")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
 }
 @Test void syntheticFlagsArePreservedOnListsDetailsAndTransitions() throws Exception {
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("synthetic","true")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].synthetic").value(true)).andExpect(jsonPath("$.content[0].nonclinical").value(true));
  mvc.perform(get(path(otherAlert)).with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isOk()).andExpect(jsonPath("$.alert.synthetic").value(true));
  mvc.perform(post(path(otherAlert)+"/acknowledge").with(authentication(AuthService.authenticationFor(officer))).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.alert.nonclinical").value(true));
 }
 @Test void legacySyntheticEvidenceIsLabeledWithoutMutatingHistory() throws Exception {
  UUID obs=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,simulation_metadata) VALUES (?,'heart_rate','SCALAR',?,'UNKNOWN',?,'SIMULATION','Fixture','{\"secret\":\"DO_NOT_EXPOSE\"}') RETURNING id",UUID.class,subject,scope,Timestamp.from(at));
  jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',10,'beats/min')",obs); attach(ownAlert,obs,subject);
  mvc.perform(get(path(ownAlert)).with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isOk()).andExpect(jsonPath("$.alert.synthetic").value(true));
  mvc.perform(get("/api/alerts/me").with(authentication(AuthService.authenticationFor(astronaut))).param("synthetic","true")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
  assertThat(jdbc.queryForObject("SELECT is_synthetic FROM health_alerts WHERE id=?",Boolean.class,ownAlert)).isFalse();
 }
 @Test void lifecycleWritesRequireCsrfAndResolutionRequiresOfficer() throws Exception {
  mvc.perform(post(path(ownAlert)+"/acknowledge").with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isForbidden());
  mvc.perform(post(path(ownAlert)+"/acknowledge").with(authentication(AuthService.authenticationFor(astronaut))).with(csrf().useInvalidToken())).andExpect(status().isForbidden());
  mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(officer))).contentType("application/json").content("{\"note\":\"Fixture review\"}")).andExpect(status().isForbidden());
 }
 @Test void lifecycleIsIdempotentAuditedAndNeverRewritesEvaluationEvidence() throws Exception {
  jdbc.update("INSERT INTO health_observation_evaluations(observation_id,astronaut_id,metric_code,unit,outcome,alert_id,details) VALUES (?,?,'value','beats/min','ALERT_CREATED',?,'{\"secret\":\"DO_NOT_EXPOSE\"}')",observation,subject,ownAlert);
  String before=jdbc.queryForObject("SELECT to_jsonb(e)::text FROM health_observation_evaluations e WHERE alert_id=?",String.class,ownAlert);
  mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content("{\"note\":\"Fixture review\"}")).andExpect(status().isConflict());
  for(int repeat=0;repeat<2;repeat++) mvc.perform(post(path(ownAlert)+"/acknowledge").with(authentication(AuthService.authenticationFor(astronaut))).with(csrf()).contentType("application/json").content("{\"acknowledgedBy\":\"forged\",\"status\":\"RESOLVED\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.alert.status").value("ACKNOWLEDGED"));
  for(int repeat=0;repeat<2;repeat++) mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content("{\"note\":\"Fixture review\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.alert.status").value("RESOLVED"));
  mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content("{\"note\":\"Different review\"}")).andExpect(status().isConflict());
  mvc.perform(post(path(ownAlert)+"/acknowledge").with(authentication(AuthService.authenticationFor(astronaut))).with(csrf())).andExpect(status().isConflict());
  assertThat(jdbc.queryForObject("SELECT to_jsonb(e)::text FROM health_observation_evaluations e WHERE alert_id=?",String.class,ownAlert)).isEqualTo(before);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM alert_observations WHERE alert_id=?",Integer.class,ownAlert)).isEqualTo(1);
  assertThat(jdbc.queryForList("SELECT event_kind FROM health_alert_events WHERE alert_id=? ORDER BY event_sequence",String.class,ownAlert)).containsExactly("CREATED","EVIDENCE_ADDED","ACKNOWLEDGED","RESOLVED");
  assertThat(jdbc.queryForObject("SELECT acknowledged_by FROM health_alerts WHERE id=?",String.class,ownAlert)).isEqualTo(astronaut.accountId().toString());
  assertThat(jdbc.queryForObject("SELECT actor FROM health_alert_events WHERE alert_id=? AND event_kind='RESOLVED'",String.class,ownAlert)).isEqualTo(officer.accountId().toString());
 }
 @ParameterizedTest @ValueSource(strings={""," ","{}"})
 void resolutionRejectsMissingOrBlankNotes(String note) throws Exception {
  String body=note.equals("{}")?note:json.writeValueAsString(Map.of("note",note));
  mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
 }
 @ParameterizedTest @ValueSource(strings={"{","[]","{\"note\":null}"})
 void malformedResolutionBodiesHaveSafeErrors(String body) throws Exception {
  var result=mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest()).andReturn();
  assertThat(result.getResponse().getContentAsString()).doesNotContain("Exception","stackTrace","org.springframework");
 }
 @Test void oversizedResolutionNoteAndInvalidIdentifiersAreRejected() throws Exception {
  mvc.perform(post(path(ownAlert)+"/resolve").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("note","a".repeat(2001))))).andExpect(status().isBadRequest());
  mvc.perform(get("/api/alerts/not-a-uuid").with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isBadRequest());
  mvc.perform(get("/api/alerts").with(authentication(AuthService.authenticationFor(officer))).param("from","2026-01-01T00:00:00.0000001Z")).andExpect(status().isBadRequest());
 }
 @Test void loginSessionCanReadAndAcknowledgeOwnAlertAndLogoutRevokesAccess() throws Exception {
  String password="Disposable alert API session passphrase!";
  var a=accounts.findById(astronaut.accountId()).orElseThrow(); a.setPasswordHash(passwords.encode(password)); accounts.saveAndFlush(a);
  var login=mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("loginName",astronaut.loginName(),"password",password)))).andExpect(status().isOk()).andReturn();
  MockHttpSession session=(MockHttpSession)login.getRequest().getSession(false);
  mvc.perform(get("/api/alerts/me").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(ownAlert.toString()));
  mvc.perform(post(path(ownAlert)+"/acknowledge").session(session)).andExpect(status().isForbidden());
  mvc.perform(post(path(ownAlert)+"/acknowledge").session(session).with(csrf())).andExpect(status().isOk());
  mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());
  mvc.perform(get("/api/alerts/me")).andExpect(status().isUnauthorized());
 }
 @Test void detailReferencesExactRuleAndApprovedBaselineWithoutRawSnapshots() throws Exception {
  Instant future=Instant.parse("2090-01-01T00:00:00Z");
  signIn(officer);
  UUID proposal=baselines.propose(subject,new BaselineRequest("heart_rate","value","beats/min","UNKNOWN",scope,"ORIGINAL",BigDecimal.TEN,future,null,at,at,"Fixture review","Fixture",List.of(observation),null,null));
  signIn(account(AccountRole.NASA_OFFICER,null)); UUID baseline=baselines.approve(subject,proposal,"Independent fixture approval");
  UUID rule=jdbc.queryForObject("INSERT INTO monitoring_rules(rule_code,version,astronaut_id,indicator_code,metric_code,unit,activity_context,comparison_scope_id,lower_bound,upper_bound,severity,valid_from,source_name,rationale,provenance,limit_kind) VALUES (?,1,?,'heart_rate','value','beats/min','UNKNOWN',?,-1,1,'WARNING',?,'Fixture','Fixture','{\"secret\":\"DO_NOT_EXPOSE\"}','BASELINE_DELTA') RETURNING id",UUID.class,"alert-rule-"+UUID.randomUUID(),subject,scope,Timestamp.from(future));
  UUID obs=reading(subject,future);
  UUID alert=jdbc.queryForObject("INSERT INTO health_alerts(astronaut_id,severity,trigger_kind,monitoring_rule_id,source_name,reason,triggered_at) VALUES (?,'WARNING','RULE',?,'Fixture','Fixture violation',?) RETURNING id",UUID.class,subject,rule,Timestamp.from(future)); attach(alert,obs,subject);
  jdbc.update("INSERT INTO health_observation_evaluations(observation_id,astronaut_id,metric_code,unit,outcome,rule_id,baseline_id,alert_id,details) VALUES (?,?,'value','beats/min','ALERT_CREATED',?,?,?,'{\"lower_bound\":9,\"upper_bound\":11,\"secret\":\"DO_NOT_EXPOSE\"}')",obs,subject,rule,baseline,alert);
  var result=mvc.perform(get(path(alert)).with(authentication(AuthService.authenticationFor(astronaut)))).andExpect(status().isOk()).andExpect(jsonPath("$.rule.id").value(rule.toString())).andExpect(jsonPath("$.rule.version").value(1)).andExpect(jsonPath("$.rule.metric").value("value")).andExpect(jsonPath("$.baseline.id").value(baseline.toString())).andExpect(jsonPath("$.baseline.version").value(1)).andExpect(jsonPath("$.evaluation.observationId").value(obs.toString())).andExpect(jsonPath("$.evaluation.lowerBound").value(9)).andReturn();
  assertThat(result.getResponse().getContentAsString()).doesNotContain("DO_NOT_EXPOSE","approved_by","provenance","details");
  mvc.perform(post(path(alert)+"/acknowledge").with(authentication(AuthService.authenticationFor(officer))).with(csrf())).andExpect(status().isConflict());
  // V35 has a simple baseline FK: explicitly defend reads of malformed legacy links across subjects.
  UUID foreignAlert=manual(other,"WARNING",false,at),foreignObservation=reading(other,at.plusSeconds(2));
  attach(foreignAlert,foreignObservation,other);
  jdbc.update("INSERT INTO health_observation_evaluations(observation_id,astronaut_id,metric_code,unit,outcome,baseline_id,alert_id,details) VALUES (?,?,'value','beats/min','ALERT_CREATED',?,?,'{\"lower_bound\":9,\"upper_bound\":11}')",foreignObservation,other,baseline,foreignAlert);
  var otherAccount=account(AccountRole.ASTRONAUT,other);
  mvc.perform(get(path(foreignAlert)).with(authentication(AuthService.authenticationFor(otherAccount)))).andExpect(status().isOk()).andExpect(jsonPath("$.baseline").isEmpty()).andExpect(jsonPath("$.evaluation.lowerBound").isEmpty()).andExpect(jsonPath("$.evaluation.upperBound").isEmpty());
 }
 private String path(UUID id) {return "/api/alerts/"+id;}
 private UUID profile() {return astronauts.saveAndFlush(new Astronaut("alert-api-"+UUID.randomUUID(),"Alert API fixture")).getId();}
 private AccountIdentity account(AccountRole role,UUID id) {Account a=accounts.saveAndFlush(new Account("alert."+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),role,id));return new AccountIdentity(a.getId(),a.getLoginName(),role,null);}
 private UUID manual(UUID id,String severity,boolean synthetic,Instant time) {return jdbc.queryForObject("INSERT INTO health_alerts(astronaut_id,severity,trigger_kind,source_name,reason,triggered_at,is_synthetic,provenance) VALUES (?,?,'MANUAL','Fixture','Fixture review',?,?,'{\"secret\":\"DO_NOT_EXPOSE\"}') RETURNING id",UUID.class,id,severity,Timestamp.from(time),synthetic);}
 private UUID reading(UUID id,Instant time) {UUID obs=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,provenance) VALUES (?,'heart_rate','SCALAR',?,'UNKNOWN',?,'DEVICE','Fixture','{\"secret\":\"DO_NOT_EXPOSE\"}') RETURNING id",UUID.class,id,scope,Timestamp.from(time));jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',10,'beats/min')",obs);return obs;}
 private void attach(UUID alert,UUID obs,UUID id) {jdbc.update("INSERT INTO alert_observations(alert_id,observation_id,astronaut_id) VALUES (?,?,?)",alert,obs,id);}
 private void signIn(AccountIdentity actor) {SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(actor));}
}
