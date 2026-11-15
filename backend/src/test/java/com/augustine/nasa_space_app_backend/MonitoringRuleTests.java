package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Arbitrary fixture bounds only; no clinical thresholds are provisioned. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@Transactional
class MonitoringRuleTests extends PostgreSqlIntegrationTest {
 @Autowired MonitoringRuleService service;
 @Autowired PersonalBaselineService baselines;
 @Autowired AstronautRepository astronauts;
 @Autowired AccountRepository accounts;
 @Autowired JdbcTemplate jdbc;
 @Autowired MockMvc mvc;
 @Autowired ObjectMapper json;
 @Autowired org.springframework.context.ApplicationContext application;
 UUID subject,scope;
 AccountIdentity officer;
 Instant start=Instant.parse("2090-01-01T00:00:00Z");
 @BeforeEach void fixture() {
  subject=astronauts.saveAndFlush(new Astronaut("rule-"+UUID.randomUUID(),"Rule fixture")).getId();
  scope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='heart_rate' AND scope_code='default'",UUID.class);
  officer=account(AccountRole.NASA_OFFICER,null); signIn(officer);
 }
 @AfterEach void clear() { SecurityContextHolder.clearContext(); }
 @ParameterizedTest @ValueSource(strings={"RESTING","SLEEPING","EXERCISING","UNKNOWN","OTHER"})
 void contextsAreExactAndRequireExplicitActivation(String context) {
  UUID id=service.create(request("rule",null,context,"ABSOLUTE","OPERATIONAL",BigDecimal.ONE,BigDecimal.TEN,start));
  assertThat(resolve(context,start).status()).isEqualTo("MISSING_RULE");
  service.activation(id,true,start,"Fixture activation");
  assertThat(resolve(context,start).ruleId()).isEqualTo(id);
  assertThat(resolve(context.equals("RESTING")?"UNKNOWN":"RESTING",start).status()).isEqualTo("MISSING_RULE");
  assertThat(resolve(context,start.minusSeconds(1)).status()).isEqualTo("MISSING_RULE");
  service.activation(id,false,start.plusSeconds(10),"Fixture deactivation");
  assertThat(resolve(context,start.plusSeconds(10)).status()).isEqualTo("MISSING_RULE");
  assertThat(resolve(context,start).ruleId()).isEqualTo(id);
  assertThat(service.history()).hasSize(1);
 }
 @Test void specificRulePrecedesGeneralAndEqualPriorityConflictFailsClosed() {
  UUID general=active(request("general",null,"RESTING","ABSOLUTE","OPERATIONAL",null,BigDecimal.TEN,start));
  assertThat(resolve("RESTING",start).ruleId()).isEqualTo(general);
  UUID personal=active(request("personal",subject,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start));
  assertThat(resolve("RESTING",start).ruleId()).isEqualTo(personal);
  active(request("conflicting",subject,"RESTING","ABSOLUTE","OPERATIONAL",null,BigDecimal.TEN,start));
  assertThat(resolve("RESTING",start).status()).isEqualTo("CONFLICT");
 }
 @Test void versionsSupersedeProspectivelyAndNeverResurrectOldVersions() {
  UUID first=active(request("versioned",null,"RESTING","ABSOLUTE","OPERATIONAL",null,BigDecimal.TEN,start));
  Instant next=start.plusSeconds(10);
  UUID second=active(request("versioned",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,next));
  assertThat(resolve("RESTING",start).ruleId()).isEqualTo(first);
  assertThat(resolve("RESTING",next).ruleId()).isEqualTo(second);
  assertThat(resolve("RESTING",next).version()).isEqualTo(2);
  service.activation(second,false,next.plusSeconds(1),"Stop");
  assertThat(resolve("RESTING",next.plusSeconds(1)).status()).isEqualTo("MISSING_RULE");
 }
 @Test void missingBaselineIsExplicitAndLegacyBaselineIsNotApproved() {
  active(request("delta",subject,"RESTING","BASELINE_DELTA","OPERATIONAL",BigDecimal.ONE.negate(),BigDecimal.ONE,start));
  assertThat(resolve("RESTING",start).status()).isEqualTo("MISSING_BASELINE");
  jdbc.update("INSERT INTO personal_baselines(astronaut_id,indicator_code,metric_code,unit,activity_context,comparison_scope_id,baseline_kind,version,reference_value,effective_from,input_from,input_to,sample_count,method,source_name,provenance) VALUES (?,'heart_rate','value','beats/min','RESTING',?,'ORIGINAL',1,10,?,?,?,1,'Fixture','Fixture','{}')",subject,scope,java.sql.Timestamp.from(start),java.sql.Timestamp.from(start.minusSeconds(10)),java.sql.Timestamp.from(start.minusSeconds(1)));
  assertThat(resolve("RESTING",start).status()).isEqualTo("MISSING_BASELINE");
 }
 @Test void approvedBaselineDeltaUsesOnlyMatchingRealApprovedEvidence() {
  Instant input=Instant.parse("2026-01-01T00:00:00Z");
  UUID obs=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name) VALUES (?,'heart_rate','SCALAR',?,'RESTING',?,'DEVICE','Fixture') RETURNING id",UUID.class,subject,scope,java.sql.Timestamp.from(input));
  jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',10,'beats/min')",obs);
  UUID proposal=baselines.propose(subject,new BaselineRequest("heart_rate","value","beats/min","RESTING",scope,"ORIGINAL",BigDecimal.TEN,start,null,input,input,"Fixture","Fixture",List.of(obs),null,null));
  signIn(account(AccountRole.NASA_OFFICER,null));
  UUID baseline=baselines.approve(subject,proposal,"Independent fixture review");
  active(request("delta",subject,"RESTING","BASELINE_DELTA","OPERATIONAL",BigDecimal.ONE.negate(),BigDecimal.ONE,start));
  var result=resolve("RESTING",start);
  assertThat(result.baselineId()).isEqualTo(baseline);
  assertThat(result.lowerBound()).isEqualByComparingTo("9");
  assertThat(result.upperBound()).isEqualByComparingTo("11");
 }
 @Test void unitAndScopeMustMatchWithoutConversion() {
  active(request("exact",null,"RESTING","ABSOLUTE","OPERATIONAL",null,BigDecimal.TEN,start));
  assertThatThrownBy(()->service.resolve(subject,"heart_rate","value","bpm","RESTING",scope,start)).isInstanceOf(BaselineException.class);
  assertThatThrownBy(()->service.resolve(subject,"heart_rate","value","beats/min","RESTING",UUID.randomUUID(),start)).isInstanceOf(BaselineException.class);
  UUID other=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind) VALUES (?,'heart_rate','SCALAR') RETURNING id",UUID.class,"other-"+UUID.randomUUID());
  assertThat(service.resolve(subject,"heart_rate","value","beats/min","RESTING",other,start).status()).isEqualTo("MISSING_RULE");
 }
 @Test void baselineOffsetsCannotProduceBoundsOutsideMetricStorageDomain() {
  UUID pressureScope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='blood_pressure' AND scope_code='default'",UUID.class);
  Instant input=Instant.parse("2026-01-01T00:00:00Z");
  UUID obs=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name) VALUES (?,'blood_pressure','BLOOD_PRESSURE',?,'RESTING',?,'DEVICE','Fixture') RETURNING id",UUID.class,subject,pressureScope,java.sql.Timestamp.from(input));
  jdbc.update("INSERT INTO blood_pressure_observations(observation_id,systolic,diastolic) VALUES (?,10,5)",obs);
  UUID proposal=baselines.propose(subject,new BaselineRequest("blood_pressure","systolic","mmHg","RESTING",pressureScope,"ORIGINAL",BigDecimal.TEN,start,null,input,input,"Fixture","Fixture",List.of(obs),null,null));
  signIn(account(AccountRole.NASA_OFFICER,null));
  UUID baseline=baselines.approve(subject,proposal,"Independent fixture review");
  UUID rule=active(new MonitoringRuleRequest("invalid-offset",subject,"blood_pressure","systolic","mmHg","RESTING",pressureScope,new BigDecimal("-20"),null,"BASELINE_DELTA","WARNING","OPERATIONAL",start,null,"Fixture","fixture:arbitrary","Fixture","Fixture approval"));
  var result=service.resolve(subject,"blood_pressure","systolic","mmHg","RESTING",pressureScope,start);
  assertThat(result.status()).isEqualTo("INVALID_BASELINE_BOUNDS");
  assertThat(result.ruleId()).isEqualTo(rule);
  assertThat(result.baselineId()).isEqualTo(baseline);
  assertThat(result.lowerBound()).isNull();
 }
 @Test void rejectsInvalidBoundsPrecisionDirectionAndMissingSource() {
  assertThatThrownBy(()->service.create(request("bad",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.TEN,BigDecimal.ONE,start))).isInstanceOf(BaselineException.class);
  assertThatThrownBy(()->service.create(request("bad",null,"RESTING","ABSOLUTE","OPERATIONAL",null,null,start))).isInstanceOf(BaselineException.class);
  assertThatThrownBy(()->service.create(request("bad",null,"RESTING","ABSOLUTE","OPERATIONAL",new BigDecimal("0.0000001"),null,start))).isInstanceOf(BaselineException.class);
  assertThatThrownBy(()->service.create(request("bad",null,"RESTING","BASELINE_DELTA","OPERATIONAL",BigDecimal.ONE,null,start))).isInstanceOf(BaselineException.class);
  var r=request("bad",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start);
  assertThatThrownBy(()->service.create(new MonitoringRuleRequest(r.ruleCode(),null,r.indicatorCode(),r.metricCode(),r.unit(),r.activityContext(),scope,r.lowerBound(),null,r.limitKind(),r.severity(),r.designation(),start,null,"",r.sourceReference(),r.rationale(),r.approvalNote()))).isInstanceOf(BaselineException.class);
 }
 @Test void demoRequiresExplicitConfigurationAndSyntheticScope() {
  assertThatThrownBy(()->service.create(request("demo",null,"RESTING","ABSOLUTE","SYNTHETIC_DEMO",BigDecimal.ONE,null,start))).isInstanceOf(BaselineException.class);
  UUID real=scope;
  scope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind) VALUES ('synthetic-fixture','heart_rate','SCALAR') RETURNING id",UUID.class);
  assertThatThrownBy(()->service.create(request("demo",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start))).isInstanceOf(BaselineException.class);
  assertThatThrownBy(()->service.create(request("demo",null,"RESTING","ABSOLUTE","SYNTHETIC_DEMO",BigDecimal.ONE,null,start))).isInstanceOf(BaselineException.class);
  assertThat(resolve("RESTING",start).status()).isEqualTo("DEMO_DISABLED");
  scope=real;
 }
 @Test void disabledOfficerCannotWriteAndAstronautCannotManageOrReadOthers() throws Exception {
  var owner=account(AccountRole.ASTRONAUT,subject);
  mvc.perform(get("/api/monitoring-rules").with(authentication(AuthService.authenticationFor(owner)))).andExpect(status().isForbidden());
  mvc.perform(post("/api/monitoring-rules").with(authentication(AuthService.authenticationFor(owner))).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  UUID other=astronauts.saveAndFlush(new Astronaut("other-"+UUID.randomUUID(),"Other")).getId();
  signIn(owner);
  assertThatThrownBy(()->service.resolve(other,"heart_rate","value","beats/min","RESTING",scope,start)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
  signIn(officer); var disabled=accounts.findById(officer.accountId()).orElseThrow(); disabled.setEnabled(false); accounts.saveAndFlush(disabled);
  assertThatThrownBy(()->service.create(request("disabled",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start))).isInstanceOf(org.springframework.security.core.AuthenticationException.class);
 }
 @Test void httpCreationActivationHistorySelectionAndCsrf() throws Exception {
  String body=json.writeValueAsString(request("http",null,"RESTING","ABSOLUTE","OPERATIONAL",null,BigDecimal.TEN,start));
  mvc.perform(get("/api/monitoring-rules")).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/monitoring-rules").with(authentication(AuthService.authenticationFor(officer))).contentType("application/json").content(body)).andExpect(status().isForbidden());
  var response=mvc.perform(post("/api/monitoring-rules").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn();
  String id=json.readTree(response.getResponse().getContentAsString()).get("ruleId").asText();
  String activation="{\"active\":true,\"effectiveAt\":\""+start+"\",\"note\":\"Fixture\"}";
  mvc.perform(post("/api/monitoring-rules/"+id+"/activation").with(authentication(AuthService.authenticationFor(officer))).contentType("application/json").content(activation)).andExpect(status().isForbidden());
  mvc.perform(post("/api/monitoring-rules/"+id+"/activation").with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content(activation)).andExpect(status().isNoContent());
  mvc.perform(get("/api/monitoring-rules").with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isOk());
  mvc.perform(get("/api/crew/"+subject+"/monitoring-rules/selection").with(authentication(AuthService.authenticationFor(officer))).param("indicator","heart_rate").param("metric","value").param("unit","beats/min").param("context","RESTING").param("scope",scope.toString()).param("at",start.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SELECTED"));
 }
 @Test void databaseRetainsRuleContents() {
  UUID id=service.create(request("immutable",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start));
  assertThatThrownBy(()->jdbc.update("UPDATE monitoring_rules SET lower_bound=2 WHERE id=?",id)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
 }
 @ParameterizedTest @ValueSource(strings={"heart_rate/value","blood_pressure/systolic","blood_pressure/diastolic","blood_sugar/value","body_temperature/value","sleep_hours/duration","mood/score","muscle/grip_strength","muscle/muscle_mass","bone_mineral_density/areal_density","cumulative_absorbed_radiation_dose/value"})
 void everyCatalogMetricHasIndependentRuleDimensions(String dimension) {
  String indicator=dimension.split("/")[0],metric=dimension.split("/")[1];
  String unit=jdbc.queryForObject("SELECT unit FROM indicator_metrics WHERE indicator_code=? AND metric_code=?",String.class,indicator,metric);
  UUID metricScope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,protocol_code,protocol_version,scale_name,scale_version,scale_min,scale_max,radiation_astronaut_id,accumulation_started_at,dosimetry_method) "
   +"SELECT ?,code,storage_kind,CASE WHEN storage_kind IN ('MUSCLE','BONE') OR code='cumulative_absorbed_radiation_dose' THEN 'Fixture site' END,"
   +"CASE WHEN storage_kind IN ('MUSCLE','BONE') THEN 'Fixture protocol' END,CASE WHEN storage_kind IN ('MUSCLE','BONE') THEN '1' END,"
   +"CASE WHEN storage_kind='MOOD' THEN 'Fixture scale' END,CASE WHEN storage_kind='MOOD' THEN '1' END,"
   +"CASE WHEN storage_kind='MOOD' THEN 0 END,CASE WHEN storage_kind='MOOD' THEN 10 END,"
   +"CASE WHEN code='cumulative_absorbed_radiation_dose' THEN ?::uuid END,CASE WHEN code='cumulative_absorbed_radiation_dose' THEN ?::timestamptz END,"
   +"CASE WHEN code='cumulative_absorbed_radiation_dose' THEN 'Fixture dosimetry' END FROM health_indicators WHERE code=? RETURNING id",
   UUID.class,"metric-"+UUID.randomUUID(),subject,java.sql.Timestamp.from(start.minusSeconds(10)),indicator);
  var request=new MonitoringRuleRequest("metric",subject,indicator,metric,unit,"UNKNOWN",metricScope,BigDecimal.ONE,BigDecimal.TEN,"ABSOLUTE","INFO","OPERATIONAL",start,null,"Fixture","fixture:metric","Fixture only","Fixture approval");
  UUID id=active(request);
  var result=service.resolve(subject,indicator,metric,unit,"UNKNOWN",metricScope,start);
  assertThat(result.ruleId()).isEqualTo(id);
  assertThat(result.severity()).isEqualTo("INFO");
  if(indicator.equals("blood_pressure") || indicator.equals("muscle")) {
   var other=jdbc.queryForList("SELECT metric_code,unit FROM indicator_metrics WHERE indicator_code=? AND metric_code<>?",indicator,metric).get(0);
   assertThat(service.resolve(subject,indicator,(String)other.get("metric_code"),(String)other.get("unit"),"UNKNOWN",metricScope,start).status()).isEqualTo("MISSING_RULE");
  }
 }
 @Test void explicitlyEnabledDemoIsNonclinicalAndNeverLeaksIntoRealScopes() {
  MonitoringRuleService demo=new MonitoringRuleService(jdbc,application.getBean(AuthService.class),accounts,
   application.getBean(AstronautService.class),baselines,application.getBean(jakarta.validation.Validator.class),json,application.getBean(java.time.Clock.class),true);
  UUID real=scope;
  scope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind) VALUES ('synthetic-enabled-fixture','heart_rate','SCALAR') RETURNING id",UUID.class);
  UUID id=demo.create(request("enabled-demo",null,"RESTING","ABSOLUTE","SYNTHETIC_DEMO",BigDecimal.ONE,null,start));
  demo.activation(id,true,start,"Demo only");
  var result=demo.resolve(subject,"heart_rate","value","beats/min","RESTING",scope,start);
  assertThat(result.designation()).isEqualTo("SYNTHETIC_DEMO");
  assertThat(jdbc.queryForObject("SELECT provenance->>'nonclinical' FROM monitoring_rules WHERE id=?",String.class,id)).isEqualTo("true");
  assertThat(demo.resolve(subject,"heart_rate","value","beats/min","RESTING",real,start).status()).isEqualTo("MISSING_RULE");
  assertThatThrownBy(()->demo.create(request("demo-baseline",subject,"RESTING","BASELINE_DELTA","SYNTHETIC_DEMO",BigDecimal.ONE.negate(),null,start))).isInstanceOf(BaselineException.class);
 }
 @Test void draftVersionDoesNotSuppressPublishedRuleAndDatesAreHalfOpen() {
  UUID original=active(request("draft",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start));
  service.create(request("draft",null,"RESTING","ABSOLUTE","OPERATIONAL",null,BigDecimal.TEN,start.plusSeconds(1)));
  assertThat(resolve("RESTING",start.plusSeconds(2)).ruleId()).isEqualTo(original);
  var r=request("period",subject,"RESTING","ABSOLUTE","OPERATIONAL",null,BigDecimal.TEN,start);
  active(new MonitoringRuleRequest(r.ruleCode(),subject,r.indicatorCode(),r.metricCode(),r.unit(),r.activityContext(),scope,null,BigDecimal.TEN,r.limitKind(),"CRITICAL",r.designation(),start,start.plusSeconds(5),r.sourceName(),r.sourceReference(),r.rationale(),r.approvalNote()));
  assertThat(resolve("RESTING",start).severity()).isEqualTo("CRITICAL");
  assertThat(resolve("RESTING",start.plusSeconds(5)).ruleId()).isEqualTo(original);
 }
 @Test void databaseRetainsActivationHistory() {
  UUID id=active(request("immutable-event",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start));
  assertThatThrownBy(()->jdbc.update("DELETE FROM monitoring_rule_events WHERE rule_id=?",id)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
 }
 @Test void databaseRejectsDimensionChangesAcrossVersions() {
  service.create(request("stable-series",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start));
  assertThatThrownBy(()->service.create(request("stable-series",null,"SLEEPING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start.plusSeconds(1)))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
 }
 @Test void databaseRejectsNonadvancingActivationEvents() {
  UUID id=active(request("event-order",null,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start));
  assertThatThrownBy(()->service.activation(id,false,start,"Cannot rewrite history")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
 }
 @Test void archivedAstronautCannotReceiveRuleActivation() {
  UUID id=service.create(request("archived",subject,"RESTING","ABSOLUTE","OPERATIONAL",BigDecimal.ONE,null,start));
  jdbc.update("UPDATE astronauts SET archived_at=CURRENT_TIMESTAMP WHERE id=?",subject);
  assertThatThrownBy(()->service.activation(id,true,start,"Cannot activate archived subject")).isInstanceOf(BaselineException.class);
 }
 @Test void legacyRowsWithoutApprovalCannotBeActivated() {
  UUID id=jdbc.queryForObject("INSERT INTO monitoring_rules(rule_code,version,indicator_code,metric_code,unit,activity_context,comparison_scope_id,upper_bound,severity,valid_from,source_name,rationale,provenance) VALUES ('legacy',1,'heart_rate','value','beats/min','RESTING',?,10,'INFO',?,'Fixture','Fixture','{}') RETURNING id",UUID.class,scope,java.sql.Timestamp.from(start));
  assertThatThrownBy(()->service.activation(id,true,start,"Legacy is not approved")).isInstanceOf(BaselineException.class);
 }
 private UUID active(MonitoringRuleRequest r) { UUID id=service.create(r); service.activation(id,true,r.validFrom(),"Fixture only"); return id; }
 private MonitoringRuleRequest request(String code,UUID astronaut,String context,String kind,String designation,BigDecimal lower,BigDecimal upper,Instant from) {
  return new MonitoringRuleRequest(code,astronaut,"heart_rate","value","beats/min",context,scope,lower,upper,kind,"WARNING",designation,from,null,"Test fixture","fixture:arbitrary-nonclinical","Test only","Officer fixture approval");
 }
 private MonitoringRuleResolver.Resolution resolve(String context,Instant at) { return service.resolve(subject,"heart_rate","value","beats/min",context,scope,at); }
 private AccountIdentity account(AccountRole role,UUID astronaut) {
  Account a=accounts.saveAndFlush(new Account("rule."+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),role,astronaut));
  return new AccountIdentity(a.getId(),a.getLoginName(),role,null);
 }
 private void signIn(AccountIdentity identity) { SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(identity)); }
}
