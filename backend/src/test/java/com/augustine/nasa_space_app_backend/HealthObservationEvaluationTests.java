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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;

/** Disposable PostgreSQL fixtures only. These arbitrary numbers are not clinical policy. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
 "spring.flyway.schemas=health_evaluation_tests","spring.flyway.default-schema=health_evaluation_tests",
 "spring.datasource.hikari.connection-init-sql=SET search_path TO health_evaluation_tests",
 "spring.jpa.properties.hibernate.default_schema=health_evaluation_tests"})
class HealthObservationEvaluationTests extends PostgreSqlIntegrationTest {
 @Autowired JdbcTemplate jdbc;
 @Autowired PlatformTransactionManager manager;
 @Autowired HealthObservationEvaluator engine;
 @Autowired MonitoringRuleService rules;
 @Autowired PersonalBaselineService baselines;
 @Autowired ObservationEvaluationOutbox disabledOutbox;
 @Autowired AstronautRepository astronauts;
 @Autowired AccountRepository accounts;
 UUID subject,scope;
 AccountIdentity officer;
 Instant start=Instant.parse("2090-01-01T00:00:00Z");
 @BeforeEach void setup() {
  tx(()->{
   subject=astronauts.saveAndFlush(new Astronaut("evaluate-"+UUID.randomUUID(),"Evaluation fixture")).getId();
   officer=identity();
   scope=scope("heart_rate",false);
   return null;
  });
 }
 @AfterEach void clear() { SecurityContextHolder.clearContext(); }
 @ParameterizedTest @ValueSource(strings={"heart_rate/value","blood_pressure/systolic","blood_pressure/diastolic","blood_sugar/value","body_temperature/value","sleep_hours/duration","mood/score","muscle/grip_strength","muscle/muscle_mass","bone_mineral_density/areal_density","cumulative_absorbed_radiation_dose/value"})
 void allElevenMetricsGenerateOnlyConfiguredViolations(String dimension) {
  String indicator=dimension.split("/")[0],metric=dimension.split("/")[1];
  UUID s=tx(()->scope(indicator,false));
  UUID rule=rule(indicator,metric,s,"UNKNOWN","CRITICAL","ABSOLUTE",null,BigDecimal.TEN,indicator.equals("cumulative_absorbed_radiation_dose"));
  UUID observation=observation(indicator,s,"UNKNOWN",new BigDecimal("11"),start,false,null);
  drain();
  var result=result(observation,metric);
  assertThat(result.get("outcome")).isEqualTo("ALERT_CREATED");
  assertThat(result.get("rule_id")).isEqualTo(rule);
  var alert=jdbc.queryForMap("SELECT * FROM health_alerts WHERE id=?",result.get("alert_id"));
  assertThat(alert.get("severity")).isEqualTo("CRITICAL");
  assertThat(alert.get("is_synthetic")).isEqualTo(false);
  assertThat(((Timestamp)alert.get("triggered_at")).toInstant()).isEqualTo(start);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM alert_observations WHERE alert_id=? AND observation_id=? AND astronaut_id=?",Integer.class,result.get("alert_id"),observation,subject)).isEqualTo(1);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_alert_events WHERE alert_id=?",Integer.class,result.get("alert_id"))).isEqualTo(2);
 }
 @ParameterizedTest @ValueSource(strings={"WARNING","CRITICAL","INFO"})
 void severityComesFromRuleAndInclusiveBoundsDoNotAlert(String severity) {
  rule("heart_rate","value",scope,"RESTING",severity,"ABSOLUTE",BigDecimal.ONE,BigDecimal.TEN,false);
  UUID low=observation("heart_rate",scope,"RESTING",BigDecimal.ZERO,start,false,null);
  UUID boundary=observation("heart_rate",scope,"RESTING",BigDecimal.TEN,start.plusSeconds(1),false,null);
  UUID high=observation("heart_rate",scope,"RESTING",new BigDecimal("1000"),start.plusSeconds(2),false,null);
  drain();
  assertThat(result(boundary,"value").get("outcome")).isEqualTo("WITHIN_BOUNDS");
  for(UUID id:List.of(low,high)) assertThat(jdbc.queryForObject("SELECT a.severity FROM health_alerts a JOIN health_observation_evaluations e ON e.alert_id=a.id WHERE e.observation_id=?",String.class,id)).isEqualTo(severity);
 }
 @ParameterizedTest @ValueSource(strings={"RESTING","SLEEPING","EXERCISING","UNKNOWN","OTHER"})
 void contextsAndScopeMatchExactly(String context) {
  rule("heart_rate","value",scope,context,"WARNING","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID exact=observation("heart_rate",scope,context,new BigDecimal("11"),start,false,null);
  UUID mismatch=observation("heart_rate",scope,context.equals("UNKNOWN")?"RESTING":"UNKNOWN",new BigDecimal("11"),start,false,null);
  UUID other=tx(()->scope("heart_rate",false));
  UUID scoped=observation("heart_rate",other,context,new BigDecimal("11"),start,false,null);
  drain();
  assertThat(result(exact,"value").get("outcome")).isEqualTo("ALERT_CREATED");
  assertThat(result(mismatch,"value").get("outcome")).isEqualTo("MISSING_RULE");
  assertThat(result(scoped,"value").get("outcome")).isEqualTo("MISSING_RULE");
 }
 @Test void missingInactiveConflictingAndMissingBaselineAreExplicitNonAlerts() {
  UUID missing=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,false,null);
  drain(); assertThat(result(missing,"value").get("outcome")).isEqualTo("MISSING_RULE");
  UUID inactive=tx(()->createRule("heart_rate","value",scope,"RESTING","WARNING","ABSOLUTE",null,BigDecimal.TEN,false));
  UUID inactiveObs=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,false,null);
  drain(); assertThat(result(inactiveObs,"value").get("outcome")).isEqualTo("MISSING_RULE");
  tx(()->{ signIn(officer); rules.activation(inactive,true,start,"Fixture approval"); return null; });
  rule("heart_rate","value",scope,"RESTING","CRITICAL","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID conflict=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,false,null);
  rule("heart_rate","value",scope,"RESTING","WARNING","BASELINE_DELTA",BigDecimal.ONE.negate(),BigDecimal.ONE,true);
  UUID noBaseline=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,false,null);
  // Both are evaluated against the current configured personal rule, which precedes conflicting general rules.
  drain();
  assertThat(result(noBaseline,"value").get("outcome")).isEqualTo("MISSING_BASELINE");
  assertThat(result(conflict,"value").get("outcome")).isEqualTo("MISSING_BASELINE");
 }
 @Test void equalPriorityConflictsNeverGenerateAnAlert() {
  rule("heart_rate","value",scope,"RESTING","WARNING","ABSOLUTE",null,BigDecimal.TEN,false);
  rule("heart_rate","value",scope,"RESTING","CRITICAL","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID id=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,false,null);
  drain(); assertThat(result(id,"value").get("outcome")).isEqualTo("CONFLICT");
 }
 @Test void ruleVersionsAreSelectedByObservationTimeAndRecordedExactly() {
  UUID first=rule("heart_rate","value",scope,"RESTING","WARNING","ABSOLUTE",null,BigDecimal.TEN,false);
  String code=jdbc.queryForObject("SELECT rule_code FROM monitoring_rules WHERE id=?",String.class,first);
  UUID second=tx(()->{
   signIn(officer);
   UUID id=rules.create(new MonitoringRuleRequest(code,null,"heart_rate","value","beats/min","RESTING",scope,null,BigDecimal.TEN,"ABSOLUTE","CRITICAL","OPERATIONAL",start.plusSeconds(10),null,"Fixture","fixture:version","Fixture only","Fixture approval"));
   rules.activation(id,true,start.plusSeconds(10),"Fixture activation"); return id;
  });
  UUID later=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start.plusSeconds(10),false,null);
  UUID earlier=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start.plusSeconds(5),false,null);
  drain();
  assertThat(result(earlier,"value").get("rule_id")).isEqualTo(first);
  assertThat(result(later,"value").get("rule_id")).isEqualTo(second);
  assertThat(jdbc.queryForObject("SELECT details->>'rule_version' FROM health_observation_evaluations WHERE observation_id=?",String.class,later)).isEqualTo("2");
 }
 @Test void invalidBaselineBoundsAreAuditedWithoutAlerts() {
  UUID s=tx(()->scope("blood_pressure",false));
  Instant input=Instant.parse("2026-01-01T00:00:00Z");
  UUID evidence=observation("blood_pressure",s,"RESTING",BigDecimal.TEN,input,false,null); drain();
  tx(()->{
   signIn(officer);
   UUID proposal=baselines.propose(subject,new BaselineRequest("blood_pressure","systolic","mmHg","RESTING",s,"ORIGINAL",BigDecimal.TEN,start,null,input,input,"Fixture review","Fixture",List.of(evidence),null,null));
   signIn(identity()); baselines.approve(subject,proposal,"Independent fixture approval"); return null;
  });
  rule("blood_pressure","systolic",s,"RESTING","WARNING","BASELINE_DELTA",new BigDecimal("-20"),null,true);
  UUID id=observation("blood_pressure",s,"RESTING",new BigDecimal("11"),start,false,null); drain();
  assertThat(result(id,"systolic").get("outcome")).isEqualTo("INVALID_BASELINE_BOUNDS");
  assertThat(result(id,"systolic").get("alert_id")).isNull();
 }
 @Test void rolledBackIngestionDoesNotLeaveAnEvaluationJob() {
  UUID[] id=new UUID[1];
  assertThatThrownBy(()->tx(()->{
   id[0]=header("heart_rate",scope,"UNKNOWN",start,false,null);
   jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',11,'beats/min')",id[0]);
   enqueue(id[0]); throw new IllegalStateException("Fixture ingestion rollback");
  })).isInstanceOf(IllegalStateException.class);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_observations WHERE id=?",Integer.class,id[0])).isZero();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_evaluation_outbox WHERE observation_id=?",Integer.class,id[0])).isZero();
 }
 @Test void approvedBaselineIsReferencedByRelativeAlert() {
  UUID evidence=observation("heart_rate",scope,"RESTING",BigDecimal.TEN,Instant.parse("2026-01-01T00:00:00Z"),false,null);
  drain();
  UUID baseline=tx(()->{
   signIn(officer);
   Instant input=Instant.parse("2026-01-01T00:00:00Z");
   UUID proposal=baselines.propose(subject,new BaselineRequest("heart_rate","value","beats/min","RESTING",scope,"ORIGINAL",BigDecimal.TEN,start,null,input,input,"Fixture review","Fixture",List.of(evidence),null,null));
   signIn(identity());
   return baselines.approve(subject,proposal,"Independent fixture approval");
  });
  rule("heart_rate","value",scope,"RESTING","WARNING","BASELINE_DELTA",BigDecimal.ONE.negate(),BigDecimal.ONE,true);
  UUID id=observation("heart_rate",scope,"RESTING",new BigDecimal("12"),start,false,null);
  drain();
  var result=result(id,"value");
  assertThat(result.get("baseline_id")).isEqualTo(baseline);
  assertThat(result.get("outcome")).isEqualTo("ALERT_CREATED");
  assertThat(jdbc.queryForObject("SELECT provenance->>'baseline_id' FROM health_alerts WHERE id=?",String.class,result.get("alert_id"))).isEqualTo(baseline.toString());
 }
 @Test void outOfOrderReadingsUseTheirOwnTimeAndRevisionsNeverRewriteEvidence() {
  rule("heart_rate","value",scope,"RESTING","WARNING","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID latest=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start.plusSeconds(20),false,null);
  drain();
  UUID historical=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start.minusSeconds(1),false,null);
  UUID old=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start.plusSeconds(10),false,null);
  UUID correction=observation("heart_rate",scope,"RESTING",BigDecimal.ONE,start.plusSeconds(10),false,old);
  UUID correctedLatest=observation("heart_rate",scope,"RESTING",BigDecimal.ONE,start.plusSeconds(20),false,latest);
  drain();
  assertThat(result(historical,"value").get("outcome")).isEqualTo("MISSING_RULE");
  assertThat(result(old,"value").get("outcome")).isEqualTo("SUPERSEDED");
  assertThat(result(correction,"value").get("outcome")).isEqualTo("WITHIN_BOUNDS");
  assertThat(result(correctedLatest,"value").get("outcome")).isEqualTo("WITHIN_BOUNDS");
  assertThat(result(latest,"value").get("outcome")).isEqualTo("ALERT_CREATED");
 }
 @Test void cumulativeRadiationIsComparedAsTotalAndOutOfOrderTotalsAreValidated() {
  UUID s=tx(()->scope("cumulative_absorbed_radiation_dose",false));
  rule("cumulative_absorbed_radiation_dose","value",s,"UNKNOWN","WARNING","ABSOLUTE",null,BigDecimal.TEN,true);
  UUID later=observation("cumulative_absorbed_radiation_dose",s,"UNKNOWN",new BigDecimal("12"),start.plusSeconds(20),false,null);
  UUID earlier=observation("cumulative_absorbed_radiation_dose",s,"UNKNOWN",new BigDecimal("9"),start.plusSeconds(10),false,null);
  drain();
  assertThat(result(later,"value").get("outcome")).isEqualTo("ALERT_CREATED");
  assertThat(result(earlier,"value").get("outcome")).isEqualTo("WITHIN_BOUNDS");
  UUID decreasing=observation("cumulative_absorbed_radiation_dose",s,"UNKNOWN",new BigDecimal("5"),start.plusSeconds(30),false,null);
  drain(); assertThat(result(decreasing,"value").get("outcome")).isEqualTo("INVALID_RADIATION");
 }
 @Test void unavailableMuscleComponentDoesNotProduceAnAlert() {
  UUID s=tx(()->scope("muscle",false));
  rule("muscle","muscle_mass",s,"RESTING","CRITICAL","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID id=tx(()->{ UUID o=header("muscle",s,"RESTING",start,false,null); jdbc.update("INSERT INTO muscle_assessments(observation_id,grip_strength_kgf) VALUES (?,11)",o); enqueue(o); return o; });
  drain(); assertThat(result(id,"muscle_mass").get("outcome")).isEqualTo("METRIC_UNAVAILABLE");
 }
 @Test void syntheticObservationsCannotUseRealRulesAndDisabledDemoIsExplicit() {
  rule("heart_rate","value",scope,"RESTING","CRITICAL","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID mismatch=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,true,null);
  UUID s=tx(()->scope("heart_rate",true));
  UUID disabled=observation("heart_rate",s,"RESTING",new BigDecimal("11"),start,true,null);
  drain();
  assertThat(result(mismatch,"value").get("outcome")).isEqualTo("SYNTHETIC_MISMATCH");
  assertThat(result(disabled,"value").get("outcome")).isEqualTo("DEMO_DISABLED");
 }
 @Test void repeatAndConcurrentConsumersProduceOneAlertAndOneOutcome() throws Exception {
  rule("heart_rate","value",scope,"RESTING","WARNING","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID id=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,false,null);
  tx(()->{ enqueue(id); enqueue(id); return null; });
  var executor=Executors.newFixedThreadPool(2);
  try {
   var gate=new CountDownLatch(1);
   var a=executor.submit(()->{gate.await(); return engine.processNext();});
   var b=executor.submit(()->{gate.await(); return engine.processNext();});
   gate.countDown(); a.get(30,TimeUnit.SECONDS); b.get(30,TimeUnit.SECONDS);
  } finally { executor.shutdownNow(); }
  tx(()->{ enqueue(id); return null; }); drain();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_observation_evaluations WHERE observation_id=?",Integer.class,id)).isEqualTo(1);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM alert_observations WHERE observation_id=?",Integer.class,id)).isEqualTo(1);
 }
 @Test void defaultOutboxDoesNotEnqueueLegacyOrNewDevelopmentFixtures() {
  UUID id=tx(()->{ UUID o=header("heart_rate",scope,"RESTING",start,false,null); jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',11,'beats/min')",o); disabledOutbox.enqueueNewObservation(o); return o; });
  drain();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_evaluation_outbox WHERE observation_id=?",Integer.class,id)).isZero();
 }
 @Test void evaluatorFailuresRollbackOnlyEvaluationAndRetryIsAudited() {
  rule("heart_rate","value",scope,"RESTING","WARNING","ABSOLUTE",null,BigDecimal.TEN,false);
  UUID id=observation("heart_rate",scope,"RESTING",new BigDecimal("11"),start,false,null);
  String name="fixture_failure_"+UUID.randomUUID().toString().replace("-","");
  jdbc.execute("CREATE FUNCTION "+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.observation_id='"+id+"'::uuid THEN RAISE EXCEPTION 'Test failure'; END IF; RETURN NEW; END $$");
  jdbc.execute("CREATE TRIGGER "+name+" BEFORE INSERT ON health_observation_evaluations FOR EACH ROW EXECUTE FUNCTION "+name+"()");
  try {
   new HealthEvaluationWorker(engine,jdbc,manager).drain();
   assertThat(jdbc.queryForObject("SELECT count(*) FROM health_observations WHERE id=?",Integer.class,id)).isEqualTo(1);
   assertThat(jdbc.queryForObject("SELECT count(*) FROM alert_observations WHERE observation_id=?",Integer.class,id)).isZero();
   assertThat(jdbc.queryForObject("SELECT count(*) FROM health_observation_evaluations WHERE observation_id=?",Integer.class,id)).isZero();
   assertThat(jdbc.queryForObject("SELECT attempts FROM health_evaluation_outbox WHERE observation_id=?",Integer.class,id)).isEqualTo(1);
   assertThat(jdbc.queryForObject("SELECT reason FROM health_evaluation_failures WHERE observation_id=?",String.class,id)).isEqualTo("EVALUATION_FAILED");
  } finally { jdbc.execute("DROP TRIGGER "+name+" ON health_observation_evaluations"); jdbc.execute("DROP FUNCTION "+name+"()"); }
 }
 @Test void evaluationHistoryCannotBeOverwritten() {
  UUID id=observation("heart_rate",scope,"UNKNOWN",BigDecimal.ONE,start,false,null); drain();
  assertThatThrownBy(()->jdbc.update("UPDATE health_observation_evaluations SET outcome='WITHIN_BOUNDS' WHERE observation_id=?",id)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
 }
 private UUID rule(String indicator,String metric,UUID s,String context,String severity,String kind,BigDecimal lower,BigDecimal upper,boolean personal) {
  return tx(()->{ UUID id=createRule(indicator,metric,s,context,severity,kind,lower,upper,personal); rules.activation(id,true,start,"Fixture activation"); return id; });
 }
 private UUID createRule(String indicator,String metric,UUID s,String context,String severity,String kind,BigDecimal lower,BigDecimal upper,boolean personal) {
  signIn(officer); String unit=unit(indicator,metric);
  return rules.create(new MonitoringRuleRequest("eval-"+UUID.randomUUID(),personal?subject:null,indicator,metric,unit,context,s,lower,upper,kind,severity,"OPERATIONAL",start,null,"Fixture","fixture:nonclinical-test","Fixture only","Fixture officer approval"));
 }
 private UUID observation(String indicator,UUID s,String context,BigDecimal value,Instant at,boolean synthetic,UUID previous) {
  return tx(()->{
   UUID id=header(indicator,s,context,at,synthetic,previous);
   switch(indicator) {
    case "blood_pressure" -> jdbc.update("INSERT INTO blood_pressure_observations(observation_id,systolic,diastolic) VALUES (?,?,?)",id,value,value);
    case "muscle" -> jdbc.update("INSERT INTO muscle_assessments(observation_id,grip_strength_kgf,muscle_mass_kg) VALUES (?,?,?)",id,value,value);
    case "mood" -> jdbc.update("INSERT INTO mood_assessments(observation_id,score) VALUES (?,?)",id,value);
    case "bone_mineral_density" -> jdbc.update("INSERT INTO bone_density_examinations(observation_id,areal_density) VALUES (?,?)",id,value);
    case "sleep_hours" -> jdbc.update("INSERT INTO sleep_sessions(observation_id,started_at,ended_at,asleep_seconds) VALUES (?,?,?,?)",id,Timestamp.from(at.minusSeconds(86400)),Timestamp.from(at),value.multiply(new BigDecimal("3600")).intValueExact());
    default -> jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,?,?,?)",id,indicator,value,unit(indicator,"value"));
   }
   enqueue(id); return id;
  });
 }
 private UUID header(String indicator,UUID s,String context,Instant at,boolean synthetic,UUID previous) {
  return jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,simulation_metadata,supersedes_observation_id,correction_reason) SELECT ?,code,storage_kind,?,?,?,?,?,?::jsonb,?,? FROM health_indicators WHERE code=? RETURNING id",UUID.class,subject,s,context,Timestamp.from(at),synthetic?"SIMULATION":"DEVICE","Fixture",synthetic?"{\"synthetic\":true}":null,previous,previous==null?null:"Fixture revision",indicator);
 }
 private UUID scope(String indicator,boolean synthetic) {
  return jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,protocol_code,protocol_version,scale_name,scale_version,scale_min,scale_max,radiation_astronaut_id,accumulation_started_at,dosimetry_method) SELECT ?,code,storage_kind,CASE WHEN storage_kind IN ('MUSCLE','BONE') OR code='cumulative_absorbed_radiation_dose' THEN 'Fixture site' END,CASE WHEN storage_kind IN ('MUSCLE','BONE') THEN 'Fixture protocol' END,CASE WHEN storage_kind IN ('MUSCLE','BONE') THEN '1' END,CASE WHEN storage_kind='MOOD' THEN 'Fixture scale' END,CASE WHEN storage_kind='MOOD' THEN '1' END,CASE WHEN storage_kind='MOOD' THEN 0 END,CASE WHEN storage_kind='MOOD' THEN 100 END,CASE WHEN code='cumulative_absorbed_radiation_dose' THEN ?::uuid END,CASE WHEN code='cumulative_absorbed_radiation_dose' THEN ?::timestamptz END,CASE WHEN code='cumulative_absorbed_radiation_dose' THEN 'Fixture dosimetry' END FROM health_indicators WHERE code=? RETURNING id",UUID.class,(synthetic?"synthetic-":"fixture-")+UUID.randomUUID(),subject,Timestamp.from(start.minusSeconds(100)),indicator);
 }
 private void enqueue(UUID id) { new ObservationEvaluationOutbox(jdbc,true).enqueueNewObservation(id); }
 private void drain() { SecurityContextHolder.clearContext(); for(int count=0;count<100 && engine.processNext();count++) { } }
 private Map<String,Object> result(UUID id,String metric) { return jdbc.queryForMap("SELECT * FROM health_observation_evaluations WHERE observation_id=? AND metric_code=?",id,metric); }
 private String unit(String indicator,String metric) { return jdbc.queryForObject("SELECT unit FROM indicator_metrics WHERE indicator_code=? AND metric_code=?",String.class,indicator,metric); }
 private AccountIdentity identity() { Account a=accounts.saveAndFlush(new Account("eval."+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),AccountRole.NASA_OFFICER,null)); return new AccountIdentity(a.getId(),a.getLoginName(),a.getRole(),null); }
 private void signIn(AccountIdentity a) { SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(a)); }
 private <T>T tx(Supplier<T> action) { return new TransactionTemplate(manager).execute(status->action.get()); }
}
