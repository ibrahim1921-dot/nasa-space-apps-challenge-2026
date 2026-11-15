package com.augustine.nasa_space_app_backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Trusted background consumer. No HTTP or user-supplied rule/value entry point. */
@Service
public class HealthObservationEvaluator {
 private final JdbcTemplate jdbc;
 private final MonitoringRuleService rules;
 private final ObjectMapper json;
 private final Clock clock;
 public HealthObservationEvaluator(JdbcTemplate jdbc,MonitoringRuleService rules,ObjectMapper json,Clock clock) {
  this.jdbc=jdbc; this.rules=rules; this.json=json; this.clock=clock;
 }
 /** One observation, all of its metrics, and job completion commit atomically. */
 @Transactional(propagation=Propagation.REQUIRES_NEW,timeout=30)
 public boolean processNext() {
  var jobs=jdbc.queryForList("SELECT observation_id FROM health_evaluation_outbox WHERE completed_at IS NULL AND next_attempt_at<=CURRENT_TIMESTAMP ORDER BY queued_at,observation_id FOR UPDATE SKIP LOCKED LIMIT 1");
  if(jobs.isEmpty()) return false;
  UUID id=(UUID)jobs.get(0).get("observation_id");
  try {
   evaluate(id);
   jdbc.update("UPDATE health_evaluation_outbox SET completed_at=clock_timestamp() WHERE observation_id=?",id);
  } catch(RuntimeException failure) { throw new EvaluationFailure(id,failure); }
  return true;
 }
 public static final class EvaluationFailure extends RuntimeException {
  private final UUID observationId;
  EvaluationFailure(UUID id,RuntimeException cause) { super("Observation evaluation failed.",cause); observationId=id; }
  public UUID observationId() { return observationId; }
 }
 private void evaluate(UUID id) {
  var o=jdbc.queryForMap("SELECT o.*,o.provenance::text AS source_provenance,o.simulation_metadata::text AS source_simulation_metadata, "
   +"s.accumulation_started_at,(to_jsonb(s)::text ~* '(simulation|synthetic)' OR EXISTS(SELECT 1 FROM simulation_scope_provisioning_audit a WHERE a.scope_id=s.id)) AS synthetic_scope,"
   +"EXISTS(SELECT 1 FROM astronaut_checkins c WHERE c.id=o.checkin_id AND c.is_simulated) AS synthetic_checkin "
   +"FROM health_observations o JOIN measurement_comparison_scopes s ON s.id=o.comparison_scope_id WHERE o.id=?",id);
  UUID astronaut=(UUID)o.get("astronaut_id"),scope=(UUID)o.get("comparison_scope_id");
  String indicator=(String)o.get("indicator_code"),context=(String)o.get("activity_context");
  Instant at=((Timestamp)o.get("measured_at")).toInstant();
  boolean synthetic="SIMULATION".equals(o.get("source_kind")) || o.get("simulation_metadata")!=null
   || Boolean.TRUE.equals(o.get("synthetic_checkin"))
   || (o.get("source_provenance").toString()+o.get("source_name")).toLowerCase(Locale.ROOT).matches("(?s).*(synthetic|simulation).*");
  boolean syntheticScope=Boolean.TRUE.equals(o.get("synthetic_scope"));
  boolean syntheticData=synthetic || syntheticScope;
  boolean superseded=!jdbc.queryForList("SELECT id FROM health_observations WHERE supersedes_observation_id=?",id).isEmpty();
  var metrics=jdbc.queryForList("SELECT m.metric_code,m.unit,v.value FROM indicator_metrics m LEFT JOIN ("
   +"SELECT metric_code,unit,value FROM health_measurements WHERE observation_id=? UNION ALL "
   +"SELECT 'systolic',unit,systolic FROM blood_pressure_observations WHERE observation_id=? UNION ALL "
   +"SELECT 'diastolic',unit,diastolic FROM blood_pressure_observations WHERE observation_id=? UNION ALL "
   +"SELECT 'duration','h',asleep_seconds::numeric/3600 FROM sleep_sessions WHERE observation_id=? UNION ALL "
   +"SELECT 'score',unit,score FROM mood_assessments WHERE observation_id=? UNION ALL "
   +"SELECT 'grip_strength','kgf',grip_strength_kgf FROM muscle_assessments WHERE observation_id=? UNION ALL "
   +"SELECT 'muscle_mass','kg',muscle_mass_kg FROM muscle_assessments WHERE observation_id=? UNION ALL "
   +"SELECT 'areal_density',unit,areal_density FROM bone_density_examinations WHERE observation_id=?"
   +") v ON v.metric_code=m.metric_code AND v.unit=m.unit WHERE m.indicator_code=? ORDER BY m.metric_code",id,id,id,id,id,id,id,id,indicator);
  jdbc.queryForObject("SELECT set_config('astrohealth.actor','SYSTEM:HEALTH_RULE_ENGINE',true)",String.class);
  for(var metric:metrics) {
   String code=(String)metric.get("metric_code"),unit=(String)metric.get("unit");
   if(!jdbc.queryForList("SELECT id FROM health_observation_evaluations WHERE observation_id=? AND metric_code=?",id,code).isEmpty()) continue;
   BigDecimal value=(BigDecimal)metric.get("value");
   var details=new LinkedHashMap<String,Object>();
   details.put("engine_version","RULE_ENGINE_V1"); details.put("observation_id",id); details.put("astronaut_id",astronaut);
   details.put("indicator",indicator); details.put("metric",code); details.put("unit",unit); details.put("value",value);
   details.put("scope_id",scope); details.put("activity_context",context); details.put("measured_at",at.toString());
   details.put("source_kind",o.get("source_kind")); details.put("source_name",o.get("source_name"));
   details.put("source_provenance",json.readTree(o.get("source_provenance").toString()));
   if(o.get("source_simulation_metadata")!=null) details.put("simulation_metadata",json.readTree(o.get("source_simulation_metadata").toString()));
   details.put("synthetic",synthetic || syntheticScope); details.put("demonstration_only",synthetic || syntheticScope);
   details.put("clinical_emergency",false); // Engine classification is a rule violation, not a medical diagnosis.
   details.put("supersedes_observation_id",o.get("supersedes_observation_id"));
   Instant evaluatedAt=clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS); details.put("evaluated_at",evaluatedAt.toString());
   String outcome=null;
   MonitoringRuleResolver.Resolution selected=null;
   if(superseded) outcome="SUPERSEDED";
   else if(value==null) outcome="METRIC_UNAVAILABLE";
   else if((!synthetic && syntheticScope) || (synthetic && !syntheticScope && !rules.sharedDefaultScope(scope))) outcome="SYNTHETIC_MISMATCH";
   else if(indicator.equals("cumulative_absorbed_radiation_dose") && !validRadiation(id,scope,at,value,o.get("accumulation_started_at"))) outcome="INVALID_RADIATION";
   if(outcome==null) {
    try { selected=rules.resolveForEvaluation(astronaut,indicator,code,unit,context,scope,at,syntheticData); }
    catch(BaselineException invalid) { outcome=invalid.status()==409?"BASELINE_CONFLICT":"INVALID_RULE"; }
    if(outcome==null) outcome=selected.status().equals("SELECTED")?"WITHIN_BOUNDS":selected.status();
   }
   UUID alert=null;
   if(selected!=null) {
    details.put("rule_id",selected.ruleId()); details.put("rule_version",selected.version());
    details.put("baseline_id",selected.baselineId()); details.put("lower_bound",selected.lowerBound()); details.put("upper_bound",selected.upperBound());
    details.put("designation",selected.designation());
    if(selected.baselineId()!=null) details.put("baseline_version",jdbc.queryForObject("SELECT version FROM personal_baselines WHERE id=?",Integer.class,selected.baselineId()));
   }
   if(outcome.equals("WITHIN_BOUNDS") && ((selected.lowerBound()!=null && value.compareTo(selected.lowerBound())<0)
    || (selected.upperBound()!=null && value.compareTo(selected.upperBound())>0))) {
    if(!Set.of("INFO","WARNING","CRITICAL").contains(selected.severity()) || (syntheticData != "SYNTHETIC_DEMO".equals(selected.designation()))) outcome="INVALID_RULE";
    else {
     outcome="ALERT_CREATED";
     details.put("violation_direction",selected.lowerBound()!=null && value.compareTo(selected.lowerBound())<0?"BELOW_LOWER":"ABOVE_UPPER");
     alert=jdbc.queryForObject("INSERT INTO health_alerts(astronaut_id,astronaut_mission_id,checkin_id,severity,trigger_kind,monitoring_rule_id,source_name,reason,triggered_at,provenance,is_synthetic) "
      +"VALUES (?,?,?,?,'RULE',?,'ASTROHEALTH_RULE_ENGINE',?,?,?::jsonb,?) RETURNING id",UUID.class,astronaut,o.get("astronaut_mission_id"),o.get("checkin_id"),selected.severity(),selected.ruleId(),
      (syntheticData?"NONCLINICAL SYNTHETIC DEMO: ":"")+"Configured "+indicator+"/"+code+" rule violation",Timestamp.from(at),json.writeValueAsString(details),syntheticData);
     jdbc.update("INSERT INTO alert_observations(alert_id,observation_id,astronaut_id) VALUES (?,?,?)",alert,id,astronaut);
    }
   }
   jdbc.update("INSERT INTO health_observation_evaluations(observation_id,astronaut_id,metric_code,unit,outcome,rule_id,baseline_id,alert_id,evaluated_at,details) VALUES (?,?,?,?,?,?,?,?,?,?::jsonb)",
    id,astronaut,code,unit,outcome,selected==null?null:selected.ruleId(),selected==null?null:selected.baselineId(),alert,Timestamp.from(evaluatedAt),json.writeValueAsString(details));
  }
 }
 private boolean validRadiation(UUID id,UUID scope,Instant at,BigDecimal value,Object origin) {
  if(origin==null || ((Timestamp)origin).toInstant().isAfter(at)) return false;
  // Cumulative total in this exact origin/site/dosimetry scope; never sum observations.
  return !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM health_observations o JOIN health_measurements m ON m.observation_id=o.id WHERE o.comparison_scope_id=? AND o.id<>? "
   +"AND NOT EXISTS(SELECT 1 FROM health_observations c WHERE c.supersedes_observation_id=o.id) AND ((o.measured_at<? AND m.value>?) OR (o.measured_at>? AND m.value<?) OR (o.measured_at=? AND m.value<>?)))",Boolean.class,
   scope,id,Timestamp.from(at),value,Timestamp.from(at),value,Timestamp.from(at),value));
 }
}
