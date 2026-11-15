package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.MonitoringRuleRequest;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties={"astrohealth.monitoring.evaluation-enabled=true","astrohealth.monitoring.demo-enabled=true","astrohealth.monitoring.initial-delay-ms=3600000"})
@Transactional
class HealthEvaluationIngestionTests extends SimulationIngestionTestSupport {
 @Autowired ObservationEvaluationOutbox outbox;
 @Autowired MonitoringRuleService rules;
 @Autowired Clock clock;
 @Test void successfulIngestionEnqueuesOnceAndDuplicateReceiptsDoNotReevaluate() throws Exception {
  var f=fixture(); var body=bytes(page(f,item(f,"heart_rate")));
  var first=as(f.officer(),()->ingestion.ingest(f.capture(),body));
  as(f.officer(),()->ingestion.ingest(f.capture(),body));
  UUID id=first.results().get(0).observationId();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_evaluation_outbox WHERE observation_id=?",Integer.class,id)).isEqualTo(1);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_observation_evaluations WHERE observation_id=?",Integer.class,id)).isZero();
  assertThat(jdbc.queryForObject("SELECT completed_at IS NULL FROM health_evaluation_outbox WHERE observation_id=?",Boolean.class,id)).isTrue();
 }
 @Test void enabledSyntheticViolationsAreExplicitlyNonclinicalAndKeepConfiguredSeverity() throws Exception {
  var f=fixture(); Instant at=Instant.parse("2090-01-01T00:00:00Z");
  UUID scope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind) VALUES (?,'heart_rate','SCALAR') RETURNING id",UUID.class,"synthetic-evaluation-"+UUID.randomUUID());
  UUID rule=as(f.officer(),()->rules.create(new MonitoringRuleRequest("demo-evaluation-"+UUID.randomUUID(),null,"heart_rate","value","beats/min","UNKNOWN",scope,null,BigDecimal.TEN,"ABSOLUTE","CRITICAL","SYNTHETIC_DEMO",at,null,"Fixture","fixture:nonclinical","Fixture only","Fixture approval")));
  as(f.officer(),()->{rules.activation(rule,true,at,"Nonclinical fixture"); return null;});
  UUID id=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,simulation_metadata,provenance) VALUES (?,'heart_rate','SCALAR',?,'UNKNOWN',?,'SIMULATION','Fixture','{\"synthetic\":true}','{\"demonstration_only\":true}') RETURNING id",UUID.class,f.astronaut(),scope,Timestamp.from(at));
  jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',11,'beats/min')",id);
  outbox.enqueueNewObservation(id);
  // Same test transaction makes uncommitted fixture evidence visible. Production uses the proxied REQUIRES_NEW consumer.
  new HealthObservationEvaluator(jdbc,rules,json,clock).processNext();
  var alert=jdbc.queryForMap("SELECT a.* FROM health_alerts a JOIN health_observation_evaluations e ON e.alert_id=a.id WHERE e.observation_id=?",id);
  assertThat(alert.get("is_synthetic")).isEqualTo(true);
  assertThat(alert.get("severity")).isEqualTo("CRITICAL");
  assertThat(alert.get("reason").toString()).startsWith("NONCLINICAL SYNTHETIC DEMO:");
  var provenance=json.readTree(alert.get("provenance").toString());
  assertThat(provenance.get("demonstration_only").asBoolean()).isTrue();
  assertThat(provenance.get("clinical_emergency").asBoolean()).isFalse();
  assertThat(provenance.get("simulation_metadata").get("synthetic").asBoolean()).isTrue();
 }
 @Test void evaluationIsNotExposedAsAnHttpEndpointAndIngestionStillRequiresCsrf() throws Exception {
  var f=fixture(); var body=bytes(page(f,item(f,"heart_rate")));
  mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(post("/api/monitoring/evaluate").with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(get("/api/alerts").with(authentication(officerAuthentication(f.officer())))).andExpect(status().isOk());
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_evaluation_outbox q JOIN health_observations o ON o.id=q.observation_id WHERE o.astronaut_id=?",Integer.class,f.astronaut())).isZero();
 }
 @Test void sharedDefaultScopesKeepSyntheticAndRealRulesStrictlySeparate() throws Exception {
  var f=fixture(); Instant at=Instant.parse("2090-01-01T00:00:00Z");
  UUID scope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='heart_rate' AND scope_code='default'",UUID.class);
  UUID demo=as(f.officer(),()->rules.create(new MonitoringRuleRequest("shared-demo-"+UUID.randomUUID(),null,"heart_rate","value","beats/min","UNKNOWN",scope,null,BigDecimal.ONE,"ABSOLUTE","CRITICAL","SYNTHETIC_DEMO",at,null,"Fixture","fixture:nonclinical","Nonclinical integration assertion","Fixture approval")));
  UUID real=as(f.officer(),()->rules.create(new MonitoringRuleRequest("shared-real-"+UUID.randomUUID(),null,"heart_rate","value","beats/min","UNKNOWN",scope,null,new BigDecimal("100"),"ABSOLUTE","WARNING","OPERATIONAL",at,null,"Fixture","fixture:operational","Test only","Fixture approval")));
  as(f.officer(),()->{rules.activation(demo,true,at,"Demo only");rules.activation(real,true,at,"Real source only");return null;});
  assertThat(as(f.officer(),()->rules.resolve(f.astronaut(),"heart_rate","value","beats/min","UNKNOWN",scope,at)).ruleId()).isEqualTo(real);
  UUID synthetic=sharedReading(f,scope,at,true),actual=sharedReading(f,scope,at,false);
  var engine=new HealthObservationEvaluator(jdbc,rules,json,clock); while(engine.processNext()) { }
  assertThat(jdbc.queryForObject("SELECT outcome FROM health_observation_evaluations WHERE observation_id=?",String.class,synthetic)).isEqualTo("ALERT_CREATED");
  assertThat(jdbc.queryForObject("SELECT rule_id FROM health_observation_evaluations WHERE observation_id=?",UUID.class,synthetic)).isEqualTo(demo);
  assertThat(jdbc.queryForObject("SELECT a.is_synthetic FROM health_alerts a JOIN health_observation_evaluations e ON e.alert_id=a.id WHERE e.observation_id=?",Boolean.class,synthetic)).isTrue();
  assertThat(jdbc.queryForObject("SELECT outcome FROM health_observation_evaluations WHERE observation_id=?",String.class,actual)).isEqualTo("WITHIN_BOUNDS");
  assertThat(jdbc.queryForObject("SELECT rule_id FROM health_observation_evaluations WHERE observation_id=?",UUID.class,actual)).isEqualTo(real);
 }
 @Test void syntheticDefaultScopeNeverFallsBackToOperationalRules() throws Exception {
  var f=fixture(); Instant at=Instant.parse("2090-01-01T00:00:00Z");
  UUID scope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='heart_rate' AND scope_code='default'",UUID.class);
  UUID real=as(f.officer(),()->rules.create(new MonitoringRuleRequest("no-demo-fallback-"+UUID.randomUUID(),null,"heart_rate","value","beats/min","UNKNOWN",scope,null,BigDecimal.ONE,"ABSOLUTE","CRITICAL","OPERATIONAL",at,null,"Fixture","fixture:operational","Test only","Fixture approval")));
  as(f.officer(),()->{rules.activation(real,true,at,"Fixture");return null;});
  UUID id=sharedReading(f,scope,at,true);
  new HealthObservationEvaluator(jdbc,rules,json,clock).processNext();
  assertThat(jdbc.queryForObject("SELECT outcome FROM health_observation_evaluations WHERE observation_id=?",String.class,id)).isEqualTo("MISSING_RULE");
 }
 private UUID sharedReading(Fixture f,UUID scope,Instant at,boolean synthetic) {
  UUID id=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,simulation_metadata) VALUES (?,'heart_rate','SCALAR',?,'UNKNOWN',?,?,'Fixture',?::jsonb) RETURNING id",UUID.class,f.astronaut(),scope,Timestamp.from(at),synthetic?"SIMULATION":"DEVICE",synthetic?"{\"synthetic\":true}":null);
  jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',10,'beats/min')",id);
  outbox.enqueueNewObservation(id); return id;
 }
}
