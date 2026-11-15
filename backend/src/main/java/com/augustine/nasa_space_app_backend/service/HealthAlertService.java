package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.dto.HealthAlertResponses.*;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional(readOnly=true)
public class HealthAlertService {
 private final JdbcTemplate jdbc;
 private final AuthService auth;
 private final AccountRepository accounts;
 private final AstronautService astronauts;
 private final Clock clock;
 private final ObjectMapper json;
 // Include legacy synthetic provenance/evidence without changing historical rows.
 private static final String SYNTHETIC="(a.is_synthetic OR EXISTS(SELECT 1 FROM monitoring_rules sr WHERE sr.id=a.monitoring_rule_id AND sr.designation='SYNTHETIC_DEMO') OR COALESCE(a.provenance->>'synthetic','false')='true' "
  +"OR COALESCE(a.provenance->>'demonstration_only','false')='true' OR EXISTS(SELECT 1 FROM alert_observations ae "
  +"JOIN health_observations o ON o.id=ae.observation_id JOIN measurement_comparison_scopes s ON s.id=o.comparison_scope_id "
  +"WHERE ae.alert_id=a.id AND (o.source_kind='SIMULATION' OR o.simulation_metadata IS NOT NULL "
  +"OR (o.provenance::text || o.source_name || to_jsonb(s)::text) ~* '(simulation|synthetic)' "
  +"OR EXISTS(SELECT 1 FROM astronaut_checkins c WHERE c.id=o.checkin_id AND c.is_simulated) "
  +"OR EXISTS(SELECT 1 FROM simulation_scope_provisioning_audit p WHERE p.scope_id=s.id))))";
 private static final String SELECT="SELECT a.id,a.astronaut_id,a.severity,a.status,a.trigger_kind,a.reason,a.triggered_at,a.created_at,"
  +"a.acknowledged_at,a.resolved_at,a.resolution_note,a.monitoring_rule_id,"+SYNTHETIC+" AS synthetic FROM health_alerts a ";
 public HealthAlertService(JdbcTemplate jdbc,AuthService auth,AccountRepository accounts,AstronautService astronauts,Clock clock,ObjectMapper json) {
  this.jdbc=jdbc; this.auth=auth; this.accounts=accounts; this.astronauts=astronauts; this.clock=clock; this.json=json;
 }
 @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
 public Page mine(Filter filter) {
  var actor=identity(false);
  if(actor.role()!=AccountRole.ASTRONAUT) throw denied();
  if(filter!=null && filter.astronautId()!=null) throw invalid();
  return list(filter,actor.profile().astronautId());
 }
 @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
 public Page officerAlerts(Filter filter) {
  if(identity(false).role()!=AccountRole.NASA_OFFICER) throw denied();
  return list(filter,filter==null?null:filter.astronautId());
 }
 private Page list(Filter f,UUID subject) {
  if(f==null) f=new Filter(null,null,null,null,null,null,null,null,null,null);
  int page=f.page()==null?0:f.page(),size=f.size()==null?20:f.size();
  if(page<0 || page>10000 || size<1 || size>100) throw invalid();
  member(f.severity(),Set.of("INFO","WARNING","CRITICAL"));
  member(f.status(),Set.of("OPEN","ACKNOWLEDGED","RESOLVED"));
  member(f.triggerType(),Set.of("RULE","SELF_REPORT","ML","MANUAL"));
  if(f.synthetic()!=null && !Set.of("true","false").contains(f.synthetic())) throw invalid();
  if(f.indicator()!=null && (f.indicator().isBlank() || !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM health_indicators WHERE code=?)",Boolean.class,f.indicator())))) throw invalid();
  finite(f.from()); finite(f.to());
  if(f.from()!=null && f.to()!=null && !f.from().isBefore(f.to())) throw invalid();
  if(subject!=null) astronauts.getAstronautById(subject);
  var args=new ArrayList<Object>(); StringBuilder where=new StringBuilder(" WHERE true");
  if(subject!=null) add(where,args,"a.astronaut_id=?",subject);
  if(f.severity()!=null) add(where,args,"a.severity=?",f.severity());
  if(f.status()!=null) add(where,args,"a.status=?",f.status());
  if(f.triggerType()!=null) add(where,args,"a.trigger_kind=?",f.triggerType());
  if(f.synthetic()!=null) add(where,args,SYNTHETIC+"=?",Boolean.valueOf(f.synthetic()));
  if(f.from()!=null) add(where,args,"a.triggered_at>=?",Timestamp.from(f.from()));
  if(f.to()!=null) add(where,args,"a.triggered_at<?",Timestamp.from(f.to()));
  if(f.indicator()!=null) {
   where.append(" AND (EXISTS(SELECT 1 FROM monitoring_rules r WHERE r.id=a.monitoring_rule_id AND (r.astronaut_id IS NULL OR r.astronaut_id=a.astronaut_id) AND r.indicator_code=?) OR EXISTS(SELECT 1 FROM alert_observations ae JOIN health_observations o ON o.id=ae.observation_id WHERE ae.alert_id=a.id AND o.indicator_code=?))");
   args.add(f.indicator()); args.add(f.indicator());
  }
  long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM health_alerts a"+where,Long.class,args.toArray()));
  args.add(size); args.add((long)page*size);
  var rows=jdbc.queryForList(SELECT+where+" ORDER BY a.triggered_at DESC,a.id DESC LIMIT ? OFFSET ?",args.toArray());
  // Current crew policy allows officers to read all profiles, including archived profiles.
  // Reuse the policy for every subject returned rather than creating a separate alert policy.
  rows.stream().map(r->(UUID)r.get("astronaut_id")).distinct().forEach(astronauts::getAstronautById);
  return new Page(rows.stream().map(this::summary).toList(),page,size,total,(total+size-1)/size,((long)page+1)*size<total);
 }
 @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
 public Detail detail(UUID id) { return detail(scoped(id,identity(false),false)); }
 @Transactional
 public Detail acknowledge(UUID id) {
  var actor=identity(true); var row=scoped(id,actor,true);
  String status=(String)row.get("status");
  if(status.equals("RESOLVED")) throw conflict("Resolved alerts cannot be acknowledged again.");
  if(status.equals("ACKNOWLEDGED")) return detail(row);
  Instant now=transitionTime(row);
  auditActor(actor);
  jdbc.update("UPDATE health_alerts SET status='ACKNOWLEDGED',acknowledged_at=?,acknowledged_by=? WHERE id=?",Timestamp.from(now),actor.accountId().toString(),id);
  return detail(scoped(id,actor,false));
 }
 @Transactional
 public Detail resolve(UUID id,String note) {
  var actor=identity(true);
  if(actor.role()!=AccountRole.NASA_OFFICER) throw denied();
  if(note==null || note.isBlank() || note.length()>2000) throw invalid();
  var row=scoped(id,actor,true);
  if(row.get("status").equals("RESOLVED")) {
   if(!note.equals(row.get("resolution_note"))) throw conflict("Resolution is already recorded with a different note.");
   return detail(row);
  }
  if(!row.get("status").equals("ACKNOWLEDGED")) throw conflict("Acknowledge the alert before resolving it.");
  Instant now=transitionTime(row);
  auditActor(actor);
  jdbc.update("UPDATE health_alerts SET status='RESOLVED',resolved_at=?,resolved_by=?,resolution_note=? WHERE id=?",Timestamp.from(now),actor.accountId().toString(),note,id);
  return detail(scoped(id,actor,false));
 }
 private Map<String,Object> scoped(UUID id,AccountIdentity actor,boolean lock) {
  if(id==null) throw invalid();
  var args=new ArrayList<Object>(); args.add(id);
  String scope=" WHERE a.id=?";
  if(actor.role()==AccountRole.ASTRONAUT) {scope+=" AND a.astronaut_id=?"; args.add(actor.profile().astronautId());}
  else if(actor.role()!=AccountRole.NASA_OFFICER) throw denied();
  var rows=jdbc.queryForList(SELECT+scope+(lock?" FOR UPDATE OF a":""),args.toArray());
  if(rows.isEmpty()) throw new HealthAlertException(404,"Health alert not found.");
  astronauts.getAstronautById((UUID)rows.get(0).get("astronaut_id"));
  return rows.get(0);
 }
 private Detail detail(Map<String,Object> row) {
  UUID id=(UUID)row.get("id");
  var ruleRows=jdbc.queryForList("SELECT id,version,indicator_code,metric_code,unit,designation,limit_kind,lower_bound,upper_bound FROM monitoring_rules WHERE id=? AND (astronaut_id IS NULL OR astronaut_id=?)",row.get("monitoring_rule_id"),row.get("astronaut_id"));
  Rule rule=ruleRows.isEmpty()?null:rule(ruleRows.get(0));
  var evaluationRows=jdbc.queryForList("SELECT e.id,e.observation_id,e.evaluated_at,e.baseline_id AS referenced_baseline_id,e.details::text AS details,b.id AS baseline_id,b.version,b.baseline_kind,b.reference_value,b.unit FROM health_observation_evaluations e LEFT JOIN personal_baseline_approvals p ON p.baseline_id=e.baseline_id LEFT JOIN personal_baselines b ON b.id=p.baseline_id AND b.astronaut_id=e.astronaut_id WHERE e.alert_id=? AND e.astronaut_id=?",id,row.get("astronaut_id"));
  Evaluation evaluation=null; Baseline baseline=null;
  if(!evaluationRows.isEmpty()) {
   var e=evaluationRows.get(0);
   var bounds=json.readTree(e.get("details").toString());
   boolean scopedBaseline=e.get("referenced_baseline_id")==null || e.get("baseline_id")!=null;
   evaluation=new Evaluation((UUID)e.get("id"),(UUID)e.get("observation_id"),instant(e,"evaluated_at"),scopedBaseline?number(bounds.get("lower_bound")):null,scopedBaseline?number(bounds.get("upper_bound")):null);
   if(e.get("baseline_id")!=null) baseline=new Baseline((UUID)e.get("baseline_id"),((Number)e.get("version")).intValue(),(String)e.get("baseline_kind"),(BigDecimal)e.get("reference_value"),(String)e.get("unit"));
  }
  var evidence=jdbc.queryForList("SELECT o.id,o.indicator_code,o.activity_context,o.comparison_scope_id,o.measured_at,o.source_kind,o.supersedes_observation_id,"
   +"(o.source_kind='SIMULATION' OR o.simulation_metadata IS NOT NULL OR (o.provenance::text || o.source_name || to_jsonb(s)::text) ~* '(simulation|synthetic)' "
   +"OR EXISTS(SELECT 1 FROM astronaut_checkins c WHERE c.id=o.checkin_id AND c.is_simulated) OR EXISTS(SELECT 1 FROM simulation_scope_provisioning_audit p WHERE p.scope_id=s.id)) AS synthetic "
   +"FROM alert_observations ae JOIN health_observations o ON o.id=ae.observation_id JOIN measurement_comparison_scopes s ON s.id=o.comparison_scope_id WHERE ae.alert_id=? AND ae.astronaut_id=? ORDER BY o.measured_at DESC,o.id DESC",id,row.get("astronaut_id"));
  List<Evidence> observations=evidence.stream().map(o->new Evidence((UUID)o.get("id"),(String)o.get("indicator_code"),(String)o.get("activity_context"),(UUID)o.get("comparison_scope_id"),instant(o,"measured_at"),(String)o.get("source_kind"),Boolean.TRUE.equals(o.get("synthetic")),(UUID)o.get("supersedes_observation_id"),measurements((UUID)o.get("id")))).toList();
  List<Event> events=jdbc.queryForList("SELECT event_kind,occurred_at FROM health_alert_events WHERE alert_id=? ORDER BY event_sequence",id).stream().map(e->new Event((String)e.get("event_kind"),instant(e,"occurred_at"))).toList();
  return new Detail(summary(row),observations,rule,baseline,evaluation,(String)row.get("resolution_note"),events);
 }
 private List<Measurement> measurements(UUID id) {
  return jdbc.queryForList("SELECT metric,unit,value FROM (SELECT metric_code AS metric,unit,value FROM health_measurements WHERE observation_id=? UNION ALL SELECT 'systolic',unit,systolic FROM blood_pressure_observations WHERE observation_id=? UNION ALL SELECT 'diastolic',unit,diastolic FROM blood_pressure_observations WHERE observation_id=? UNION ALL SELECT 'duration','h',asleep_seconds::numeric/3600 FROM sleep_sessions WHERE observation_id=? UNION ALL SELECT 'score',unit,score FROM mood_assessments WHERE observation_id=? UNION ALL SELECT 'grip_strength','kgf',grip_strength_kgf FROM muscle_assessments WHERE observation_id=? UNION ALL SELECT 'muscle_mass','kg',muscle_mass_kg FROM muscle_assessments WHERE observation_id=? UNION ALL SELECT 'areal_density',unit,areal_density FROM bone_density_examinations WHERE observation_id=?) v WHERE value IS NOT NULL ORDER BY metric",id,id,id,id,id,id,id,id).stream().map(m->new Measurement((String)m.get("metric"),(String)m.get("unit"),(BigDecimal)m.get("value"))).toList();
 }
 private Summary summary(Map<String,Object> row) {
  List<String> indicators=jdbc.queryForList("SELECT indicator_code FROM monitoring_rules WHERE id=? AND (astronaut_id IS NULL OR astronaut_id=?) UNION SELECT o.indicator_code FROM alert_observations ae JOIN health_observations o ON o.id=ae.observation_id WHERE ae.alert_id=? AND ae.astronaut_id=? ORDER BY indicator_code",String.class,row.get("monitoring_rule_id"),row.get("astronaut_id"),row.get("id"),row.get("astronaut_id"));
  boolean synthetic=Boolean.TRUE.equals(row.get("synthetic"));
  return new Summary((UUID)row.get("id"),(UUID)row.get("astronaut_id"),(String)row.get("severity"),(String)row.get("status"),(String)row.get("trigger_kind"),synthetic,synthetic,(String)row.get("reason"),instant(row,"triggered_at"),instant(row,"created_at"),instant(row,"acknowledged_at"),instant(row,"resolved_at"),indicators);
 }
 private AccountIdentity identity(boolean write) {
  var a=SecurityContextHolder.getContext().getAuthentication();
  if(a==null || !a.isAuthenticated() || !(a.getPrincipal() instanceof AccountPrincipal p)) throw new AuthenticationCredentialsNotFoundException("Authentication required.");
  if(write) accounts.findLockedById(p.accountId()).orElseThrow(HealthAlertService::denied);
  return auth.currentIdentity(p.accountId());
 }
 private void auditActor(AccountIdentity actor) { jdbc.queryForObject("SELECT set_config('astrohealth.actor',?,true)",String.class,actor.accountId().toString()); }
 private Instant transitionTime(Map<String,Object> row) {
  Instant now=clock.instant().truncatedTo(ChronoUnit.MICROS);
  if(now.isBefore(instant(row,"triggered_at")) || (instant(row,"acknowledged_at")!=null && now.isBefore(instant(row,"acknowledged_at")))) throw conflict("Alert lifecycle time is in the future.");
  return now;
 }
 private static Rule rule(Map<String,Object> r) { return new Rule((UUID)r.get("id"),((Number)r.get("version")).intValue(),(String)r.get("indicator_code"),(String)r.get("metric_code"),(String)r.get("unit"),(String)r.get("designation"),(String)r.get("limit_kind"),(BigDecimal)r.get("lower_bound"),(BigDecimal)r.get("upper_bound")); }
 private static BigDecimal number(tools.jackson.databind.JsonNode node) { return node!=null && node.isNumber()?node.decimalValue():null; }
 private static Instant instant(Map<String,Object> row,String name) { return row.get(name)==null?null:((Timestamp)row.get(name)).toInstant(); }
 private static void add(StringBuilder where,List<Object> args,String clause,Object value) { where.append(" AND ").append(clause); args.add(value); }
 private static void member(String value,Set<String> allowed) { if(value!=null && !allowed.contains(value)) throw invalid(); }
 private static void finite(Instant at) { if(at!=null && (at.isBefore(Instant.parse("0001-01-01T00:00:00Z")) || at.isAfter(Instant.parse("9999-12-31T23:59:59Z")) || at.getNano()%1000!=0)) throw invalid(); }
 private static AccessDeniedException denied() { return new AccessDeniedException("Health alert access is not permitted."); }
 private static HealthAlertException invalid() { return new HealthAlertException(400,"Invalid alert filter, pagination, time range or resolution note."); }
 private static HealthAlertException conflict(String message) { return new HealthAlertException(409,message); }
}
